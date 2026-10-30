// Entry point. Configuration comes from environment variables (Hostinger → Node.js app → Environment),
// or from a private clean-sense-config/system.env on the server (see below), which takes precedence:
//   SESSION_SECRET                 required, 32+ random characters
//   STORE=mysql                    main store (recommended): MySQL on Hostinger
//   DATABASE_URL                   mysql://user:password@host:3306/database (for STORE=mysql)
//   STORE=sheets                   use Google Sheets (default: local file ./data/db.json)
//   SPREADSHEET_ID                 the database spreadsheet ID
//   GOOGLE_SERVICE_ACCOUNT_JSON    service-account key JSON (raw or base64)
//   OWNER_USERNAME / OWNER_PASSWORD  only used on first run, when there are no users yet
//   MIRROR_SPREADSHEET_ID          optional: read-only Google Sheets copy of all tables (uses the service account)
//   MIRROR_MINUTES                 how often the copy refreshes (default 15)
//   IMPORT_FROM                    one-time: sheets | backup:<file> → copied into the EMPTY MySQL database at start
//   BACKUP_DIR                    optional: daily gzip JSON backup of every table (keeps 30); use a folder
//                                  outside the app folder so a redeploy never removes it; the first
//                                  backup of each week is also kept in BACKUP_DIR/weekly (12 weeks)
//   DRIVE_BACKUP_FOLDER_ID         optional: off-site copy of each weekly backup, in a folder of a Google
//                                  Workspace shared drive where the service account is a member
//   PORTAL_ORIGIN                  optional: address in residents' and contractors' sign-in links
//                                  (e.g. https://portal.cleansense.co); default: the address in use
//   OPEN_ACCESS=1                  temporary: no sign-in, every visitor acts as the owner
//   PORT                           set by the host

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createApp } from './app.js';
import { SheetsMirror } from './mirror.js';
import { writeBackup, readBackup, hasBackupToday, keepWeekly } from './backup.js';
import { uploadToDrive } from './drive.js';
import { SheetsBackend } from './sheets.js';
import { importIntoMysql } from './migrate.js';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { parseEnv } from 'node:util';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
// Hostinger's runtime log page only shows stderr, so milestones go there too.
const notice = (...args) => console.error('NOTICE', ...args);

// Optional private settings file outside the app folder (not web-reachable, survives redeploys).
// Its values win over the hosting panel's variables, which proved unreliable to update.
// Looked for in: CONFIG_FILE, ~/clean-sense-config/, then the site folder above hbuilds/ (where
// Hostinger's File Manager opens; outside public_html, so never served).
const siteDir = here.includes('/hbuilds/') ? here.split('/hbuilds/')[0] : '';
const configFile = [env.CONFIG_FILE, join(homedir(), 'clean-sense-config', 'system.env'), siteDir && join(siteDir, 'clean-sense-config', 'system.env')]
  .filter(Boolean).find((f) => existsSync(f));
if (configFile) {
  Object.assign(env, parseEnv(readFileSync(configFile, 'utf8').replace(/^﻿/, '')));
  notice('settings loaded from', configFile);
  // Non-secret settings (e.g. MIRROR_SPREADSHEET_ID) in app.json beside it; they only fill gaps.
  const appJson = join(dirname(configFile), 'app.json');
  if (existsSync(appJson)) {
    try {
      for (const [k, v] of Object.entries(JSON.parse(readFileSync(appJson, 'utf8')))) if (!env[k] && /^[A-Z][A-Z0-9_]*$/.test(k)) env[k] = String(v);
      notice('settings loaded from', appJson);
    } catch (e) {
      console.error('app.json ignored:', e.message);
    }
  }
}
const openAccess = env.OPEN_ACCESS === '1';

if (env.STORE === 'mysql' && !env.DATABASE_URL) throw new Error('STORE=mysql needs DATABASE_URL (mysql://user:password@127.0.0.1:3306/database)');
// Values pasted or imported into hosting panels can carry quotes, spaces or a trailing \r.
const databaseUrl = String(env.DATABASE_URL || '').trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim();
if (env.STORE === 'mysql') {
  // Safe fingerprint for "Access denied" debugging: never the password, only its length and a short hash.
  try {
    const u = new URL(databaseUrl);
    const pw = decodeURIComponent(u.password);
    const fp = createHash('sha256').update(pw).digest('hex').slice(0, 8);
    notice(`DB target user=${decodeURIComponent(u.username)} host=${u.hostname}:${u.port || 3306} db=${u.pathname.slice(1)} password_length=${pw.length} password_fp=${fp}`);
  } catch {
    notice('DATABASE_URL is not a valid URL');
  }
}

function serviceAccount() {
  const raw = (env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

const store = new Store(
  env.STORE === 'mysql'
    ? { kind: 'mysql', url: databaseUrl }
    : env.STORE === 'sheets'
      ? { kind: 'sheets', spreadsheetId: env.SPREADSHEET_ID, credentials: serviceAccount() }
      : { kind: 'file', file: env.DATA_FILE || join(here, '..', 'data', 'db.json') },
);
await store.init();

// One-time move into MySQL on the server, so the database password never leaves Hostinger.
// IMPORT_FROM=sheets (needs SPREADSHEET_ID + GOOGLE_SERVICE_ACCOUNT_JSON; the Sheet is only read)
// or IMPORT_FROM=backup:/path/file.json.gz. Runs only while the database is empty: once data is
// there, it is skipped, so leaving the variable set by mistake does nothing. Remove it afterwards.
if (env.IMPORT_FROM && store.kind === 'mysql') {
  const empty = Object.values(store.tables).every((rows) => rows.length === 0);
  if (!empty) {
    console.warn('IMPORT_FROM ignored: the database already has data. Remove IMPORT_FROM.');
  } else {
    const source = env.IMPORT_FROM === 'sheets'
      ? await new SheetsBackend({ spreadsheetId: env.SPREADSHEET_ID, credentials: serviceAccount(), readOnly: true }).loadAll()
      : readBackup(env.IMPORT_FROM.replace(/^backup:/, '')).tables;
    try {
      const totals = await importIntoMysql(store.backend, source);
      await store.init();
      notice('IMPORT OK: all rows and amount totals match', JSON.stringify(totals));
    } catch (e) {
      // Stop instead of running on half-copied data; the transaction left the database empty.
      console.error('IMPORT FAILED, nothing was kept:', e.message);
      process.exit(1);
    }
  }
}

// Make sure an owner can sign in. Imported data may hold only inactive role templates
// (no username, no password), so "no users at all" is not the right test.
const owners = store.list('users').filter((u) => u.role === 'owner' && u.active !== 'no');
if (!owners.some((u) => u.username && u.password_hash) && !(openAccess && owners.length)) {
  const username = (env.OWNER_USERNAME || 'owner').toLowerCase();
  const password = env.OWNER_PASSWORD;
  if (!password && !openAccess) throw new Error('No owner can sign in: set OWNER_PASSWORD (and OWNER_USERNAME) to create the owner account');
  if (store.list('users', { includeDeleted: true }).some((u) => String(u.username).toLowerCase() === username)) {
    throw new Error(`OWNER_USERNAME "${username}" is already used by another account: choose another one`);
  }
  const ids = new Set(store.list('users', { includeDeleted: true }).map((u) => u.id));
  await store.insert('users', {
    id: ids.has('US-OWNER') ? `US-OWNER-${Date.now().toString(36).toUpperCase()}` : 'US-OWNER', name: 'معاذ', username, job_title: 'المالك', role: 'owner', permissions: '',
    language: 'ar', active: 'yes', password_hash: password ? bcrypt.hashSync(password, 10) : '', must_change_password: 'yes',
  });
  notice(`Owner account created: ${username} (must change password at first login)`);
}

// Forgotten owner password: put a file named reset-owner (holding the username) in the
// private config folder and restart. The temporary password goes to owner-temp-password.txt
// beside it, never to the log, and that file is removed once the owner sets a new password.
const configDir = configFile ? dirname(configFile) : '';
const tempPasswordFile = configDir && join(configDir, 'owner-temp-password.txt');
if (configDir && existsSync(join(configDir, 'reset-owner'))) {
  const uname = readFileSync(join(configDir, 'reset-owner'), 'utf8').trim().toLowerCase();
  unlinkSync(join(configDir, 'reset-owner'));
  const u = store.list('users').find((x) => x.role === 'owner' && x.active !== 'no' && String(x.username).toLowerCase() === uname);
  if (u) {
    const temp = randomBytes(6).toString('base64url');
    await store.patch('users', u.id, { password_hash: bcrypt.hashSync(temp, 10), must_change_password: 'yes' });
    writeFileSync(tempPasswordFile, `username: ${u.username}\ntemporary password: ${temp}\n`, { mode: 0o600 });
    notice(`password reset for ${u.username}: temporary password written to ${tempPasswordFile}`);
  } else {
    notice(`reset-owner ignored: no active owner named "${uname}"`);
  }
}

// Pick up manual edits made directly in the spreadsheet or in phpMyAdmin.
if (store.kind !== 'file') {
  setInterval(() => {
    store.run(async () => {
      const fresh = await store.backend.loadAll();
      for (const t of Object.keys(fresh)) store.tables[t] = fresh[t];
    }).catch((e) => console.error('refresh failed', e.message));
  }, 5 * 60 * 1000).unref();
}

// Daily backups: BACKUP_DIR, or by default a private folder next to the app on Hostinger
// (outside public_html and hbuilds/, so never served and kept across redeploys).
const backupDir = env.BACKUP_DIR || (siteDir && store.kind !== 'file' ? join(siteDir, 'clean-sense-backups') : '');
if (backupDir) {
  // Hostinger stops idle apps, so check soon after every start and then hourly; one backup per day.
  const backup = () => {
    if (hasBackupToday(backupDir)) return;
    store.run(() => writeBackup(store, backupDir))
      .then(async (f) => {
        notice('backup written', f);
        // First backup of the week is also kept weekly (12 weeks) and, when set up, copied off Hostinger.
        const weekly = keepWeekly(backupDir, f);
        if (weekly && env.DRIVE_BACKUP_FOLDER_ID) {
          const up = await uploadToDrive({ credentials: serviceAccount(), folderId: env.DRIVE_BACKUP_FOLDER_ID, file: weekly });
          notice('weekly backup copied to Google Drive', up.name, up.size);
        }
      })
      .catch((e) => console.error('backup failed', e.message));
  };
  setTimeout(backup, 30 * 1000).unref();
  setInterval(backup, 60 * 60 * 1000).unref();
}

let mirror = null;
if (env.MIRROR_SPREADSHEET_ID) {
  mirror = new SheetsMirror({ spreadsheetId: env.MIRROR_SPREADSHEET_ID, credentials: serviceAccount(), mainSpreadsheetId: env.SPREADSHEET_ID });
  const every = Math.max(5, Number(env.MIRROR_MINUTES) || 15) * 60 * 1000;
  const tick = () => mirror.push(store).then((r) => { if (!r.ok) console.error('mirror failed', r.error); });
  setTimeout(tick, 30 * 1000).unref();
  setInterval(tick, every).unref();
}

const app = createApp({
  store,
  mirror,
  secret: env.SESSION_SECRET,
  secureCookies: env.NODE_ENV !== 'development',
  webDist: join(here, '..', 'web', 'dist'),
  extraOrigins: (env.EXTRA_ORIGINS || '').split(',').filter(Boolean),
  portalOrigin: env.PORTAL_ORIGIN || '',
  openAccess,
  onPasswordChanged: () => {
    if (tempPasswordFile && existsSync(tempPasswordFile)) unlinkSync(tempPasswordFile);
  },
});
if (openAccess) console.warn('OPEN_ACCESS=1: sign-in is disabled, every visitor acts as the owner. Turn it off before real use.');
const port = Number(env.PORT) || 3000;
app.listen(port, () => notice(`Clean Sense system on :${port} (store: ${store.kind})`));

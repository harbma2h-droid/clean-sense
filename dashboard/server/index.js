// Entry point. Configuration comes from environment variables (Hostinger → Node.js app → Environment):
//   SESSION_SECRET                 required, 32+ random characters
//   STORE=mysql                    main store (recommended): MySQL on Hostinger
//   DATABASE_URL                   mysql://user:password@host:3306/database (for STORE=mysql)
//   STORE=sheets                   use Google Sheets (default: local file ./data/db.json)
//   SPREADSHEET_ID                 the database spreadsheet ID
//   GOOGLE_SERVICE_ACCOUNT_JSON    service-account key JSON (raw or base64)
//   OWNER_USERNAME / OWNER_PASSWORD  only used on first run, when there are no users yet
//   MIRROR_SPREADSHEET_ID          optional: read-only Google Sheets copy of all tables (uses the service account)
//   MIRROR_MINUTES                 how often the copy refreshes (default 15)
//   BACKUP_DIR                     optional: daily gzip JSON backup of every table (keeps 30); use a folder
//                                  outside the app folder so a redeploy never removes it
//   OPEN_ACCESS=1                  temporary: no sign-in, every visitor acts as the owner
//   PORT                           set by the host

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Store } from './store.js';
import { createApp } from './app.js';
import { SheetsMirror } from './mirror.js';
import { writeBackup } from './backup.js';
import bcrypt from 'bcryptjs';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const openAccess = env.OPEN_ACCESS === '1';

function serviceAccount() {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

const store = new Store(
  env.STORE === 'mysql'
    ? { kind: 'mysql', url: env.DATABASE_URL }
    : env.STORE === 'sheets'
      ? { kind: 'sheets', spreadsheetId: env.SPREADSHEET_ID, credentials: serviceAccount() }
      : { kind: 'file', file: env.DATA_FILE || join(here, '..', 'data', 'db.json') },
);
await store.init();

if (!store.list('users').length) {
  const username = (env.OWNER_USERNAME || 'owner').toLowerCase();
  const password = env.OWNER_PASSWORD;
  if (!password && !openAccess) throw new Error('First run: set OWNER_PASSWORD to create the owner account');
  await store.insert('users', {
    id: 'US-OWNER', name: 'معاذ', username, job_title: 'المالك', role: 'owner', permissions: '',
    language: 'ar', active: 'yes', password_hash: password ? bcrypt.hashSync(password, 10) : '', must_change_password: 'yes',
  });
  console.log(`Owner account created: ${username} (must change password at first login)`);
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

if (env.BACKUP_DIR) {
  const backup = () => store.run(() => writeBackup(store, env.BACKUP_DIR))
    .then((f) => console.log('backup written', f))
    .catch((e) => console.error('backup failed', e.message));
  setTimeout(backup, 2 * 60 * 1000).unref();
  setInterval(backup, 24 * 60 * 60 * 1000).unref();
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
  openAccess,
});
if (openAccess) console.warn('OPEN_ACCESS=1: sign-in is disabled, every visitor acts as the owner. Turn it off before real use.');
const port = Number(env.PORT) || 3000;
app.listen(port, () => console.log(`Clean Sense system on :${port} (store: ${store.kind})`));

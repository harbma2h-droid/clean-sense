// Full backups of every table (deleted rows included) as gzip JSON files.
// Hostinger also backs up the MySQL database daily; these files are a second, portable copy
// that `system/migrate/to-mysql.mjs --from-backup` can restore into an empty database.

import { gzipSync, gunzipSync } from 'node:zlib';
import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';

export const BACKUP_FORMAT = 'clean-sense-backup';

export function exportAll(store) {
  const tables = {};
  for (const t of Object.keys(store.tables)) tables[t] = store.list(t, { includeDeleted: true });
  return { format: BACKUP_FORMAT, version: 1, at: new Date().toISOString(), source: store.kind, tables };
}

/** Writes cleansense-<timestamp>.json.gz and keeps the newest `keep` files. Returns the file path. */
export function writeBackup(store, dir, keep = 30) {
  mkdirSync(dir, { recursive: true });
  const data = exportAll(store);
  const file = join(dir, `cleansense-${data.at.replace(/[:.]/g, '-')}.json.gz`);
  writeFileSync(`${file}.tmp`, gzipSync(JSON.stringify(data)));
  renameSync(`${file}.tmp`, file);
  const old = readdirSync(dir).filter((f) => /^cleansense-.*\.json\.gz$/.test(f)).sort().reverse().slice(keep);
  for (const f of old) unlinkSync(join(dir, f));
  return file;
}

/** True when `dir` already holds a backup written today (UTC), so restarts don't pile them up. */
export function hasBackupToday(dir, today = new Date().toISOString().slice(0, 10)) {
  try {
    return readdirSync(dir).some((f) => f.startsWith(`cleansense-${today}`));
  } catch {
    return false;
  }
}

export function readBackup(file) {
  const raw = readFileSync(file);
  const data = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  if (data.format !== BACKUP_FORMAT || !data.tables) throw new Error(`${file}: not a Clean Sense backup`);
  return data;
}

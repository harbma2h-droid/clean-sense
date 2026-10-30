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

/** ISO week label, e.g. 2026-W44 (weeks start on Monday). */
export function isoWeek(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const week = Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/**
 * Weekly copy: the first daily backup of each week is also kept in <dir>/weekly for `keep`
 * weeks (default 12, about three months), longer than the 30 daily ones.
 * Returns the weekly file when one was written this call, else ''.
 */
export function keepWeekly(dir, dailyFile, keep = 12, now = new Date()) {
  const wdir = join(dir, 'weekly');
  mkdirSync(wdir, { recursive: true });
  const name = `cleansense-week-${isoWeek(now)}.json.gz`;
  const existing = readdirSync(wdir).filter((f) => /^cleansense-week-.*\.json\.gz$/.test(f));
  if (existing.includes(name)) return '';
  const target = join(wdir, name);
  writeFileSync(`${target}.tmp`, readFileSync(dailyFile));
  renameSync(`${target}.tmp`, target);
  for (const f of [...existing, name].sort().reverse().slice(keep)) unlinkSync(join(wdir, f));
  return target;
}

export function readBackup(file) {
  const raw = readFileSync(file);
  const data = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
  if (data.format !== BACKUP_FORMAT || !data.tables) throw new Error(`${file}: not a Clean Sense backup`);
  return data;
}

// Copy all data into an EMPTY MySQL database, then check that nothing was lost.
// Also the restore tool for the daily backups.
//
//   Source (one of):
//     --from-sheets   reads the Google Sheet read-only (SPREADSHEET_ID, GOOGLE_SERVICE_ACCOUNT_JSON)
//     --from-backup <file.json.gz>   a backup written by the system (BACKUP_DIR) or by this tool
//   Target: TARGET_DATABASE_URL=mysql://user:pass@host:3306/db
//   --dry-run   only check and report, write nothing
//
// The source is never modified. Before writing, the source is saved as a backup file next to
// the report, so the exact copied data can always be inspected or restored again.

import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA } from '../../dashboard/server/store.js';
import { SheetsBackend } from '../../dashboard/server/sheets.js';
import { MysqlBackend, NUMERIC } from '../../dashboard/server/mysql.js';
import { readBackup, BACKUP_FORMAT } from '../../dashboard/server/backup.js';

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const value = (n) => args[args.indexOf(n) + 1];
const here = dirname(fileURLToPath(import.meta.url));
const outDir = flag('--out') ? value('--out') : join(here, '..', '..', 'private', 'migration');

function serviceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
  return JSON.parse(raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));
}

/** Per table: row count and the sum of every amount column. */
export function summary(tables) {
  const out = {};
  for (const t of Object.keys(SCHEMA)) {
    const rows = tables[t] || [];
    const sums = {};
    for (const c of SCHEMA[t].cols.map((x) => x[0]).filter((c) => NUMERIC.has(c))) {
      sums[c] = Math.round(rows.reduce((s, r) => s + (r[c] === '' || r[c] == null ? 0 : Number(r[c])), 0) * 100) / 100;
    }
    out[t] = { rows: rows.length, sums };
  }
  return out;
}

/** Values that MySQL could not store as they are (text in an amount column). */
export function problems(tables) {
  const list = [];
  for (const [t, rows] of Object.entries(tables)) {
    if (!SCHEMA[t]) { list.push(`${t}: not in schema.json (${rows.length} rows would be skipped)`); continue; }
    rows.forEach((r, i) => {
      for (const c of Object.keys(r)) {
        if (NUMERIC.has(c) && r[c] !== '' && r[c] != null && !Number.isFinite(Number(r[c]))) list.push(`${t} row ${i + 1} (${r.id ?? ''}) ${c} = ${JSON.stringify(r[c])}`);
      }
    });
  }
  return list;
}

async function main() {
  let tables;
  if (flag('--from-sheets')) {
    tables = await new SheetsBackend({ spreadsheetId: process.env.SPREADSHEET_ID, credentials: serviceAccount(), readOnly: true }).loadAll();
  } else if (flag('--from-backup')) {
    tables = readBackup(value('--from-backup')).tables;
  } else {
    console.error('Choose a source: --from-sheets or --from-backup <file>');
    process.exit(2);
  }
  tables = Object.fromEntries(Object.entries(tables).filter(([t]) => SCHEMA[t]));

  const before = summary(tables);
  const issues = problems(tables);
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(join(outDir, `source-${stamp}.json.gz`), gzipSync(JSON.stringify({ format: BACKUP_FORMAT, version: 1, at: new Date().toISOString(), source: 'migration-source', tables })));
  const report = { at: new Date().toISOString(), dryRun: flag('--dry-run'), source: before, issues };
  console.table(Object.fromEntries(Object.entries(before).map(([t, s]) => [t, { rows: s.rows, ...s.sums }])));
  if (issues.length) {
    console.error(`\n${issues.length} value(s) must be fixed in the source first:\n${issues.slice(0, 50).join('\n')}`);
    writeFileSync(join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 1));
    process.exit(1);
  }
  if (flag('--dry-run')) {
    writeFileSync(join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 1));
    console.log('\nDry run: nothing written.');
    return;
  }

  const target = new MysqlBackend({ url: process.env.TARGET_DATABASE_URL });
  try {
    await target.importTables(tables);
    const after = summary(await target.loadAll());
    report.target = after;
    report.match = JSON.stringify(after) === JSON.stringify(before);
  } finally {
    await target.close();
  }
  writeFileSync(join(outDir, `report-${stamp}.json`), JSON.stringify(report, null, 1));
  if (!report.match) {
    console.error('\nMISMATCH between source and MySQL: see the report. Do not switch the system to MySQL.');
    process.exit(1);
  }
  console.log('\nAll rows and amount totals match. Report:', join(outDir, `report-${stamp}.json`));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e.message); process.exit(1); });
}

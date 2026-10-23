// Moving data into MySQL: checks before, totals after. Used by the start-up import
// (IMPORT_FROM, see index.js) and by system/migrate/to-mysql.mjs.

import { SCHEMA } from './store.js';
import { NUMERIC } from './mysql.js';

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

/** Copy `tables` into an empty MySQL backend, then reload and compare. Throws on any problem. */
export async function importIntoMysql(backend, tables) {
  const source = Object.fromEntries(Object.entries(tables).filter(([t]) => SCHEMA[t]));
  const issues = problems(source);
  if (issues.length) throw new Error(`${issues.length} value(s) must be fixed in the source first: ${issues.slice(0, 20).join('; ')}`);
  const before = summary(source);
  await backend.importTables(source);
  const after = summary(await backend.loadAll());
  if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error(`MISMATCH after import: ${JSON.stringify({ before, after })}`);
  return before;
}

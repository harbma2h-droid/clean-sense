// Converts a backup exported from the current dashboard ("تصدير نسخة احتياطية",
// file cleansense-backup-YYYY-MM-DD.json) into rows for the Google Sheets database.
//
// Usage: node system/migrate/legacy-to-sheets.mjs <backup.json> <out-dir>
//
// Output: <out-dir>/<table>.json  (2D arrays, column order = system/schema.json)
//         <out-dir>/report.json   (counts + money totals before/after, unmapped fields)
//
// Nothing is dropped: every original record is also written verbatim to the
// legacy_raw table. Staff PINs are NOT copied anywhere (they were stored in plain text).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '..', 'schema.json'), 'utf8')).tables;

const [, , backupPath, outDir] = process.argv;
if (!backupPath || !outDir) {
  console.error('Usage: node legacy-to-sheets.mjs <backup.json> <out-dir>');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const get = (name) => backup[`cleansense:${name}`] ?? backup[name] ?? [];
const now = new Date().toISOString();

const list = (v) => (Array.isArray(v) ? v.join('، ') : v ?? '');
const num = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : String(v);
};
const str = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// legacy collection -> [target table, field mapping {targetKey: legacyKey | fn}]
const MAP = {
  bookings: ['bookings', {
    id: 'id', status: 'status', customer_name: 'clientName', phone: 'phone', city: 'city',
    location_url: 'locationUrl', services: (r) => list(r.services), other_service: 'otherServiceText',
    date: 'date', time: 'time', assigned_workers: (r) => list(r.assignedWorkers), notes: 'notes',
    created_at: 'createdAt', updated_at: 'updatedAt',
  }],
  projects: ['projects', {
    id: 'id', name: 'name', customer_name: 'client', status: 'status', start_date: 'startDate',
    delivery_date: 'deliveryDate', team: (r) => list(r.team), contract_value: (r) => num(r.contractValue),
    paid_amount: (r) => num(r.paidAmount), completed: 'completed', remaining: 'remaining', missing: 'missing',
    warranty_notes: 'warrantyNotes', created_at: 'createdAt',
  }],
  documents: ['documents', {
    id: 'id', doc_number: 'docNumber', type: 'type', date: 'date', customer_name: 'clientName',
    customer_phone: 'clientPhone', scope: 'scope', price: (r) => num(r.price), duration: 'duration',
    paid_amount: (r) => num(r.paidAmount), payment_method: 'paymentMethod', terms: 'terms', notes: 'notes',
    language: () => 'ar', created_at: 'createdAt',
  }],
  revenue: ['revenue', {
    id: 'id', date: 'date', customer_name: 'clientName', project: 'project', method: 'method',
    amount: (r) => num(r.amount), doc_number: 'docNumber', notes: 'notes',
  }],
  expenses: ['expenses', {
    id: 'id', date: 'date', category: (r) => r.category ?? r.type ?? '', amount: (r) => num(r.amount),
    method: 'method', notes: 'notes',
  }],
  workers: ['workers', {
    id: 'id', name: 'name', phone: 'phone', nationality: 'nationality', role: 'role',
    employment_type: 'employmentType', wage: (r) => num(r.wage), status: 'status',
    projects: (r) => list(r.projects), notes: 'notes',
  }],
  tasks: ['tasks', {
    id: 'id', title: 'title', assigned_worker: 'assignedWorker', project: 'project', due_date: 'dueDate',
    status: (r) => r.status ?? (r.done === true ? 'done' : r.done === false ? 'open' : ''), notes: 'notes',
  }],
  team: ['users', {
    id: 'id', name: 'name', username: () => '', job_title: 'jobTitle', role: 'jobTitle',
    permissions: (r) => list(r.permissions), language: () => 'ar',
    active: (r) => (r.active === false ? 'no' : 'yes'), password_hash: () => '',
    must_change_password: () => 'yes', last_login_at: () => '',
  }],
};
const SECRET_FIELDS = new Set(['pin', 'password', 'passwordHash']);
const MONEY = { projects: ['contractValue', 'paidAmount'], documents: ['price', 'paidAmount'], revenue: ['amount'], expenses: ['amount'], workers: ['wage'] };

const out = {};
const legacyRaw = [];
const report = { generated_at: now, source: backupPath, collections: {} };

for (const [legacy, [table, fields]] of Object.entries(MAP)) {
  const cols = schema[table].cols.map((c) => c[0]);
  const records = get(legacy);
  const rows = [];
  const usedLegacyKeys = new Set(
    Object.values(fields).flatMap((v) => (typeof v === 'string' ? [v] : [...v.toString().matchAll(/r\.(\w+)/g)].map((m) => m[1]))),
  );
  const unmapped = {};
  records.forEach((r, i) => {
    const id = r.id != null && r.id !== '' ? String(r.id) : `${legacy}-${i + 1}`;
    const row = cols.map((c) => {
      const f = fields[c];
      if (c === 'id') return id;
      if (!f) return '';
      return typeof f === 'function' ? str(f(r)) === '' ? '' : f(r) : str(r[f]);
    });
    rows.push(row.map((v) => (typeof v === 'number' ? v : str(v))));
    for (const k of Object.keys(r)) {
      if (!usedLegacyKeys.has(k) && !SECRET_FIELDS.has(k) && k !== 'id') unmapped[k] = (unmapped[k] ?? 0) + 1;
    }
    const safe = Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_FIELDS.has(k)));
    legacyRaw.push([legacy, id, table, id, JSON.stringify(safe), now]);
  });
  out[table] = rows;

  const totals = {};
  for (const key of MONEY[legacy] ?? []) {
    const before = records.reduce((s, r) => s + (Number(String(r[key] ?? '').replace(/[^\d.-]/g, '')) || 0), 0);
    const target = Object.entries(fields).find(([, v]) => v === key || (typeof v === 'function' && v.toString().includes(`r.${key}`)))?.[0];
    const idx = cols.indexOf(target);
    const after = rows.reduce((s, row) => s + (typeof row[idx] === 'number' ? row[idx] : Number(row[idx]) || 0), 0);
    totals[key] = { before, after, match: Math.abs(before - after) < 0.005 };
  }
  report.collections[legacy] = { target: table, count_before: records.length, count_after: rows.length, totals, unmapped_fields: unmapped };
}
out.legacy_raw = legacyRaw;

const ok = Object.values(report.collections).every(
  (c) => c.count_before === c.count_after && Object.values(c.totals).every((t) => t.match),
);
report.all_match = ok;

mkdirSync(outDir, { recursive: true });
for (const [t, rows] of Object.entries(out)) writeFileSync(join(outDir, `${t}.json`), JSON.stringify(rows));
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ all_match: ok, collections: Object.fromEntries(Object.entries(report.collections).map(([k, v]) => [k, `${v.count_before}→${v.count_after}`])) }));
process.exit(ok ? 0 : 2);

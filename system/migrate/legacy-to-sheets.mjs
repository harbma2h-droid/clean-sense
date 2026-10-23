// Converts a backup of the previous dashboard (cleansense-backup-YYYY-MM-DD.json)
// into rows for the Google Sheets database.
//
// Usage: node system/migrate/legacy-to-sheets.mjs <backup.json> <out-dir>
//
// Output: <out-dir>/<table>.json  (2D arrays in schema column order)
//         <out-dir>/report.json   (counts + money totals before/after, unmapped fields/values)
//
// Nothing is dropped: every original record is also written verbatim to legacy_raw.
// Staff PINs are never copied (they were stored in plain text).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENUMS } from '../../dashboard/shared/model.js';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '..', '..', 'dashboard', 'shared', 'schema.json'), 'utf8')).tables;

const [, , backupPath, outDir] = process.argv;
if (!backupPath || !outDir) {
  console.error('Usage: node legacy-to-sheets.mjs <backup.json> <out-dir>');
  process.exit(1);
}

const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const get = (name) => backup[`cleansense:${name}`] ?? backup[name] ?? [];
const now = new Date().toISOString();
const unknownValues = {};

// Arabic label (as typed in the old system) -> code. Extra aliases for old wording.
const ALIASES = {
  booking_status: { 'حجز مؤكد': 'confirmed', 'بانتظار التأكيد': 'pending', 'تم التنفيذ': 'completed', 'منفذ': 'completed', 'ملغي': 'cancelled' },
  payment_method: { 'شبكة': 'card', 'مدى': 'card' },
  doc_type: { 'إيصال': 'receipt', 'سند قبض': 'receipt', 'عقد': 'contract' },
};
function code(enumName, value) {
  if (value === undefined || value === null || value === '') return '';
  const v = String(value).trim();
  if (ENUMS[enumName][v]) return v;
  const alias = ALIASES[enumName]?.[v];
  if (alias) return alias;
  const hit = Object.entries(ENUMS[enumName]).find(([, l]) => l.ar === v || l.en.toLowerCase() === v.toLowerCase());
  if (hit) return hit[0];
  (unknownValues[enumName] ??= {})[v] = (unknownValues[enumName][v] ?? 0) + 1;
  return v; // keep the original text rather than lose it
}
const codes = (enumName, v) => (Array.isArray(v) ? v : v ? [v] : []).map((x) => code(enumName, x)).join(',');
const list = (v) => (Array.isArray(v) ? v.join('، ') : v ?? '');
const num = (v) => {
  if (v === '' || v === null || v === undefined) return '';
  const n = Number(String(v).replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : String(v);
};
const str = (v) => (v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));

// legacy collection -> [target table, {targetKey: legacyKey | (record) => value}]
const MAP = {
  bookings: ['bookings', {
    id: 'id', status: (r) => (r.inProgress ? 'in_progress' : code('booking_status', r.status)), customer_name: 'clientName',
    phone: 'phone', city: (r) => code('city', r.city), location_url: 'locationUrl', services: (r) => codes('service', r.services),
    other_service: 'otherServiceText', date: 'date', time: 'time', assigned_workers: (r) => list(r.assignedWorkers), notes: 'notes',
    created_at: 'createdAt', updated_at: 'updatedAt', created_by: () => 'legacy',
  }],
  projects: ['projects', {
    id: 'id', name: 'name', customer_name: 'client', status: (r) => code('project_status', r.status), start_date: 'startDate',
    delivery_date: 'deliveryDate', team: (r) => list(r.team), contract_value: (r) => num(r.contractValue),
    paid_amount: (r) => num(r.paidAmount), completed: 'completed', remaining: 'remaining', missing: 'missing',
    warranty_notes: 'warrantyNotes', created_at: 'createdAt', created_by: () => 'legacy',
  }],
  documents: ['documents', {
    id: 'id', doc_number: 'docNumber', type: (r) => code('doc_type', r.type), date: 'date', customer_name: 'clientName',
    customer_phone: 'clientPhone', services: (r) => codes('service', r.services), custom_service: 'customService', scope: 'scope',
    price: (r) => num(r.price), duration: 'duration', paid_amount: (r) => num(r.paidAmount),
    payment_method: (r) => code('payment_method', r.paymentMethod), terms: 'terms', notes: 'notes',
    quote_status: (r) => code('quote_status', r.quoteStatus), converted_from: 'convertedFromQuote', converted_to: 'convertedToInvoice',
    city: (r) => code('city', r.city), property_type: 'propertyType', project_name: 'projectName', start_date: 'startDate', end_date: 'endDate',
    language: () => 'ar', created_by: () => 'legacy', created_at: 'createdAt',
  }],
  revenue: ['revenue', {
    id: 'id', date: 'date', customer_name: 'clientName', project: 'project', method: (r) => code('payment_method', r.method),
    amount: (r) => num(r.amount), doc_number: 'docNumber', source_doc_id: 'sourceDocId', notes: 'notes', created_by: (r) => (r.auto ? 'auto' : 'legacy'),
  }],
  expenses: ['expenses', {
    id: 'id', date: 'date', category: (r) => code('expense_category', r.category), amount: (r) => num(r.amount),
    method: (r) => code('payment_method', r.method), notes: 'notes', created_by: () => 'legacy',
  }],
  workers: ['workers', {
    id: 'id', name: 'name', phone: 'phone', nationality: 'nationality', role: 'role',
    employment_type: (r) => code('employment_type', r.employmentType), wage: (r) => num(r.wage), status: (r) => code('worker_status', r.status),
    projects: (r) => list(r.projects), notes: 'notes', created_by: () => 'legacy',
  }],
  tasks: ['tasks', {
    id: 'id', title: 'title', assigned_worker: 'assignedWorker', project: 'project', due_date: 'dueDate',
    status: (r) => r.status ? code('task_status', r.status) : r.done === true ? 'done' : 'open', notes: 'notes', created_by: () => 'legacy',
  }],
  // Old team members become users without a password: the owner sets them up
  // (username + temporary password) from the Users screen.
  team: ['users', {
    id: 'id', name: 'name', username: () => '', job_title: 'jobTitle', phone: 'phone', notes: 'notes',
    role: (r) => (r.jobTitle === 'مدير تشغيل' ? 'ops_manager' : /حجوزات/.test(r.jobTitle || '') ? 'booking_coordinator' : 'employee'),
    permissions: () => '', language: () => 'ar', active: () => 'no', password_hash: () => '', must_change_password: () => 'yes',
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
  const used = new Set(Object.values(fields).flatMap((v) => (typeof v === 'string' ? [v] : [...v.toString().matchAll(/r\.(\w+)/g)].map((m) => m[1]))));
  const unmapped = {};
  records.forEach((r, i) => {
    const id = r.id != null && r.id !== '' ? String(r.id) : `${legacy}-${i + 1}`;
    const row = cols.map((c) => {
      if (c === 'id') return id;
      const f = fields[c];
      if (!f) return '';
      const v = typeof f === 'function' ? f(r) : r[f];
      return typeof v === 'number' ? v : str(v);
    });
    rows.push(row);
    for (const k of Object.keys(r)) if (!used.has(k) && !SECRET_FIELDS.has(k) && k !== 'id') unmapped[k] = (unmapped[k] ?? 0) + 1;
    const safe = Object.fromEntries(Object.entries(r).filter(([k]) => !SECRET_FIELDS.has(k)));
    legacyRaw.push([legacy, id, table, id, JSON.stringify(safe), now]);
  });
  out[table] = rows;

  const totals = {};
  for (const key of MONEY[legacy] ?? []) {
    const before = records.reduce((s, r) => s + (Number(String(r[key] ?? '').replace(/[^\d.-]/g, '')) || 0), 0);
    const target = Object.entries(fields).find(([, v]) => v === key || (typeof v === 'function' && v.toString().includes(`r.${key})`)))?.[0];
    const idx = cols.indexOf(target);
    const after = rows.reduce((s, row) => s + (Number(row[idx]) || 0), 0);
    totals[key] = { before: Math.round(before * 100) / 100, after: Math.round(after * 100) / 100, match: Math.abs(before - after) < 0.005 };
  }
  report.collections[legacy] = { target: table, count_before: records.length, count_after: rows.length, totals, unmapped_fields: unmapped };
}
out.legacy_raw = legacyRaw;

const docNums = get('documents').map((d) => d.docNumber).filter(Boolean);
report.duplicate_doc_numbers = [...new Set(docNums.filter((n, i) => docNums.indexOf(n) !== i))];
report.unknown_values = unknownValues;
report.all_match = Object.values(report.collections).every(
  (c) => c.count_before === c.count_after && Object.values(c.totals).every((t) => t.match),
);

mkdirSync(outDir, { recursive: true });
for (const [t, rows] of Object.entries(out)) writeFileSync(join(outDir, `${t}.json`), JSON.stringify(rows));
writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ all_match: report.all_match, unknown_values: unknownValues, duplicates: report.duplicate_doc_numbers }));
process.exit(report.all_match ? 0 : 2);

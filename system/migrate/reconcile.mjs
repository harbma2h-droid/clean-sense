// Record-level reconciliation of the previous dashboard's backup.
// Checks every record (fields, dates, amounts, numbering, quote↔invoice links,
// payments↔invoices) and compares each value with the migrated rows.
// Nothing is changed: findings are only reported.
//
// Usage: node system/migrate/reconcile.mjs <backup.json> <migrated-out-dir> <report.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(readFileSync(join(here, '..', '..', 'dashboard', 'shared', 'schema.json'), 'utf8')).tables;
const [, , backupPath, outDir, reportPath] = process.argv;
const backup = JSON.parse(readFileSync(backupPath, 'utf8'));
const get = (n) => backup[`cleansense:${n}`] ?? [];
const migrated = (t) => {
  const cols = schema[t].cols.map((c) => c[0]);
  return JSON.parse(readFileSync(join(outDir, `${t}.json`), 'utf8')).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]])));
};

const exportDate = (backupPath.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || new Date().toISOString().slice(0, 10);
const num = (v) => Number(String(v ?? '').replace(/[^\d.-]/g, ''));
const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));
const phoneOk = (p) => /^(\+?966|0)?5\d{8}$/.test(String(p || '').replace(/[^\d+]/g, ''));
const norm = (s) => String(s ?? '').trim();

const findings = []; // { severity: 'error'|'warning'|'info', area, ref, check, detail }
const add = (severity, area, ref, check, detail = '') => findings.push({ severity, area, ref, check, detail });

/* ---------- Documents ---------- */
const docs = get('documents');
const PREFIX = { quote: /^QO-\d{4}$/, invoice: /^INV-\d{4}$/, receipt: /^REC-\d{4}$/, contract: /^CS(-C)?-\d{4}$/ };
const TYPE = { 'عرض سعر': 'quote', 'فاتورة': 'invoice', 'إيصال': 'receipt', 'إيصال استلام دفعة': 'receipt', 'عقد': 'contract', 'عقد عمل': 'contract' };
const typeOf = (d) => TYPE[norm(d.type)] || norm(d.type);
const byNumber = {};
for (const d of docs) (byNumber[d.docNumber] ??= []).push(d);

for (const d of docs) {
  const ref = d.docNumber || d.id;
  const type = typeOf(d);
  if (!PREFIX[type]) add('error', 'documents', ref, 'نوع مستند غير معروف', d.type);
  else if (!PREFIX[type].test(d.docNumber)) add('warning', 'documents', ref, 'بادئة الرقم لا تطابق نوع المستند', `${d.type} ← ${d.docNumber}`);
  if (byNumber[d.docNumber].length > 1) add('warning', 'documents', ref, 'رقم مستند مكرر', `${byNumber[d.docNumber].length} سجلات بنفس الرقم (${byNumber[d.docNumber].map((x) => x.date).join('، ')})`);
  if (!validDate(d.date)) add('error', 'documents', ref, 'تاريخ غير صالح', d.date);
  else if (d.date > exportDate) add('warning', 'documents', ref, 'تاريخ في المستقبل', d.date);
  if (!(num(d.price) > 0)) add('error', 'documents', ref, 'السعر غير صالح أو صفر', d.price);
  if (d.paidAmount !== undefined && d.paidAmount !== '' && num(d.paidAmount) > num(d.price)) add('error', 'documents', ref, 'المدفوع أكبر من الإجمالي', `${d.paidAmount} > ${d.price}`);
  if (!norm(d.clientName)) add('error', 'documents', ref, 'اسم العميل فارغ');
  if (!phoneOk(d.clientPhone)) add('info', 'documents', ref, 'رقم جوال العميل ناقص أو بصيغة غير معتادة', d.clientPhone || '(فارغ)');
  if (!norm(d.scope) && type !== 'receipt') add('info', 'documents', ref, 'نطاق العمل فارغ');

  if (type === 'quote' && d.convertedToInvoice) {
    const inv = (byNumber[d.convertedToInvoice] || []).filter((x) => typeOf(x) === 'invoice');
    if (!inv.length) add('error', 'documents', ref, 'العرض يشير لفاتورة غير موجودة', d.convertedToInvoice);
    else {
      if (!inv.some((x) => x.convertedFromQuote === d.docNumber)) add('warning', 'documents', ref, 'الربط مع الفاتورة من طرف واحد', `${d.convertedToInvoice} لا تشير للعرض`);
      for (const x of inv) if (num(x.price) !== num(d.price)) add('warning', 'documents', ref, 'مبلغ الفاتورة يختلف عن العرض', `${d.price} ← ${x.price}`);
    }
  }
  if (type === 'quote' && norm(d.quoteStatus) === 'مقبول' && !d.convertedToInvoice) add('info', 'documents', ref, 'عرض مقبول بدون فاتورة');
  if (type === 'invoice' && d.convertedFromQuote) {
    const q = (byNumber[d.convertedFromQuote] || []).filter((x) => typeOf(x) === 'quote');
    if (!q.length) add('error', 'documents', ref, 'الفاتورة تشير لعرض غير موجود', d.convertedFromQuote);
    else if (q.length > 1) add('warning', 'documents', ref, 'الفاتورة تشير لرقم عرض مكرر', `${d.convertedFromQuote} (${q.length} عروض)`);
  }
}

/* ---------- Revenue ↔ invoices ---------- */
const revenue = get('revenue');
const invoices = docs.filter((d) => typeOf(d) === 'invoice');
const collected = Object.fromEntries(invoices.map((d) => [d.id, 0]));
const unallocated = [];
for (const r of revenue) {
  const ref = `${r.date} · ${num(r.amount)}`;
  if (!validDate(r.date)) add('error', 'revenue', ref, 'تاريخ غير صالح', r.date);
  if (!(num(r.amount) > 0)) add('error', 'revenue', ref, 'مبلغ غير صالح', r.amount);
  const inv = invoices.find((d) => d.id === r.sourceDocId) || invoices.find((d) => d.docNumber === norm(r.project));
  if (inv) {
    collected[inv.id] += num(r.amount);
    if (r.date < inv.date) add('warning', 'revenue', ref, 'الدفعة قبل تاريخ الفاتورة', `${inv.docNumber} (${inv.date})`);
  } else {
    // Suggest (never apply) a matching invoice: same amount, within 10 days, not already settled by a linked payment.
    const settled = new Set(revenue.map((x) => x.sourceDocId).filter(Boolean));
    const cands = invoices.filter((d) => !settled.has(d.id) && num(d.price) === num(r.amount) && Math.abs(Date.parse(d.date) - Date.parse(r.date)) <= 10 * 864e5);
    unallocated.push({ ...r, suggestion: cands.map((c) => c.docNumber).join('، ') });
    add('warning', 'revenue', ref, 'إيراد غير مربوط بفاتورة', `${norm(r.clientName)} — ${norm(r.project)}${cands.length ? ` · فاتورة محتملة: ${cands.map((c) => c.docNumber).join('، ')}` : ''}`);
  }
}
for (const d of docs.filter((x) => num(x.paidAmount) > 0)) {
  // paidAmount typed on the document itself, separate from the revenue log.
  if (typeOf(d) === 'invoice') collected[d.id] = Math.max(collected[d.id], num(d.paidAmount));
  else add('info', 'documents', d.docNumber, 'مبلغ مدفوع مسجل على مستند ليس فاتورة', `${typeOf(d)} · ${d.paidAmount} — لا يظهر في سجل الإيرادات`);
}
const receivables = invoices.map((d) => ({ doc: d.docNumber, date: d.date, customer: norm(d.clientName), total: num(d.price), collected: collected[d.id], balance: num(d.price) - collected[d.id] }))
  .sort((a, b) => b.date.localeCompare(a.date));
for (const r of receivables) {
  if (r.balance < 0) add('error', 'revenue', r.doc, 'المحصّل أكبر من مبلغ الفاتورة', `${r.collected} > ${r.total}`);
  else if (r.balance > 0) add('info', 'documents', r.doc, 'فاتورة عليها رصيد غير محصّل حسب السجلات', `${r.balance} من ${r.total}`);
}

/* ---------- Expenses ---------- */
const expenses = get('expenses');
const seen = {};
for (const e of expenses) {
  const ref = `${e.date} · ${num(e.amount)}`;
  if (!validDate(e.date)) add('error', 'expenses', ref, 'تاريخ غير صالح', e.date);
  else if (e.date > exportDate) add('warning', 'expenses', ref, 'تاريخ في المستقبل', e.date);
  if (!(num(e.amount) > 0)) add('error', 'expenses', ref, 'مبلغ غير صالح', e.amount);
  const key = `${e.date}|${num(e.amount)}|${norm(e.notes)}|${norm(e.category)}`;
  if (seen[key]) add('warning', 'expenses', ref, 'مصروف مكرر محتمل (نفس التاريخ والمبلغ والبيان)', norm(e.notes) || norm(e.category));
  seen[key] = true;
  if (!norm(e.notes)) add('info', 'expenses', ref, 'بدون بيان', norm(e.category));
}

/* ---------- Bookings & team ---------- */
for (const b of get('bookings')) {
  if (!validDate(b.date)) add('error', 'bookings', b.clientName, 'تاريخ غير صالح', b.date);
  if (!phoneOk(b.phone)) add('info', 'bookings', b.clientName, 'رقم جوال غير معتاد', b.phone);
}
for (const m of get('team')) if (norm(m.role) === 'owner' || norm(m.role) === 'مالك') add('warning', 'team', m.name, 'عضو بصلاحية مالك', 'في النظام الجديد: موقوف حتى يفعّله المالك بالدور الصحيح');

/* ---------- Field-by-field comparison with migrated rows ---------- */
const COMPARE = {
  documents: [['docNumber', 'doc_number'], ['date', 'date'], ['clientName', 'customer_name'], ['clientPhone', 'customer_phone'], ['price', 'price', true], ['paidAmount', 'paid_amount', true], ['scope', 'scope'], ['terms', 'terms'], ['duration', 'duration'], ['notes', 'notes'], ['convertedFromQuote', 'converted_from'], ['convertedToInvoice', 'converted_to']],
  revenue: [['date', 'date'], ['clientName', 'customer_name'], ['amount', 'amount', true], ['project', 'project'], ['notes', 'notes']],
  expenses: [['date', 'date'], ['amount', 'amount', true], ['notes', 'notes']],
  bookings: [['clientName', 'customer_name'], ['phone', 'phone'], ['date', 'date'], ['time', 'time']],
};
const compare = {};
for (const [legacy, pairs] of Object.entries(COMPARE)) {
  const rows = Object.fromEntries(migrated(legacy).map((r) => [String(r.id), r]));
  let fields = 0, mismatches = 0, missing = 0;
  for (const rec of get(legacy)) {
    const m = rows[String(rec.id)];
    if (!m) { missing++; add('error', legacy, rec.docNumber || rec.id, 'سجل لم يُنقل'); continue; }
    for (const [a, b, isNum] of pairs) {
      fields++;
      const same = isNum ? (rec[a] ?? '') === '' ? m[b] === '' : num(rec[a]) === Number(m[b]) : norm(rec[a]) === norm(m[b]);
      if (!same) { mismatches++; add('error', legacy, rec.docNumber || rec.id, 'قيمة منقولة تختلف عن الأصل', `${a}: «${rec[a]}» ← «${m[b]}»`); }
    }
  }
  compare[legacy] = { records: get(legacy).length, migrated: Object.keys(rows).length, fields_compared: fields, mismatches, missing };
}

const count = (s) => findings.filter((f) => f.severity === s).length;
const report = {
  generated_at: new Date().toISOString(), export_date: exportDate,
  summary: { errors: count('error'), warnings: count('warning'), info: count('info') },
  compare, receivables, unallocated_revenue: unallocated.map((r) => ({ date: r.date, customer: norm(r.clientName), project: norm(r.project), amount: num(r.amount), method: norm(r.method), suggestion: r.suggestion })),
  totals: {
    invoices_total: invoices.reduce((s, d) => s + num(d.price), 0),
    invoices_collected: receivables.reduce((s, r) => s + r.collected, 0),
    revenue_log_total: revenue.reduce((s, r) => s + num(r.amount), 0),
    revenue_unallocated: unallocated.reduce((s, r) => s + num(r.amount), 0),
    expenses_total: Math.round(expenses.reduce((s, e) => s + num(e.amount), 0) * 100) / 100,
    quotes_total: docs.filter((d) => typeOf(d) === 'quote').reduce((s, d) => s + num(d.price), 0),
  },
  findings,
};
writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ summary: report.summary, compare, totals: report.totals }, null, 1));

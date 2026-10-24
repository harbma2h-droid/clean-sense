// Business operations for Clean Sense. Used by the server (Express) and by the
// in-browser demo, so both follow exactly the same rules.
//
// ctx = { store, user, perms: string[], audit(action, entity, id, details), today?: 'YYYY-MM-DD' }
// store = { list(table, {includeDeleted}), get(table, id), insert(table, row), patch(table, id, data) }

import { TABLES, ENUMS, ROLES, SETTINGS_SPEC, DEFAULT_MESSAGES, OLD_DEFAULT_MESSAGES, EDITABLE_LISTS, applyLists, enumLabel } from './model.js';
import { computeTotals, docTotal, enrichDocuments, invoiceState, paidByInvoice, journal, trialBalance, profitAndLoss, cashByMethod, receivablesAging, revenueByService, projectProfitability, customerStatement, accountBalance, treasuryBalances, partnersEquity, workerBalances, payrollLineTotals, TREASURY_ACCOUNT, METHOD_ACCOUNT, r2 } from './finance.js';

export class ServiceError extends Error {
  constructor(status, code, extra = {}) {
    super(code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
const fail = (status, code, extra) => { throw new ServiceError(status, code, extra); };

const nowIso = () => new Date().toISOString();
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
// The business runs on Riyadh time (UTC+3, no daylight saving): after midnight there it is
// already the next day, even though UTC is still on the previous one.
export const riyadhToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const todayOf = (ctx) => ctx.today || riyadhToday();
const rand = () => Math.random().toString(36).slice(2, 6);
export const newId = (p) => `${p}-${Date.now().toString(36)}${rand()}`.toUpperCase();
const can = (ctx, perm) => ctx.perms.includes(perm);
const isOwner = (ctx) => ctx.user?.role === 'owner';
const asNumber = (v) => (v === '' || v === null || v === undefined ? '' : Number.isFinite(Number(v)) ? Number(v) : String(v));

export function normPhone(p) {
  // Arabic-Indic (٠-٩) and Persian (۰-۹) digits typed on Arabic keyboards count as digits.
  let d = String(p || '').replace(/[٠-٩۰-۹]/g, (c) => String(c.charCodeAt(0) & 0xf)).replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`;
  return d;
}

/** A Saudi mobile (05xxxxxxxx) or another full international number; '' when unusable. */
export const validPhone = (p) => {
  const d = normPhone(p);
  return /^05\d{8}$/.test(d) || /^[1-9]\d{9,14}$/.test(d) ? d : '';
};

/** Random URL-safe token for links that work without signing in (24 bytes = 192 bits by default). */
export function newToken(bytes = 24) {
  const b = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(b);
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function nextNumber(rows, field, prefix) {
  const re = new RegExp(`^${prefix}-(\\d+)$`);
  const max = rows.reduce((m, r) => {
    const x = String(r[field] || '').match(re);
    return x ? Math.max(m, Number(x[1])) : m;
  }, 0);
  return `${prefix}-${String(max + 1).padStart(4, '0')}`;
}

/* ================= Generic record tables ================= */

function sanitize(table, body, { partial = false } = {}) {
  const def = TABLES[table];
  const out = {};
  const errors = [];
  for (const f of def.fields) {
    if (f.readonly) continue;
    let v = body[f.key];
    if (v === undefined) {
      if (!partial && f.default !== undefined) out[f.key] = f.default;
      continue;
    }
    if (f.type === 'money' || f.type === 'number') v = asNumber(v);
    else if (f.type === 'multiselect') v = (Array.isArray(v) ? v : String(v).split(',')).map((s) => String(s).trim()).filter(Boolean).join(',');
    else v = String(v ?? '').slice(0, 5000).trim();
    if (f.type === 'select' && v && !ENUMS[f.enum][v]) errors.push(`${f.key}:invalid`);
    if (f.type === 'money' && v !== '' && typeof v !== 'number') errors.push(`${f.key}:invalid`);
    if (f.positive && v !== '' && !(Number(v) > 0)) errors.push(`${f.key}:positive`);
    out[f.key] = v;
  }
  if (!partial) for (const f of def.fields) if (f.required && (out[f.key] === undefined || out[f.key] === '')) errors.push(`${f.key}:required`);
  if (errors.length) fail(400, 'validation', { fields: errors });
  return out;
}

function checkRefs(ctx, table, data) {
  for (const f of TABLES[table].fields) {
    if (f.type !== 'ref' || !data[f.key]) continue;
    const target = ctx.store.get(f.ref, data[f.key]);
    if (!target || target.deleted_at) fail(400, 'validation', { fields: [`${f.key}:not_found`] });
  }
}

export function listRecords(ctx, table) {
  return ctx.store.list(table);
}

export async function createRecord(ctx, table, body) {
  // A booking linked to a customer takes the name and phone from the customer record.
  if (table === 'bookings' && body.customer_id && !body.customer_name) {
    const c = ctx.store.get('customers', body.customer_id);
    if (c && !c.deleted_at) body = { ...body, customer_name: c.name, phone: body.phone || c.phone };
  }
  const data = sanitize(table, body);
  checkRefs(ctx, table, data);
  if (table === 'customers') {
    data.phone = normPhone(data.phone);
    const dup = ctx.store.list('customers').find((c) => normPhone(c.phone) === data.phone);
    if (dup) fail(409, 'duplicate_phone', { id: dup.id, name: dup.name });
    data.code = nextNumber(ctx.store.list('customers', { includeDeleted: true }), 'code', 'CUS');
  }
  if (table === 'projects') {
    data.code = nextNumber(ctx.store.list('projects', { includeDeleted: true }), 'code', 'PRJ');
    if (data.customer_id && !data.customer_name) data.customer_name = ctx.store.get('customers', data.customer_id).name;
  }
  data.id = table === 'leads' ? nextLeadRef(ctx) : newId(table.slice(0, 2));
  Object.assign(data, { created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '' });
  const row = await ctx.store.insert(table, data);
  await ctx.audit('create', table, row.id);
  return row;
}

export async function updateRecord(ctx, table, id, body) {
  const existing = ctx.store.get(table, id);
  if (!existing || existing.deleted_at) fail(404, 'not_found');
  if (existing.legacy === 'yes' && table === 'expenses') {
    // Original amounts stay as imported; only linking and notes can be added.
    const allowed = ['project_id', 'booking_id', 'supplier', 'reference'];
    if (Object.keys(body).some((k) => !allowed.includes(k) && body[k] !== existing[k])) fail(409, 'legacy_locked');
  }
  const data = sanitize(table, body, { partial: true });
  checkRefs(ctx, table, data);
  if (table === 'customers' && data.phone !== undefined) {
    data.phone = normPhone(data.phone);
    const dup = ctx.store.list('customers').find((c) => c.id !== id && normPhone(c.phone) === data.phone);
    if (dup) fail(409, 'duplicate_phone', { id: dup.id, name: dup.name });
  }
  const before = Object.fromEntries(Object.keys(data).map((k) => [k, existing[k]]));
  const row = await ctx.store.patch(table, id, { ...data, updated_at: nowIso() });
  await ctx.audit('update', table, id, { before, after: data });
  return row;
}

export async function deleteRecord(ctx, table, id) {
  const existing = ctx.store.get(table, id);
  if (!existing || existing.deleted_at) fail(404, 'not_found');
  if (existing.legacy === 'yes') fail(409, 'legacy_locked');
  if (table === 'customers' && ctx.store.list('documents').some((d) => d.customer_id === id)) fail(409, 'in_use');
  if (table === 'workers' && (ctx.store.list('payroll_lines').some((l) => l.worker_id === id) || ctx.store.list('worker_advances').some((a) => a.worker_id === id))) fail(409, 'in_use');
  if (table === 'projects' && (ctx.store.list('documents').some((d) => d.project_id === id) || ctx.store.list('expenses').some((x) => x.project_id === id))) fail(409, 'in_use');
  await ctx.store.patch(table, id, { deleted_at: nowIso() });
  await ctx.audit('delete', table, id);
}

function nextLeadRef(ctx) {
  const d = new Date();
  const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
  return nextNumber(ctx.store.list('leads', { includeDeleted: true }).map((l) => ({ id: l.id })), 'id', `CS-${ym}`);
}

/** Find a customer by id or phone, or create one. Returns the customer row. */
export async function resolveCustomer(ctx, { customer_id, customer_name, customer_phone, city, language }) {
  if (customer_id) {
    const c = ctx.store.get('customers', customer_id);
    if (!c || c.deleted_at) fail(400, 'validation', { fields: ['customer_id:not_found'] });
    return c;
  }
  const name = String(customer_name || '').trim();
  const phone = normPhone(customer_phone);
  if (!name) fail(400, 'validation', { fields: ['customer_name:required'] });
  if (phone) {
    const found = ctx.store.list('customers').find((c) => normPhone(c.phone) === phone);
    if (found) return found;
  }
  const row = await ctx.store.insert('customers', {
    id: newId('cu'), code: nextNumber(ctx.store.list('customers', { includeDeleted: true }), 'code', 'CUS'), name, phone, type: 'individual',
    city: city || '', language: language || 'ar', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit('create', 'customers', row.id, 'auto');
  return row;
}

/* ================= Quotes, invoices, contracts ================= */

const DOC_PREFIX = { quote: 'QO', invoice: 'INV', contract: 'CS-C' };
const DOC_FIELDS = ['date', 'services', 'custom_service', 'scope', 'duration', 'payment_method', 'terms', 'notes', 'city', 'property_type', 'project_id', 'booking_id', 'project_name', 'start_date', 'end_date', 'language', 'valid_until', 'due_date'];
const MONEY_FIELDS = ['items', 'discount', 'price'];

function cleanItems(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((it) => ({ description: String(it.description || '').slice(0, 2000).trim(), service: ENUMS.service[it.service] ? it.service : '', qty: Number(it.qty) || 0, unit_price: r2(it.unit_price) }))
    .filter((it) => it.description || it.unit_price);
}

function docPayload(body, type) {
  const out = {};
  for (const k of DOC_FIELDS) if (body[k] !== undefined) out[k] = typeof body[k] === 'string' ? body[k].slice(0, 5000) : body[k];
  if (out.services !== undefined) out.services = (Array.isArray(out.services) ? out.services : String(out.services).split(',')).filter((s) => ENUMS.service[s]).join(',');
  if (out.payment_method && !ENUMS.payment_method[out.payment_method]) fail(400, 'validation', { fields: ['payment_method:invalid'] });
  if (out.city && !ENUMS.city[out.city]) fail(400, 'validation', { fields: ['city:invalid'] });
  if (body.items !== undefined || body.discount !== undefined || body.price !== undefined) {
    const items = cleanItems(body.items);
    if (items.length) {
      const t = computeTotals(items, body.discount);
      if (t.discount < 0 || t.discount > t.subtotal) fail(400, 'validation', { fields: ['discount:invalid'] });
      Object.assign(out, { items: JSON.stringify(t.lines.map(({ line_total, ...rest }) => rest)), subtotal: t.subtotal, discount: t.discount, total: t.total, price: t.total });
    } else if (type === 'contract' && Number(body.price) > 0) {
      Object.assign(out, { items: '', subtotal: r2(body.price), discount: 0, total: r2(body.price), price: r2(body.price) });
    } else {
      Object.assign(out, { items: '', subtotal: 0, discount: 0, total: 0, price: 0 });
    }
  }
  return out;
}

export function listDocuments(ctx) {
  return enrichDocuments(ctx.store.list('documents'), ctx.store.list('payments'), todayOf(ctx));
}

export function getDocument(ctx, id) {
  const d = listDocuments(ctx).find((x) => x.id === id);
  if (!d) fail(404, 'not_found');
  const payments = d.type === 'invoice' ? ctx.store.list('payments').filter((p) => p.invoice_id === id) : [];
  // The number to send to: the customer's current number, else the one on the document.
  const customer = d.customer_id ? ctx.store.get('customers', d.customer_id) : null;
  const send_phone = validPhone(customer?.phone) || validPhone(d.customer_phone);
  return { ...d, payments, send_phone, share_token: undefined, has_link: !!d.share_token };
}

export async function createDocument(ctx, body) {
  const type = body.type;
  if (!DOC_PREFIX[type]) fail(400, 'validation', { fields: ['type:invalid'] });
  const customer = await resolveCustomer(ctx, body);
  const data = docPayload({ ...body, items: body.items ?? [] }, type);
  if (type !== 'contract' && !(data.total > 0)) fail(400, 'validation', { fields: ['items:required'] });
  const today = todayOf(ctx);
  Object.assign(data, {
    id: newId('do'), type, status: 'draft', customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone,
    date: data.date || today, language: data.language || customer.language || 'ar',
    doc_number: type === 'invoice' ? '' : nextNumber(ctx.store.list('documents', { includeDeleted: true }), 'doc_number', DOC_PREFIX[type]),
    created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  if (type === 'quote') data.quote_status = 'draft';
  // Defaults the owners set in Settings.
  const cfg = settingsMap(ctx);
  if (!data.terms) data.terms = cfg[`docs.default_terms_${data.language}`] || '';
  if (type === 'quote' && !data.valid_until && Number(cfg['docs.quote_valid_days']) > 0) data.valid_until = addDays(data.date, Number(cfg['docs.quote_valid_days']));
  const row = await ctx.store.insert('documents', data);
  await ctx.audit('create', 'documents', row.id, { type, total: data.total });
  return getDocument(ctx, row.id);
}

export async function updateDocument(ctx, id, body) {
  const d = ctx.store.get('documents', id);
  if (!d || d.deleted_at) fail(404, 'not_found');
  if (d.legacy === 'yes') fail(409, 'legacy_locked');
  const touchesMoney = MONEY_FIELDS.some((k) => body[k] !== undefined);
  let patch;
  if (d.type === 'invoice' && d.status !== 'draft') {
    // Issued invoices are final. Only notes and due date can change; corrections go through void + reissue.
    if (Object.keys(body).some((k) => !['notes', 'due_date'].includes(k))) fail(409, 'invoice_locked');
    patch = docPayload(body, d.type);
  } else if (d.type === 'quote' && ['accepted', 'rejected', 'cancelled'].includes(d.status)) {
    fail(409, 'quote_locked');
  } else {
    patch = docPayload(body, d.type);
    if (d.type === 'quote' && ['approved', 'sent', 'pending_approval'].includes(d.status) && (touchesMoney || body.scope !== undefined)) {
      Object.assign(patch, { status: 'draft', quote_status: 'draft', approved_by: '', approved_at: '' }); // changed after approval: needs approval again
    }
    if (body.customer_id || body.customer_name) {
      const c = await resolveCustomer(ctx, body);
      Object.assign(patch, { customer_id: c.id, customer_name: c.name, customer_phone: c.phone });
    }
    if (d.type !== 'contract' && touchesMoney && !(patch.total > 0)) fail(400, 'validation', { fields: ['items:required'] });
  }
  const before = Object.fromEntries(Object.keys(patch).map((k) => [k, d[k]]));
  await ctx.store.patch('documents', id, { ...patch, updated_at: nowIso() });
  await ctx.audit('update', 'documents', id, { before, after: patch });
  return getDocument(ctx, id);
}

async function setDoc(ctx, d, patch, action, details) {
  await ctx.store.patch('documents', d.id, { ...patch, updated_at: nowIso() });
  await ctx.audit(action, 'documents', d.id, details);
  return getDocument(ctx, d.id);
}

const QUOTE_FLOW = {
  submit: { from: ['draft'], to: 'pending_approval' },
  approve: { from: ['draft', 'pending_approval'], to: 'approved' },
  return: { from: ['pending_approval', 'approved'], to: 'draft' },
  send: { from: ['approved'], to: 'sent' },
  accept: { from: ['approved', 'sent', 'pending'], to: 'accepted' },
  reject: { from: ['approved', 'sent', 'pending'], to: 'rejected' },
  cancel: { from: ['draft', 'pending_approval', 'approved', 'sent', 'pending'], to: 'cancelled' },
};

export async function documentAction(ctx, id, action, body = {}) {
  const d = ctx.store.get('documents', id);
  if (!d || d.deleted_at) fail(404, 'not_found');
  const now = nowIso();
  const status = d.status || (d.type === 'quote' ? d.quote_status || 'pending' : '');
  if (action === 'phone') return updateDocumentPhone(ctx, id, body);
  if (action === 'shared') return markDocumentShared(ctx, id, body);
  if (action === 'link') return documentLink(ctx, id, body);
  if (action === 'to-booking') return quoteToBooking(ctx, id, body);

  if (d.type === 'quote' && QUOTE_FLOW[action]) {
    const rule = QUOTE_FLOW[action];
    if (!rule.from.includes(status)) fail(409, 'invalid_transition', { status });
    const patch = { status: rule.to, quote_status: rule.to };
    if (action === 'submit') patch.submitted_by = ctx.user?.username || '';
    if (action === 'approve') {
      if (!can(ctx, 'approve_quotes')) fail(403, 'forbidden');
      // Segregation of duties: you cannot approve your own quotation (the owner can).
      if (d.created_by && d.created_by === ctx.user?.username && !isOwner(ctx)) fail(403, 'self_approval');
      Object.assign(patch, { approved_by: ctx.user?.username || '', approved_at: now });
    }
    if (action === 'return' && !can(ctx, 'approve_quotes')) fail(403, 'forbidden');
    if (action === 'send') patch.sent_at = now;
    if (action === 'accept' || action === 'reject') patch.decided_at = now;
    if (action === 'reject') patch.reject_reason = String(body.reason || '').slice(0, 500);
    return setDoc(ctx, d, patch, `quote.${action}`);
  }

  if (d.type === 'quote' && action === 'to-invoice') {
    if (status !== 'accepted') fail(409, 'quote_not_accepted', { status });
    if (d.converted_to) fail(409, 'already_converted', { doc: d.converted_to });
    const inv = await ctx.store.insert('documents', {
      ...Object.fromEntries(['customer_id', 'customer_name', 'customer_phone', 'services', 'custom_service', 'scope', 'items', 'subtotal', 'discount', 'duration', 'payment_method', 'terms', 'city', 'property_type', 'project_id', 'booking_id', 'language'].map((k) => [k, d[k] ?? ''])),
      total: docTotal(d), price: docTotal(d),
      id: newId('do'), type: 'invoice', status: 'draft', doc_number: '', date: todayOf(ctx), converted_from: d.doc_number,
      created_at: now, updated_at: now, created_by: ctx.user?.username || '',
    });
    await ctx.store.patch('documents', d.id, { converted_to: inv.id, updated_at: now });
    await ctx.audit('quote.to_invoice', 'documents', d.id, { invoice: inv.id });
    return getDocument(ctx, inv.id);
  }

  if (d.type === 'invoice' && action === 'issue') {
    if (d.status !== 'draft') fail(409, 'invalid_transition', { status: d.status });
    if (!(docTotal(d) > 0)) fail(400, 'validation', { fields: ['items:required'] });
    const date = body.date || todayOf(ctx);
    const number = nextNumber(ctx.store.list('documents', { includeDeleted: true }), 'doc_number', 'INV');
    const dueDays = Number(settingsMap(ctx)['docs.invoice_due_days']) || 0;
    const res = await setDoc(ctx, d, { status: 'issued', doc_number: number, date, due_date: body.due_date || d.due_date || addDays(date, dueDays), issued_at: now, issued_by: ctx.user?.username || '' }, 'invoice.issue', { number, total: docTotal(d) });
    const quote = ctx.store.list('documents').find((q) => q.type === 'quote' && q.converted_to === d.id);
    if (quote) await ctx.store.patch('documents', quote.id, { converted_to: number, updated_at: now });
    return res;
  }

  if (d.type === 'invoice' && action === 'void') {
    if (!can(ctx, 'finance') && !isOwner(ctx)) fail(403, 'forbidden');
    if (d.status === 'void') fail(409, 'invalid_transition', { status: d.status });
    const reason = String(body.reason || '').trim();
    if (!reason) fail(400, 'validation', { fields: ['reason:required'] });
    if (ctx.store.list('payments').some((p) => p.invoice_id === d.id && p.status !== 'void')) fail(409, 'has_payments');
    if (d.status === 'draft') return setDoc(ctx, d, { status: 'void', voided_at: now, void_reason: reason }, 'invoice.discard');
    return setDoc(ctx, d, { status: 'void', voided_at: now, void_reason: reason }, 'invoice.void', { reason });
  }

  if (d.type === 'invoice' && action === 'confirm-balance') {
    if (!can(ctx, 'finance')) fail(403, 'forbidden');
    if (d.legacy !== 'yes') fail(409, 'not_legacy');
    const review = body.review === 'unverified' ? 'unverified' : 'confirmed_due';
    return setDoc(ctx, d, { balance_review: review }, 'invoice.balance_review', { review });
  }

  if (d.type === 'contract' && ['activate', 'complete', 'cancel'].includes(action)) {
    const to = { activate: 'active', complete: 'completed', cancel: 'cancelled' }[action];
    return setDoc(ctx, d, { status: to }, `contract.${action}`);
  }

  fail(400, 'unknown_action');
}

/* ================= Payments ================= */

export function listPayments(ctx) {
  return ctx.store.list('payments');
}

function invoiceBalance(ctx, inv) {
  const paid = paidByInvoice(ctx.store.list('payments'))[inv.id] || 0;
  return invoiceState(inv, paid, todayOf(ctx));
}

export async function recordPayment(ctx, body) {
  const amount = r2(body.amount);
  const errors = [];
  if (!(amount > 0)) errors.push('amount:positive');
  if (!ENUMS.payment_method[body.method]) errors.push('method:required');
  const date = String(body.date || todayOf(ctx)).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.push('date:invalid');
  else if (date > todayOf(ctx)) errors.push('date:future');
  if (errors.length) fail(400, 'validation', { fields: errors });

  let inv = null;
  let customer = null;
  if (body.invoice_id) {
    inv = ctx.store.get('documents', body.invoice_id);
    if (!inv || inv.deleted_at || inv.type !== 'invoice') fail(404, 'not_found');
    if (inv.status === 'draft' || inv.status === 'void') fail(409, 'invoice_not_issued');
    const { balance } = invoiceBalance(ctx, inv);
    if (amount > balance + 0.001) fail(409, 'exceeds_balance', { balance });
    customer = inv.customer_id ? ctx.store.get('customers', inv.customer_id) : null;
  } else {
    customer = await resolveCustomer(ctx, body);
  }
  const all = [...ctx.store.list('payments', { includeDeleted: true }), ...ctx.store.list('documents', { includeDeleted: true }).map((d) => ({ receipt_no: d.doc_number }))];
  const row = await ctx.store.insert('payments', {
    id: newId('pa'), receipt_no: nextNumber(all, 'receipt_no', 'REC'), date, amount, method: body.method,
    customer_id: customer?.id || inv?.customer_id || '', customer_name: customer?.name || inv?.customer_name || '',
    invoice_id: inv?.id || '', invoice_number: inv?.doc_number || '', reference: String(body.reference || '').slice(0, 200), notes: String(body.notes || '').slice(0, 1000),
    status: 'posted', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit('payment.record', 'payments', row.id, { amount, invoice: inv?.doc_number || '' });
  return row;
}

export async function voidPayment(ctx, id, body = {}) {
  const p = ctx.store.get('payments', id);
  if (!p || p.deleted_at) fail(404, 'not_found');
  if (p.status === 'void') fail(409, 'invalid_transition');
  const reason = String(body.reason || '').trim();
  if (!reason) fail(400, 'validation', { fields: ['reason:required'] });
  const row = await ctx.store.patch('payments', id, { status: 'void', void_reason: reason, voided_at: nowIso(), updated_at: nowIso() });
  await ctx.audit('payment.void', 'payments', id, { reason });
  return row;
}

/** Attach an unallocated payment (e.g. imported from the old revenue log) to an invoice. */
export async function allocatePayment(ctx, id, body = {}) {
  const p = ctx.store.get('payments', id);
  if (!p || p.deleted_at || p.status === 'void') fail(404, 'not_found');
  if (p.invoice_id) fail(409, 'already_allocated');
  const inv = ctx.store.get('documents', body.invoice_id);
  if (!inv || inv.deleted_at || inv.type !== 'invoice' || inv.status === 'draft' || inv.status === 'void') fail(409, 'invoice_not_issued');
  const { balance } = invoiceBalance(ctx, inv);
  if (Number(p.amount) > balance + 0.001) fail(409, 'exceeds_balance', { balance });
  const row = await ctx.store.patch('payments', id, { invoice_id: inv.id, invoice_number: inv.doc_number, customer_id: p.customer_id || inv.customer_id, updated_at: nowIso() });
  await ctx.audit('payment.allocate', 'payments', id, { invoice: inv.doc_number });
  return row;
}

export async function updatePaymentNotes(ctx, id, body = {}) {
  const p = ctx.store.get('payments', id);
  if (!p || p.deleted_at) fail(404, 'not_found');
  if (Object.keys(body).some((k) => !['notes', 'reference'].includes(k))) fail(409, 'payment_locked');
  const patch = { notes: String(body.notes ?? p.notes ?? '').slice(0, 1000), reference: String(body.reference ?? p.reference ?? '').slice(0, 200), updated_at: nowIso() };
  const row = await ctx.store.patch('payments', id, patch);
  await ctx.audit('update', 'payments', id, patch);
  return row;
}

/* ================= Leads and bookings ================= */

export async function leadToBooking(ctx, id) {
  const lead = ctx.store.get('leads', id);
  if (!lead || lead.deleted_at) fail(404, 'not_found');
  if (lead.booking_id) fail(409, 'already_converted', { booking_id: lead.booking_id });
  const customer = await resolveCustomer(ctx, { customer_id: lead.customer_id, customer_name: lead.customer_name, customer_phone: lead.phone, city: lead.city, language: lead.language });
  const booking = await ctx.store.insert('bookings', {
    id: newId('bo'), status: 'pending', customer_id: customer.id, customer_name: lead.customer_name, phone: lead.phone, city: lead.city,
    services: lead.service_code, date: lead.preferred_date, time: lead.preferred_time, lead_id: lead.id, quote_id: lead.quote_id || '',
    notes: [lead.details, lead.notes].filter(Boolean).join('\n'), created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.store.patch('leads', lead.id, { status: 'booked', booking_id: booking.id, customer_id: customer.id, updated_at: nowIso() });
  await ctx.audit('convert', 'leads', lead.id, { booking: booking.id });
  return booking;
}

export async function leadToQuote(ctx, id) {
  const lead = ctx.store.get('leads', id);
  if (!lead || lead.deleted_at) fail(404, 'not_found');
  if (lead.quote_id) fail(409, 'already_converted', { quote_id: lead.quote_id });
  const doc = await createDocument(ctx, {
    type: 'quote', customer_id: lead.customer_id, customer_name: lead.customer_name, customer_phone: lead.phone, city: lead.city, language: lead.language,
    services: lead.service_code, scope: lead.details || '',
    items: [{ description: lead.details || '', service: lead.service_code, qty: 1, unit_price: Number(lead.estimate_max || lead.estimate_min) || 0 }],
  }).catch((e) => {
    // A lead without an estimate still gets a draft quote: the price is filled in by staff.
    if (e.code !== 'validation') throw e;
    return null;
  }) || await createDraftQuoteWithoutPrice(ctx, lead);
  await ctx.store.patch('leads', lead.id, { status: 'quoted', quote_id: doc.id, customer_id: doc.customer_id, updated_at: nowIso() });
  return doc;
}

async function createDraftQuoteWithoutPrice(ctx, lead) {
  const customer = await resolveCustomer(ctx, { customer_id: lead.customer_id, customer_name: lead.customer_name, customer_phone: lead.phone, city: lead.city, language: lead.language });
  const row = await ctx.store.insert('documents', {
    id: newId('do'), type: 'quote', status: 'draft', quote_status: 'draft', customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone,
    doc_number: nextNumber(ctx.store.list('documents', { includeDeleted: true }), 'doc_number', 'QO'), date: todayOf(ctx), services: lead.service_code || '',
    scope: lead.details || '', items: JSON.stringify([{ description: lead.details || '', service: lead.service_code || '', qty: 1, unit_price: 0 }]), subtotal: 0, discount: 0, total: 0, price: 0,
    language: lead.language || 'ar', city: lead.city || '', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit('create', 'documents', row.id, { from_lead: lead.id });
  return getDocument(ctx, row.id);
}

/** A completed job without a quotation can be invoiced straight from its booking (draft invoice). */
export async function bookingToInvoice(ctx, id) {
  const b = ctx.store.get('bookings', id);
  if (!b || b.deleted_at) fail(404, 'not_found');
  if (b.invoice_id) fail(409, 'already_converted', { invoice_id: b.invoice_id });
  const customer = await resolveCustomer(ctx, { customer_id: b.customer_id, customer_name: b.customer_name, customer_phone: b.phone, city: b.city });
  const services = String(b.services || '').split(',').filter(Boolean);
  const row = await ctx.store.insert('documents', {
    id: newId('do'), type: 'invoice', status: 'draft', doc_number: '', customer_id: customer.id, customer_name: customer.name, customer_phone: customer.phone,
    date: todayOf(ctx), services: services.join(','), booking_id: b.id, project_id: b.project_id || '', city: b.city || '', language: customer.language || 'ar',
    items: JSON.stringify((services.length ? services : ['other']).map((s) => ({ description: s === 'other' ? b.other_service || '' : '', service: s, qty: 1, unit_price: 0 }))),
    subtotal: 0, discount: 0, total: 0, price: 0, created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.store.patch('bookings', b.id, { invoice_id: row.id, customer_id: customer.id, updated_at: nowIso() });
  await ctx.audit('booking.to_invoice', 'bookings', b.id, { invoice: row.id });
  return getDocument(ctx, row.id);
}

/* ================= Summary and reports ================= */

function financeData(ctx) {
  const all = (t) => ctx.store.list(t, { includeDeleted: false });
  return {
    documents: all('documents'), payments: all('payments'), expenses: all('expenses'), projects: all('projects'), treasury: all('treasury'),
    payroll_runs: all('payroll_runs'), payroll_lines: all('payroll_lines'), worker_advances: all('worker_advances'),
  };
}

/* ---------- Periods (dashboard and reports) ---------- */

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
const monthEnd = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

/** The period before [from, to]: the same number of whole months when the period is whole months, else the same number of days. */
export function previousPeriod(from, to) {
  if (from.endsWith('-01') && to === monthEnd(to.slice(0, 7))) {
    const n = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1;
    return { from: `${shiftMonth(from.slice(0, 7), n)}-01`, to: monthEnd(shiftMonth(to.slice(0, 7), n)) };
  }
  const len = daysBetween(from, to);
  const pTo = addDays(from, -1);
  return { from: addDays(pTo, -(len - 1)), to: pTo };
}

/** Month key `n` months before `month` (YYYY-MM). */
const shiftMonth = (month, n) => {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 - n, 1));
  return d.toISOString().slice(0, 7);
};

/**
 * Owner's financial snapshot for the home page: cash on hand, this month against last month,
 * the last six months (invoiced, collected, spent), receivables and where the money went.
 */
/**
 * Home-page money picture for any period (default: this month), compared with the period before.
 * The monthly trend covers the period, or the last six months when the period is shorter.
 */
export function financeBrief(data, today, { from = '', to = '' } = {}) {
  const entries = journal(data);
  const month = today.slice(0, 7);
  if (!isDate(from) || !isDate(to) || from > to) { from = `${month}-01`; to = monthEnd(month); }
  const prevP = previousPeriod(from, to);
  const totals = (f, t) => {
    const p = profitAndLoss(entries, f, t);
    const byCat = {};
    for (const r of p.rows) for (const [k, v] of Object.entries(r.by_category)) byCat[k] = r2((byCat[k] || 0) + v);
    return { from: f, to: t, revenue: p.total.revenue, expenses: p.total.expenses, profit: p.total.profit, collected: cashByMethod(data, f, t).received, by_category: byCat };
  };
  const cur = totals(from, to);
  const prev = totals(prevP.from, prevP.to);
  const endM = to.slice(0, 7);
  let startM = from.slice(0, 7);
  const span = (Number(endM.slice(0, 4)) - Number(startM.slice(0, 4))) * 12 + Number(endM.slice(5, 7)) - Number(startM.slice(5, 7)) + 1;
  if (span < 6) startM = shiftMonth(endM, 5);
  else if (span > 24) startM = shiftMonth(endM, 23);
  const keys = [];
  for (let k = startM; k <= endM; k = shiftMonth(k, -1)) keys.push(k);
  const pnl = Object.fromEntries(profitAndLoss(entries, `${keys[0]}-01`, monthEnd(endM)).rows.map((r) => [r.month, r]));
  const trend = keys.map((k) => {
    const p = pnl[k] || { revenue: 0, expenses: 0, profit: 0 };
    return { month: k, revenue: p.revenue, expenses: p.expenses, profit: p.profit, collected: cashByMethod(data, `${k}-01`, monthEnd(k)).received };
  });
  const accounts = treasuryBalances(entries, today);
  const ar = receivablesAging(data.documents, data.payments, today);
  const workers = Object.values(workerBalances(data));
  return {
    cash_total: r2(accounts.reduce((s, a) => s + a.balance, 0)),
    accounts: accounts.map(({ code, balance }) => ({ code, balance })),
    period: { ...cur, by_category: undefined },
    prev: { ...prev, by_category: undefined },
    // Kept for older screens: the current period under its previous name.
    month: { ...cur, month: from.slice(0, 7), by_category: undefined },
    trend,
    receivable: { confirmed: ar.confirmed, unverified: ar.unverified, overdue: ar.rows.filter((r) => r.state === 'overdue').length },
    payroll: { salary_due: r2(workers.reduce((s, w) => s + w.salary_due, 0)), worker_debts: r2(workers.reduce((s, w) => s + Math.max(0, w.debt), 0)) },
    top_expenses: Object.entries(cur.by_category).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount })),
  };
}

export function summary(ctx, query = {}) {
  const today = todayOf(ctx);
  const month = today.slice(0, 7);
  const out = {};
  if (can(ctx, 'bookings')) {
    const b = ctx.store.list('bookings');
    out.bookings_today = b.filter((x) => x.date === today && x.status !== 'cancelled').length;
    out.bookings_upcoming = b.filter((x) => x.date > today && x.status !== 'cancelled').length;
    out.today = b.filter((x) => x.date === today).sort((a, c) => String(a.time).localeCompare(String(c.time)));
  }
  if (can(ctx, 'leads')) out.leads_new = ctx.store.list('leads').filter((l) => l.status === 'new').length;
  if (can(ctx, 'sales')) {
    const docs = ctx.store.list('documents');
    out.quotes_pending_approval = docs.filter((d) => d.type === 'quote' && d.status === 'pending_approval').length;
    out.quotes_open = docs.filter((d) => d.type === 'quote' && ['approved', 'sent'].includes(d.status)).length;
    out.invoices_draft = docs.filter((d) => d.type === 'invoice' && d.status === 'draft').length;
  }
  if (can(ctx, 'finance') || can(ctx, 'reports')) {
    const data = financeData(ctx);
    const pnl = profitAndLoss(journal(data), `${month}-01`, `${month}-31`).total;
    const cash = cashByMethod(data, `${month}-01`, `${month}-31`);
    const ar = receivablesAging(data.documents, data.payments, today);
    Object.assign(out, { invoiced_month: pnl.revenue, expenses_month: pnl.expenses, profit_month: pnl.profit, collected_month: cash.received, receivable_confirmed: ar.confirmed, receivable_unverified: ar.unverified, overdue_count: ar.rows.filter((r) => r.state === 'overdue').length });
    out.finance = financeBrief(data, today, { from: query.from, to: query.to });
  }
  if (can(ctx, 'projects')) out.projects_active = ctx.store.list('projects').filter((p) => p.status === 'active').length;
  if (can(ctx, 'tasks')) {
    const open = ctx.store.list('tasks').filter((t) => t.status !== 'done');
    out.tasks_open = can(ctx, 'projects') ? open.length : open.filter((t) => t.assigned_worker === ctx.user?.name).length;
  }
  return out;
}

export function reports(ctx, { from = '', to = '' } = {}) {
  const data = financeData(ctx);
  const entries = journal(data);
  return {
    from, to,
    pnl: profitAndLoss(entries, from, to),
    cash: cashByMethod(data, from, to),
    receivables: receivablesAging(data.documents, data.payments, todayOf(ctx)),
    by_service: revenueByService(data.documents, from, to),
    projects: projectProfitability(data),
    trial_balance: trialBalance(entries, to),
    unallocated_payments: ctx.store.list('payments').filter((p) => p.status !== 'void' && !p.invoice_id),
    treasury: treasuryBalances(entries, to),
    partners: partnersEquity(data.treasury, partnerNames(ctx)),
  };
}

export function ledger(ctx, { from = '', to = '' } = {}) {
  return journal(financeData(ctx)).filter((e) => (!from || e.date >= from) && (!to || e.date <= to));
}

export function statement(ctx, customerId) {
  const c = ctx.store.get('customers', customerId);
  if (!c || c.deleted_at) fail(404, 'not_found');
  return { customer: c, ...customerStatement(customerId, financeData(ctx), todayOf(ctx)), bookings: ctx.store.list('bookings').filter((b) => b.customer_id === customerId) };
}

/* ================= Treasury: partners, transfers, balance reconciliation ================= */

export const partnerNames = (ctx) => String(settingsMap(ctx)['company.partners'] || '').split(/[,،]/).map((x) => x.trim()).filter(Boolean);

export function treasuryOverview(ctx, { to = '' } = {}) {
  const entries = journal(financeData(ctx));
  return {
    balances: treasuryBalances(entries, to),
    partners: partnersEquity(ctx.store.list('treasury'), partnerNames(ctx)),
    partner_names: partnerNames(ctx),
    entries: ctx.store.list('treasury').sort((a, b) => String(b.date).localeCompare(String(a.date))),
  };
}

export async function treasuryRecord(ctx, body) {
  const kind = body.kind;
  const date = String(body.date || todayOf(ctx)).slice(0, 10);
  const errors = [];
  if (!ENUMS.treasury_kind[kind] || kind === 'balance_set') errors.push('kind:invalid');
  if (!TREASURY_ACCOUNT[body.account]) errors.push('account:required');
  if (kind === 'transfer' && (!TREASURY_ACCOUNT[body.to_account] || body.to_account === body.account)) errors.push('to_account:invalid');
  if (['capital_in', 'drawing'].includes(kind) && !String(body.partner || '').trim()) errors.push('partner:required');
  if (!(r2(body.amount) > 0)) errors.push('amount:positive');
  if (date > todayOf(ctx)) errors.push('date:future');
  if (errors.length) fail(400, 'validation', { fields: errors });
  const row = await ctx.store.insert('treasury', {
    id: newId('tr'), date, kind, account: body.account, to_account: kind === 'transfer' ? body.to_account : '', partner: String(body.partner || '').trim(),
    amount: r2(body.amount), notes: String(body.notes || '').slice(0, 1000), status: 'posted', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit(`treasury.${kind}`, 'treasury', row.id, { amount: row.amount });
  return row;
}

/**
 * Record the real balance of an account on a date. The system posts the difference between
 * the real balance and its books as an adjustment, so balances match reality from then on.
 */
export async function treasurySetBalance(ctx, body) {
  if (!TREASURY_ACCOUNT[body.account]) fail(400, 'validation', { fields: ['account:required'] });
  const actual = Number(body.actual);
  if (body.actual === '' || body.actual === undefined || !Number.isFinite(actual)) fail(400, 'validation', { fields: ['actual:required'] });
  const date = String(body.date || todayOf(ctx)).slice(0, 10);
  if (date > todayOf(ctx)) fail(400, 'validation', { fields: ['date:future'] });
  const book = accountBalance(journal(financeData(ctx)), TREASURY_ACCOUNT[body.account], date);
  const diff = r2(actual - book);
  const row = await ctx.store.insert('treasury', {
    id: newId('tr'), date, kind: 'balance_set', account: body.account, amount: diff, book_balance: book, actual_balance: r2(actual),
    notes: String(body.notes || '').slice(0, 1000), status: 'posted', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit('treasury.balance_set', 'treasury', row.id, { book, actual, diff });
  return row;
}

export async function treasuryVoid(ctx, id, body = {}) {
  const t = ctx.store.get('treasury', id);
  if (!t || t.deleted_at) fail(404, 'not_found');
  if (t.status === 'void') fail(409, 'invalid_transition');
  const reason = String(body.reason || '').trim();
  if (!reason) fail(400, 'validation', { fields: ['reason:required'] });
  const row = await ctx.store.patch('treasury', id, { status: 'void', void_reason: reason, voided_at: nowIso(), updated_at: nowIso() });
  await ctx.audit('treasury.void', 'treasury', id, { reason });
  return row;
}

/* ================= Owner settings ================= */

export function settingsMap(ctx) {
  return Object.fromEntries(ctx.store.list('settings').map((r) => [r.key, r.value]));
}

/** Public company details plus message templates (with defaults), for documents and screens. */
export function companyInfo(ctx) {
  const saved = Object.entries(settingsMap(ctx)).filter(([k, v]) => !(k.startsWith('wa.') && OLD_DEFAULT_MESSAGES.has(v)));
  return { ...DEFAULT_MESSAGES, ...Object.fromEntries(saved) };
}

export async function updateSettings(ctx, body = {}) {
  const allowed = new Set([...SETTINGS_SPEC.map((s) => s.key), ...EDITABLE_LISTS.map((n) => `list.${n}`)]);
  const changes = Object.entries(body).filter(([k]) => allowed.has(k));
  if (!changes.length) fail(400, 'validation', { fields: ['settings:empty'] });
  for (const [k, v] of changes) {
    let value = String(v ?? '').slice(0, 5000);
    if (k.startsWith('list.')) {
      let list;
      try { list = JSON.parse(value); } catch { fail(400, 'validation', { fields: [`${k}:invalid`] }); }
      if (!Array.isArray(list)) fail(400, 'validation', { fields: [`${k}:invalid`] });
      value = JSON.stringify(list.filter((it) => /^[a-z0-9_]{2,40}$/.test(it?.code || '')).map((it) => ({ code: it.code, ar: String(it.ar || '').slice(0, 80), en: String(it.en || '').slice(0, 80), hidden: !!it.hidden })));
    }
    if (k === 'contact.phone') value = normPhone(value) || value;
    await ctx.store.setSetting(k, value);
  }
  applyLists(settingsMap(ctx));
  await ctx.audit('settings.update', 'settings', '', Object.fromEntries(changes.map(([k]) => [k, 'changed'])));
  return companyInfo(ctx);
}

/* ================= Sending documents to the customer ================= */

/**
 * Change the phone a document is sent to. The customer record is updated too when asked,
 * so the next quote or invoice uses the new number. Legacy documents keep their original
 * number; only the customer record changes.
 */
export async function updateDocumentPhone(ctx, id, body = {}) {
  const d = ctx.store.get('documents', id);
  if (!d || d.deleted_at) fail(404, 'not_found');
  const phone = normPhone(body.phone);
  if (!/^05\d{8}$/.test(phone) && !/^\d{8,15}$/.test(phone)) fail(400, 'validation', { fields: ['phone:invalid'] });
  if (d.legacy !== 'yes') await ctx.store.patch('documents', id, { customer_phone: phone, updated_at: nowIso() });
  if (body.update_customer && d.customer_id) {
    const dup = ctx.store.list('customers').find((c) => c.id !== d.customer_id && normPhone(c.phone) === phone);
    if (dup) fail(409, 'duplicate_phone', { id: dup.id, name: dup.name });
    await ctx.store.patch('customers', d.customer_id, { phone, updated_at: nowIso() });
  }
  await ctx.audit('document.phone', 'documents', id, { phone, customer: !!body.update_customer });
  return getDocument(ctx, id);
}

/** Log that a document was sent (and how), for the history panel. */
export async function markDocumentShared(ctx, id, body = {}) {
  const d = ctx.store.get('documents', id);
  if (!d || d.deleted_at) fail(404, 'not_found');
  await ctx.audit('document.shared', 'documents', id, { via: String(body.via || 'whatsapp').slice(0, 20), phone: normPhone(body.phone) });
  if (d.type === 'quote' && d.status === 'approved') return documentAction(ctx, id, 'send');
  return getDocument(ctx, id);
}

/**
 * The customer's private link to view and download a document without signing in.
 * One token per document, kept until it is reset ({ reset: true }), so a link already sent keeps working.
 */
export async function documentLink(ctx, id, body = {}) {
  const d = ctx.store.get('documents', id);
  if (!d || d.deleted_at) fail(404, 'not_found');
  if (d.status === 'void' || d.status === 'cancelled' || !d.doc_number) fail(409, 'not_shareable', { status: d.status });
  let token = d.share_token;
  if (!token || body.reset) {
    // 96 bits: short enough to look tidy in a WhatsApp message, far too many to guess.
    token = newToken(12);
    await ctx.store.patch('documents', id, { share_token: token, updated_at: nowIso() });
    await ctx.audit(body.reset ? 'document.link_reset' : 'document.link', 'documents', id);
  }
  return { path: `/d/${token}` };
}

const PUBLIC_DOC_FIELDS = ['doc_number', 'type', 'status', 'state', 'date', 'valid_until', 'due_date', 'converted_from', 'project_name', 'start_date', 'end_date', 'duration',
  'customer_name', 'customer_phone', 'city', 'services', 'items_parsed', 'discount', 'total_value', 'paid', 'paid_amount', 'balance', 'payment_method', 'scope', 'terms', 'notes', 'language'];
const PUBLIC_SETTINGS = /^(company\.|contact\.|guarantee\.|docs\.footer_note|docs\.show_bank$)/;

/** What the customer sees behind a document link: the printed fields only, never internal ones. */
export async function publicDocument(ctx, token) {
  const t = String(token || '');
  const raw = t.length >= 16 && ctx.store.list('documents').find((x) => x.share_token === t);
  if (!raw || raw.status === 'void' || raw.status === 'cancelled') fail(404, 'not_found');
  const d = listDocuments(ctx).find((x) => x.id === raw.id);
  if (!raw.viewed_at) {
    await ctx.store.patch('documents', raw.id, { viewed_at: nowIso() });
    await ctx.audit('document.viewed', 'documents', raw.id, 'customer link');
  }
  const settings = settingsMap(ctx);
  const company = Object.fromEntries(Object.entries(settings).filter(([k]) => PUBLIC_SETTINGS.test(k)));
  if (d.type === 'invoice' && settings['docs.show_bank'] === 'yes') for (const k of ['bank.name', 'bank.account_name', 'bank.iban']) company[k] = settings[k] || '';
  return { doc: Object.fromEntries(PUBLIC_DOC_FIELDS.map((k) => [k, d[k] ?? ''])), company };
}

/* ================= Payroll, advances and worker debts ================= */
//
// A run is one month's payroll: draft (editable) → approved (locked: posts the wage cost and
// what is owed to each worker) → each line is paid (cash or bank). Advances and charges build
// a worker's debt; recoveries in an approved run and repayments bring it down. All of it goes
// through the journal, so the treasury, profit and loss and reports follow automatically.

const PAYROLL_NUM = ['days', 'basic', 'allowances', 'overtime', 'bonus', 'deductions', 'advance_recovery'];

function payrollRunView(ctx, run) {
  const lines = ctx.store.list('payroll_lines').filter((l) => l.run_id === run.id).map((l) => {
    const w = ctx.store.get('workers', l.worker_id) || {};
    return { ...l, ...payrollLineTotals(l), employment_type: w.employment_type || '', iban: w.iban || '', bank_name: w.bank_name || '', id_number: w.id_number || '' };
  });
  const sum = (k) => r2(lines.reduce((s, l) => s + (Number(l[k]) || 0), 0));
  const paidCount = lines.filter((l) => l.paid_at).length;
  const state = run.status === 'void' ? 'void' : run.status === 'draft' ? 'draft' : !lines.length || paidCount === lines.length ? 'paid' : paidCount ? 'partial' : 'unpaid';
  const unpaid = r2(lines.filter((l) => !l.paid_at).reduce((s, l) => s + l.net, 0));
  return { ...run, state, lines, totals: { gross: sum('gross'), advance_recovery: sum('advance_recovery'), net: sum('net'), deductions: sum('deductions'), unpaid, workers: lines.length } };
}

const getRun = (ctx, id) => {
  const run = ctx.store.get('payroll_runs', id);
  if (!run || run.deleted_at) fail(404, 'not_found');
  return run;
};

export function payrollOverview(ctx) {
  const data = financeData(ctx);
  const balances = workerBalances(data);
  const workers = ctx.store.list('workers').map((w) => ({ id: w.id, name: w.name, role: w.role, status: w.status, employment_type: w.employment_type, wage: w.wage, allowances: w.allowances, ...(balances[w.id] || { debt: 0, salary_due: 0 }) }));
  return {
    runs: ctx.store.list('payroll_runs').map((r) => payrollRunView(ctx, r)).map(({ lines, ...r }) => r).sort((a, b) => b.month.localeCompare(a.month)),
    advances: ctx.store.list('worker_advances').sort((a, b) => String(b.date).localeCompare(String(a.date))),
    workers,
    totals: { salary_due: r2(workers.reduce((s, w) => s + w.salary_due, 0)), worker_debts: r2(workers.reduce((s, w) => s + Math.max(0, w.debt), 0)) },
  };
}

export function getPayrollRun(ctx, id) {
  return payrollRunView(ctx, getRun(ctx, id));
}

/** Suggested monthly recovery: the instalments of the worker's advances, never more than the debt. */
function suggestedRecovery(ctx, workerId, debt) {
  if (!(debt > 0)) return 0;
  const inst = ctx.store.list('worker_advances').filter((a) => a.worker_id === workerId && a.status !== 'void' && a.kind !== 'repayment').reduce((s, a) => s + (Number(a.installment) || 0), 0);
  return r2(Math.min(debt, inst || 0));
}

function newLineFor(ctx, run, w, balances) {
  const daily = w.employment_type === 'daily';
  const debt = balances[w.id]?.debt || 0;
  return {
    id: newId('pl'), run_id: run.id, worker_id: w.id, worker_name: w.name, days: daily ? 0 : '',
    basic: daily ? 0 : r2(w.wage), allowances: daily ? 0 : r2(w.allowances), overtime: 0, bonus: 0, deductions: 0,
    advance_recovery: suggestedRecovery(ctx, w.id, debt), paid_at: '', method: '', reference: '', notes: '',
    created_by: ctx.user?.username || '', created_at: nowIso(), updated_at: nowIso(),
  };
}

/** New monthly run, filled with every active worker (salary, allowances, suggested advance recovery). */
export async function createPayrollRun(ctx, body = {}) {
  const month = String(body.month || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) fail(400, 'validation', { fields: ['month:invalid'] });
  if (ctx.store.list('payroll_runs').some((r) => r.month === month && r.status !== 'void')) fail(409, 'payroll_exists', { month });
  const run = await ctx.store.insert('payroll_runs', { id: newId('pr'), month, status: 'draft', notes: String(body.notes || '').slice(0, 500), created_by: ctx.user?.username || '', created_at: nowIso(), updated_at: nowIso() });
  const balances = workerBalances(financeData(ctx));
  for (const w of ctx.store.list('workers').filter((x) => (x.status || 'active') === 'active')) await ctx.store.insert('payroll_lines', newLineFor(ctx, run, w, balances));
  await ctx.audit('payroll.create', 'payroll_runs', run.id, { month });
  return getPayrollRun(ctx, run.id);
}

const draftOnly = (run) => { if (run.status !== 'draft') fail(409, 'payroll_locked', { status: run.status }); };

export async function addPayrollLine(ctx, runId, body = {}) {
  const run = getRun(ctx, runId);
  draftOnly(run);
  const w = ctx.store.get('workers', body.worker_id);
  if (!w || w.deleted_at) fail(400, 'validation', { fields: ['worker_id:not_found'] });
  if (ctx.store.list('payroll_lines').some((l) => l.run_id === runId && l.worker_id === w.id)) fail(409, 'already_in_run');
  await ctx.store.insert('payroll_lines', newLineFor(ctx, run, w, workerBalances(financeData(ctx))));
  return getPayrollRun(ctx, runId);
}

export async function updatePayrollLine(ctx, runId, lineId, body = {}) {
  const run = getRun(ctx, runId);
  draftOnly(run);
  const line = ctx.store.get('payroll_lines', lineId);
  if (!line || line.deleted_at || line.run_id !== runId) fail(404, 'not_found');
  const patch = {};
  for (const k of PAYROLL_NUM) {
    if (body[k] === undefined) continue;
    const n = Number(body[k]);
    if (!Number.isFinite(n) || n < 0) fail(400, 'validation', { fields: [`${k}:invalid`] });
    patch[k] = r2(n);
  }
  // Daily workers: the basic follows the days worked unless it was typed directly.
  const w = ctx.store.get('workers', line.worker_id);
  if (patch.days !== undefined && body.basic === undefined && w?.employment_type === 'daily') patch.basic = r2(patch.days * (Number(w.wage) || 0));
  if (body.notes !== undefined) patch.notes = String(body.notes).slice(0, 500);
  const next = { ...line, ...patch };
  if (payrollLineTotals(next).net < 0) fail(400, 'validation', { fields: ['advance_recovery:exceeds_pay'] });
  await ctx.store.patch('payroll_lines', lineId, { ...patch, updated_at: nowIso() });
  return getPayrollRun(ctx, runId);
}

export async function removePayrollLine(ctx, runId, lineId) {
  const run = getRun(ctx, runId);
  draftOnly(run);
  const line = ctx.store.get('payroll_lines', lineId);
  if (!line || line.deleted_at || line.run_id !== runId) fail(404, 'not_found');
  await ctx.store.patch('payroll_lines', lineId, { deleted_at: nowIso() });
  return getPayrollRun(ctx, runId);
}

export async function payrollAction(ctx, runId, action, body = {}) {
  const run = getRun(ctx, runId);
  const view = payrollRunView(ctx, run);
  const now = nowIso();
  if (action === 'approve') {
    draftOnly(run);
    if (!view.lines.length) fail(400, 'validation', { fields: ['lines:required'] });
    // Recoveries cannot exceed what each worker owes (other approved runs already counted).
    const balances = workerBalances(financeData(ctx));
    for (const l of view.lines) {
      if (l.net < 0) fail(400, 'validation', { fields: [`${l.worker_name}:net_negative`] });
      if ((Number(l.advance_recovery) || 0) > r2(Math.max(0, balances[l.worker_id]?.debt || 0)) + 0.001) fail(409, 'recovery_exceeds_debt', { worker: l.worker_name, debt: balances[l.worker_id]?.debt || 0 });
    }
    await ctx.store.patch('payroll_runs', runId, { status: 'approved', approved_by: ctx.user?.username || '', approved_at: now, updated_at: now });
    await ctx.audit('payroll.approve', 'payroll_runs', runId, { month: run.month, net: view.totals.net });
  } else if (action === 'return') {
    if (run.status !== 'approved') fail(409, 'invalid_transition', { status: run.status });
    if (view.lines.some((l) => l.paid_at)) fail(409, 'payroll_has_payments');
    await ctx.store.patch('payroll_runs', runId, { status: 'draft', approved_by: '', approved_at: '', updated_at: now });
    await ctx.audit('payroll.return', 'payroll_runs', runId);
  } else if (action === 'pay') {
    if (run.status !== 'approved') fail(409, 'payroll_not_approved');
    const method = String(body.method || '');
    if (!METHOD_ACCOUNT[method]) fail(400, 'validation', { fields: ['method:invalid'] });
    const date = isDate(body.date) ? body.date : todayOf(ctx);
    const ids = Array.isArray(body.line_ids) && body.line_ids.length ? new Set(body.line_ids) : null;
    const toPay = view.lines.filter((l) => !l.paid_at && (!ids || ids.has(l.id)));
    if (!toPay.length) fail(409, 'nothing_to_pay');
    for (const l of toPay) await ctx.store.patch('payroll_lines', l.id, { paid_at: date, method, reference: String(body.reference || '').slice(0, 80), updated_at: now });
    await ctx.audit('payroll.pay', 'payroll_runs', runId, { lines: toPay.length, method, date, net: r2(toPay.reduce((s, l) => s + l.net, 0)) });
  } else if (action === 'unpay') {
    // Correct a payment recorded by mistake; the correction is in the audit log.
    const line = view.lines.find((l) => l.id === body.line_id);
    if (!line || !line.paid_at) fail(404, 'not_found');
    await ctx.store.patch('payroll_lines', line.id, { paid_at: '', method: '', reference: '', updated_at: now });
    await ctx.audit('payroll.unpay', 'payroll_runs', runId, { line: line.id, worker: line.worker_name, was: line.paid_at });
  } else if (action === 'void') {
    if (run.status === 'void') fail(409, 'invalid_transition', { status: run.status });
    const reason = String(body.reason || '').trim();
    if (!reason) fail(400, 'validation', { fields: ['reason:required'] });
    if (view.lines.some((l) => l.paid_at)) fail(409, 'payroll_has_payments');
    await ctx.store.patch('payroll_runs', runId, { status: 'void', voided_at: todayOf(ctx), void_reason: reason.slice(0, 300), updated_at: now });
    await ctx.audit('payroll.void', 'payroll_runs', runId, { reason });
  } else fail(404, 'not_found');
  return getPayrollRun(ctx, runId);
}

/** Record an advance, a charge to the worker or a repayment. */
export async function createAdvance(ctx, body = {}) {
  const w = ctx.store.get('workers', body.worker_id);
  if (!w || w.deleted_at) fail(400, 'validation', { fields: ['worker_id:not_found'] });
  const kind = ENUMS.advance_kind[body.kind] ? body.kind : 'advance';
  const amount = r2(body.amount);
  if (!(amount > 0)) fail(400, 'validation', { fields: ['amount:positive'] });
  const method = String(body.method || '');
  if (kind !== 'charge' && !METHOD_ACCOUNT[method]) fail(400, 'validation', { fields: ['method:required'] });
  if (kind === 'charge' && !ENUMS.expense_category[body.category]) fail(400, 'validation', { fields: ['category:required'] });
  if (kind === 'repayment') {
    const debt = workerBalances(financeData(ctx))[w.id]?.debt || 0;
    if (amount > debt + 0.001) fail(409, 'repayment_exceeds_debt', { debt });
  }
  const row = await ctx.store.insert('worker_advances', {
    id: newId('wa'), worker_id: w.id, worker_name: w.name, kind, date: isDate(body.date) ? body.date : todayOf(ctx), amount,
    method: kind === 'charge' ? '' : method, category: kind === 'charge' ? body.category : '', installment: kind === 'repayment' ? 0 : r2(body.installment),
    notes: String(body.notes || '').slice(0, 500), status: 'posted', created_by: ctx.user?.username || '', created_at: nowIso(), updated_at: nowIso(),
  });
  await ctx.audit(`advance.${kind}`, 'worker_advances', row.id, { worker: w.name, amount });
  return row;
}

export async function voidAdvance(ctx, id, body = {}) {
  const a = ctx.store.get('worker_advances', id);
  if (!a || a.deleted_at) fail(404, 'not_found');
  if (a.status === 'void') fail(409, 'invalid_transition');
  const reason = String(body.reason || '').trim();
  if (!reason) fail(400, 'validation', { fields: ['reason:required'] });
  // An advance already partly recovered from salary cannot simply disappear: the debt would go negative.
  if (a.kind !== 'repayment') {
    const debt = workerBalances(financeData(ctx))[a.worker_id]?.debt || 0;
    if (Number(a.amount) > debt + 0.001) fail(409, 'advance_already_recovered', { debt });
  }
  await ctx.store.patch('worker_advances', id, { status: 'void', voided_at: todayOf(ctx), void_reason: reason.slice(0, 300), updated_at: nowIso() });
  await ctx.audit('advance.void', 'worker_advances', id, { reason });
  return ctx.store.get('worker_advances', id);
}

/** One worker's account: every pay line, advance, charge and repayment, with running totals. */
export function workerStatement(ctx, workerId) {
  const w = ctx.store.get('workers', workerId);
  if (!w || w.deleted_at) fail(404, 'not_found');
  const runs = Object.fromEntries(ctx.store.list('payroll_runs').map((r) => [r.id, r]));
  const lines = ctx.store.list('payroll_lines').filter((l) => l.worker_id === workerId && runs[l.run_id] && runs[l.run_id].status !== 'void')
    .map((l) => ({ ...l, ...payrollLineTotals(l), month: runs[l.run_id].month, run_status: runs[l.run_id].status })).sort((a, b) => a.month.localeCompare(b.month));
  const advances = ctx.store.list('worker_advances').filter((a) => a.worker_id === workerId).sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const bal = workerBalances(financeData(ctx))[workerId] || { debt: 0, salary_due: 0 };
  const approved = lines.filter((l) => l.run_status === 'approved');
  return {
    worker: { id: w.id, name: w.name, role: w.role, employment_type: w.employment_type, wage: w.wage, allowances: w.allowances, bank_name: w.bank_name, iban: w.iban },
    lines, advances,
    totals: {
      earned: r2(approved.reduce((s, l) => s + l.gross, 0)), paid: r2(approved.filter((l) => l.paid_at).reduce((s, l) => s + l.net, 0)),
      recovered: r2(approved.reduce((s, l) => s + (Number(l.advance_recovery) || 0), 0)), salary_due: bal.salary_due, debt: bal.debt,
    },
  };
}

/* ================= Calendar subscription (iPhone, Google, Outlook) ================= */

/** The signed-in user's private calendar feed address; { reset: true } makes a new one. */
export async function calendarLink(ctx, body = {}) {
  const u = ctx.store.get('users', ctx.user?.id);
  if (!u) fail(404, 'not_found');
  let token = u.calendar_token;
  if (!token || body.reset) {
    token = newToken();
    await ctx.store.patch('users', u.id, { calendar_token: token });
    await ctx.audit(body.reset ? 'calendar.link_reset' : 'calendar.link', 'users', u.id);
  }
  return { path: `/api/public/calendar/${token}.ics` };
}

const icsText = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUtc = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsDate = (d) => String(d).replace(/-/g, '');
/** RFC 5545 lines are at most 75 bytes; longer ones continue on the next line after a space. */
function icsFold(line) {
  const out = [];
  let cur = '';
  let bytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (bytes + n > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

/**
 * Bookings (and open tasks) as an iCalendar feed for the user behind the token, following their
 * permissions. Every event keeps the record id as UID, so edits and cancellations update the same
 * event in the calendar instead of adding a copy. Times are Riyadh time (UTC+3, no daylight saving).
 */
export function calendarFeed(ctx, token) {
  const t = String(token || '');
  const u = t.length >= 20 && ctx.store.list('users').find((x) => x.calendar_token === t && x.active !== 'no');
  if (!u) fail(404, 'not_found');
  const custom = String(u.permissions || '').split(',').map((s) => s.trim()).filter(Boolean);
  const perms = custom.length ? custom : (ROLES[u.role]?.perms ?? []);
  const lang = u.language === 'en' ? 'en' : 'ar';
  const host = 'system.cleansense.co';
  const since = addDays(todayOf(ctx), -60);
  const stamp = icsUtc(nowIso());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Clean Sense//System//AR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${lang === 'ar' ? 'كلين سنس' : 'Clean Sense'}`, 'X-WR-TIMEZONE:Asia/Riyadh', 'REFRESH-INTERVAL;VALUE=DURATION:PT1H', 'X-PUBLISHED-TTL:PT1H'];
  const event = (fields) => lines.push('BEGIN:VEVENT', ...fields.filter(Boolean), 'END:VEVENT');

  if (perms.includes('bookings')) {
    for (const b of ctx.store.list('bookings')) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || b.date < since) continue;
      const services = String(b.services || '').split(',').filter(Boolean).map((s) => enumLabel('service', s, lang)).join(lang === 'ar' ? '، ' : ', ');
      const summary = `${b.customer_name || ''}${services ? ` — ${services}` : ''}`;
      const desc = [b.phone && `${lang === 'ar' ? 'الجوال' : 'Phone'}: ${b.phone}`, b.city && enumLabel('city', b.city, lang), b.assigned_workers && `${lang === 'ar' ? 'الفريق' : 'Team'}: ${b.assigned_workers}`, b.notes, `https://${host}/#/t/bookings`].filter(Boolean).join('\n');
      const timed = /^\d{2}:\d{2}/.test(b.time || '');
      const start = timed ? new Date(`${b.date}T${b.time.slice(0, 5)}:00+03:00`) : null;
      const updated = b.updated_at || b.created_at || nowIso();
      event([
        `UID:${b.id}@${host}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${icsUtc(updated)}`, `SEQUENCE:${Math.max(0, Math.floor(Date.parse(updated) / 1000) - 1.7e9)}`,
        timed ? `DTSTART:${icsUtc(start)}` : `DTSTART;VALUE=DATE:${icsDate(b.date)}`,
        timed ? `DTEND:${icsUtc(new Date(start.getTime() + 3 * 3600e3))}` : `DTEND;VALUE=DATE:${icsDate(addDays(b.date, 1))}`,
        `SUMMARY:${icsText(summary)}`, `DESCRIPTION:${icsText(desc)}`, b.location_url && `URL:${icsText(b.location_url)}`,
        b.city && `LOCATION:${icsText(enumLabel('city', b.city, lang))}`,
        `STATUS:${b.status === 'cancelled' ? 'CANCELLED' : b.status === 'pending' ? 'TENTATIVE' : 'CONFIRMED'}`,
        ...(timed && b.status !== 'cancelled' ? ['BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-PT1H', `DESCRIPTION:${icsText(summary)}`, 'END:VALARM'] : []),
      ]);
    }
  }
  if (perms.includes('tasks')) {
    for (const k of ctx.store.list('tasks')) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k.due_date || '') || ['done', 'cancelled'].includes(k.status)) continue;
      const updated = k.updated_at || k.created_at || nowIso();
      event([
        `UID:${k.id}@${host}`, `DTSTAMP:${stamp}`, `LAST-MODIFIED:${icsUtc(updated)}`, `SEQUENCE:${Math.max(0, Math.floor(Date.parse(updated) / 1000) - 1.7e9)}`,
        `DTSTART;VALUE=DATE:${icsDate(k.due_date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(k.due_date, 1))}`,
        `SUMMARY:${icsText(`${lang === 'ar' ? 'مهمة' : 'Task'}: ${k.title || ''}`)}`, `DESCRIPTION:${icsText([k.assigned_worker, k.notes, `https://${host}/#/t/tasks`].filter(Boolean).join('\n'))}`,
        'TRANSP:TRANSPARENT',
      ]);
    }
  }
  lines.push('END:VCALENDAR');
  return lines.map(icsFold).join('\r\n') + '\r\n';
}

/** Accepted quote → booking with the same customer, services and project. */
export async function quoteToBooking(ctx, id, body = {}) {
  const q = ctx.store.get('documents', id);
  if (!q || q.deleted_at || q.type !== 'quote') fail(404, 'not_found');
  if ((q.status || q.quote_status) !== 'accepted') fail(409, 'quote_not_accepted');
  const existing = ctx.store.list('bookings').find((b) => b.quote_id === q.id);
  if (existing) fail(409, 'already_converted', { booking_id: existing.id });
  const lead = ctx.store.list('leads').find((l) => l.quote_id === q.id);
  const booking = await ctx.store.insert('bookings', {
    id: newId('bo'), status: 'confirmed', customer_id: q.customer_id, customer_name: q.customer_name, phone: q.customer_phone, city: q.city || lead?.city || '',
    services: q.services || '', date: String(body.date || lead?.preferred_date || todayOf(ctx)).slice(0, 10), time: String(body.time || '').slice(0, 5),
    project_id: q.project_id || '', quote_id: q.id, lead_id: lead?.id || '', notes: q.scope || '', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  if (lead && !lead.booking_id) await ctx.store.patch('leads', lead.id, { status: 'booked', booking_id: booking.id, updated_at: nowIso() });
  await ctx.audit('quote.to_booking', 'documents', q.id, { booking: booking.id });
  return booking;
}

/** Audit history of one record, newest first. */
export function historyOf(ctx, entity, id) {
  return ctx.store.list('audit_log').filter((a) => a.entity === entity && a.entity_id === id).slice(-50).reverse();
}

/* ================= One-time upgrade of imported legacy data ================= */

/**
 * Links legacy records into the new model without changing any original value:
 *  - creates customers (grouped by phone) and fills customer_id on documents and bookings
 *  - sets the new status columns from the old ones
 *  - copies each old revenue entry and each paid legacy receipt into the payments table
 *    (allocated to its invoice when the old system linked it, otherwise unallocated)
 *  - marks legacy invoices with an open balance as "unverified" until the owner confirms them
 * Safe to run again: records already linked are skipped.
 */
export async function upgradeLegacy(ctx) {
  const report = { customers_created: 0, documents_linked: 0, payments_created: 0, unverified_invoices: 0 };
  const now = nowIso();
  const cache = {};
  const customerFor = async (name, phone, city) => {
    const key = normPhone(phone) || `name:${String(name || '').trim()}`;
    if (cache[key]) return cache[key];
    const existing = ctx.store.list('customers').find((c) => (normPhone(phone) ? normPhone(c.phone) === normPhone(phone) : `name:${c.name}` === key));
    if (existing) return (cache[key] = existing);
    report.customers_created++;
    const row = await ctx.store.insert('customers', {
      id: newId('cu'), code: nextNumber(ctx.store.list('customers', { includeDeleted: true }), 'code', 'CUS'), name: String(name || '').trim() || '—', phone: normPhone(phone),
      type: 'individual', city: ENUMS.city[city] ? city : '', language: 'ar', source: 'legacy', created_at: now, updated_at: now, created_by: 'legacy',
    });
    return (cache[key] = row);
  };

  const QUOTE = { pending: 'pending', accepted: 'accepted', rejected: 'rejected' };
  for (const d of ctx.store.list('documents')) {
    if (d.created_by !== 'legacy' || d.legacy === 'yes') continue;
    const c = await customerFor(d.customer_name, d.customer_phone, d.city);
    const patch = { legacy: 'yes', customer_id: c.id };
    if (d.type === 'invoice') patch.status = 'issued';
    if (d.type === 'quote') patch.status = QUOTE[d.quote_status] || 'pending';
    if (d.type === 'receipt') patch.status = 'issued';
    await ctx.store.patch('documents', d.id, patch);
    report.documents_linked++;
  }
  for (const b of ctx.store.list('bookings')) {
    if (b.customer_id || b.created_by !== 'legacy') continue;
    const c = await customerFor(b.customer_name, b.phone, b.city);
    await ctx.store.patch('bookings', b.id, { customer_id: c.id });
  }
  for (const x of ctx.store.list('expenses')) if (x.created_by === 'legacy' && x.legacy !== 'yes') await ctx.store.patch('expenses', x.id, { legacy: 'yes' });

  const docs = ctx.store.list('documents');
  const already = new Set(ctx.store.list('payments', { includeDeleted: true }).map((p) => p.legacy_source));
  for (const r of ctx.store.list('revenue')) {
    const src = `revenue:${r.id}`;
    if (already.has(src)) continue;
    const inv = docs.find((d) => d.type === 'invoice' && (d.id === r.source_doc_id || (r.project && d.doc_number === String(r.project).trim())));
    const c = inv ? ctx.store.get('customers', inv.customer_id) : await customerFor(r.customer_name, '', '');
    const p = await ctx.store.insert('payments', {
      id: newId('pa'), receipt_no: '', date: r.date, amount: r2(r.amount), method: ENUMS.payment_method[r.method] ? r.method : 'other',
      customer_id: c?.id || '', customer_name: r.customer_name, invoice_id: inv?.id || '', invoice_number: inv?.doc_number || '',
      notes: [r.project, r.notes].filter(Boolean).join(' — '), status: 'posted', legacy_source: src, created_at: now, updated_at: now, created_by: 'legacy',
    });
    await ctx.store.patch('revenue', r.id, { payment_id: p.id });
    report.payments_created++;
  }
  for (const d of docs) {
    if (d.type !== 'receipt' || !(Number(d.paid_amount) > 0)) continue;
    const src = `document:${d.id}`;
    if (already.has(src)) continue;
    await ctx.store.insert('payments', {
      id: newId('pa'), receipt_no: d.doc_number, date: d.date, amount: r2(d.paid_amount), method: ENUMS.payment_method[d.payment_method] ? d.payment_method : 'other',
      customer_id: d.customer_id || '', customer_name: d.customer_name, invoice_id: '', invoice_number: '', notes: d.custom_service || d.scope || '',
      status: 'posted', legacy_source: src, created_at: now, updated_at: now, created_by: 'legacy',
    });
    report.payments_created++;
  }
  const paid = paidByInvoice(ctx.store.list('payments'));
  for (const d of ctx.store.list('documents')) {
    if (d.type !== 'invoice' || d.legacy !== 'yes' || d.balance_review) continue;
    if (docTotal(d) - (paid[d.id] || 0) > 0) {
      await ctx.store.patch('documents', d.id, { balance_review: 'unverified' });
      report.unverified_invoices++;
    }
  }
  await ctx.audit('legacy.upgrade', 'system', '', report);
  return report;
}

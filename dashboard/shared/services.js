// Business operations for Clean Sense. Used by the server (Express) and by the
// in-browser demo, so both follow exactly the same rules.
//
// ctx = { store, user, perms: string[], audit(action, entity, id, details), today?: 'YYYY-MM-DD' }
// store = { list(table, {includeDeleted}), get(table, id), insert(table, row), patch(table, id, data) }

import { TABLES, ENUMS } from './model.js';
import { computeTotals, docTotal, enrichDocuments, invoiceState, paidByInvoice, journal, trialBalance, profitAndLoss, cashByMethod, receivablesAging, revenueByService, projectProfitability, customerStatement, r2 } from './finance.js';

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
const todayOf = (ctx) => ctx.today || new Date().toISOString().slice(0, 10);
const rand = () => Math.random().toString(36).slice(2, 6);
export const newId = (p) => `${p}-${Date.now().toString(36)}${rand()}`.toUpperCase();
const can = (ctx, perm) => ctx.perms.includes(perm);
const isOwner = (ctx) => ctx.user?.role === 'owner';
const asNumber = (v) => (v === '' || v === null || v === undefined ? '' : Number.isFinite(Number(v)) ? Number(v) : String(v));

export function normPhone(p) {
  let d = String(p || '').replace(/\D/g, '');
  if (d.startsWith('00966')) d = d.slice(5);
  else if (d.startsWith('966')) d = d.slice(3);
  if (d.length === 9 && d.startsWith('5')) d = `0${d}`;
  return d;
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
  return { ...d, payments };
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
    const res = await setDoc(ctx, d, { status: 'issued', doc_number: number, date, due_date: body.due_date || d.due_date || date, issued_at: now, issued_by: ctx.user?.username || '' }, 'invoice.issue', { number, total: docTotal(d) });
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
  return { documents: ctx.store.list('documents'), payments: ctx.store.list('payments'), expenses: ctx.store.list('expenses'), projects: ctx.store.list('projects') };
}

export function summary(ctx) {
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

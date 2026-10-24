// End-to-end tests of the sales and accounting cycle through the HTTP API.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { Store } from '../store.js';
import { createApp } from '../app.js';
import { upgradeLegacy } from '../../shared/services.js';
import { journal, trialBalance, receivablesAging } from '../../shared/finance.js';

let server, base, store;
const jar = {};
const today = new Date().toISOString().slice(0, 10);

async function req(who, method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jar[who] ? { Cookie: jar[who] } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set && who) jar[who] = set.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

before(async () => {
  store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-acc-')), 'db.json') });
  await store.init();
  const user = (id, username, role) => store.insert('users', { id, name: username, username, role, active: 'yes', password_hash: bcrypt.hashSync('Pass1234', 4), must_change_password: 'no' });
  await user('U1', 'owner', 'owner');
  await user('U2', 'coord', 'booking_coordinator');
  await user('U3', 'ops', 'ops_manager');
  await user('U4', 'acc', 'accountant');
  const app = createApp({ store, secret: 'x'.repeat(40), secureCookies: false });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const u of ['owner', 'coord', 'ops', 'acc']) await req(u, 'POST', '/auth/login', { username: u, password: 'Pass1234' });
});
after(() => server.close());

const items = [
  { description: 'تنظيف فيلا بعد التشطيب', service: 'post_construction', qty: 1, unit_price: 3000 },
  { description: 'تنظيف مكيفات', service: 'ac_cleaning', qty: 5, unit_price: 100 },
];
let quote, invoice;

test('quote: totals from line items, numbering, customer created once', async () => {
  const r = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'أ. سالم', customer_phone: '+966 50 000 0001', items, discount: 200 });
  assert.equal(r.status, 201);
  quote = r.body;
  assert.equal(quote.doc_number, 'QO-0001');
  assert.equal(quote.status, 'draft');
  assert.equal(quote.total_value, 3300);
  assert.equal(store.list('customers').length, 1);
  assert.equal(store.list('customers')[0].phone, '0500000001', 'phone normalised');
  const again = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'Salem', customer_phone: '0500000001', items });
  assert.equal(again.body.customer_id, quote.customer_id, 'same phone → same customer');
  assert.equal(again.body.doc_number, 'QO-0002');
  assert.equal((await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'X', items: [] })).status, 400, 'needs a priced item');
  assert.equal((await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'X', items, discount: 99999 })).status, 400, 'discount above subtotal');
});

test('quote approval: no self-approval, approver required, edits after approval need re-approval', async () => {
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/accept`)).status, 409, 'cannot accept a draft');
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/submit`)).body.status, 'pending_approval');
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/approve`)).status, 403, 'coordinator has no approval permission');
  const ap = await req('ops', 'POST', `/sales/documents/${quote.id}/approve`);
  assert.equal(ap.body.status, 'approved');
  assert.equal(ap.body.approved_by, 'ops');
  const ed = await req('coord', 'PATCH', `/sales/documents/${quote.id}`, { items, discount: 300 });
  assert.equal(ed.body.status, 'draft', 'price change after approval resets to draft');
  assert.equal(ed.body.total_value, 3200);
  await req('coord', 'POST', `/sales/documents/${quote.id}/submit`);
  // ops created nothing here, so approving is allowed; ops cannot approve their own quote
  const own = await req('ops', 'POST', '/sales/documents', { type: 'quote', customer_name: 'Y', customer_phone: '0500000009', items });
  assert.equal((await req('ops', 'POST', `/sales/documents/${own.body.id}/approve`)).status, 403);
  assert.equal((await req('owner', 'POST', `/sales/documents/${own.body.id}/approve`)).status, 201, 'owner may approve anything');
  await req('ops', 'POST', `/sales/documents/${quote.id}/approve`);
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/send`)).body.status, 'sent');
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/accept`)).body.status, 'accepted');
  assert.equal((await req('coord', 'PATCH', `/sales/documents/${quote.id}`, { notes: 'x' })).status, 409, 'accepted quote is locked');
});

test('accepting a quote records no revenue and no receivable', async () => {
  const rep = (await req('owner', 'GET', '/reports')).body;
  assert.equal(rep.pnl.total.revenue, 0);
  assert.equal(rep.receivables.total, 0);
  assert.equal(rep.cash.received, 0);
});

test('quote → draft invoice → issue: number given at issue, quote linked', async () => {
  const d = await req('coord', 'POST', `/sales/documents/${quote.id}/to-invoice`);
  assert.equal(d.status, 201);
  invoice = d.body;
  assert.equal(invoice.status, 'draft');
  assert.equal(invoice.doc_number, '');
  assert.equal(invoice.total_value, 3200);
  assert.equal((await req('coord', 'POST', `/sales/documents/${quote.id}/to-invoice`)).status, 409);
  assert.equal((await req('acc', 'POST', '/payments', { invoice_id: invoice.id, amount: 100, method: 'cash' })).status, 409, 'no payment on a draft');
  const iss = await req('acc', 'POST', `/sales/documents/${invoice.id}/issue`, { due_date: today });
  assert.equal(iss.body.doc_number, 'INV-0001');
  assert.equal(iss.body.state, 'unpaid');
  assert.equal(store.get('documents', quote.id).converted_to, 'INV-0001');
  assert.equal((await req('acc', 'PATCH', `/sales/documents/${invoice.id}`, { items, discount: 0 })).status, 409, 'issued invoice amounts locked');
  assert.equal((await req('acc', 'PATCH', `/sales/documents/${invoice.id}`, { notes: 'تم التسليم' })).status, 200, 'notes still editable');
});

test('payments: partial, overpayment blocked, paid, void with reason, invoice void blocked', async () => {
  const p1 = await req('acc', 'POST', '/payments', { invoice_id: invoice.id, amount: 1000, method: 'bank_transfer', date: today });
  assert.equal(p1.status, 201);
  assert.equal(p1.body.receipt_no, 'REC-0001');
  assert.equal((await req('acc', 'GET', `/sales/documents/${invoice.id}`)).body.state, 'partial');
  const over = await req('acc', 'POST', '/payments', { invoice_id: invoice.id, amount: 5000, method: 'cash' });
  assert.equal(over.status, 409);
  assert.equal(over.body.balance, 2200);
  assert.equal((await req('acc', 'POST', '/payments', { invoice_id: invoice.id, amount: 10, method: 'cash', date: '2999-01-01' })).status, 400, 'future date');
  const p2 = await req('acc', 'POST', '/payments', { invoice_id: invoice.id, amount: 2200, method: 'card' });
  assert.equal(p2.body.receipt_no, 'REC-0002');
  assert.equal((await req('acc', 'GET', `/sales/documents/${invoice.id}`)).body.state, 'paid');
  assert.equal((await req('acc', 'POST', `/payments/${p2.body.id}/void`, {})).status, 400, 'reason required');
  await req('acc', 'POST', `/payments/${p2.body.id}/void`, { reason: 'خطأ في المبلغ' });
  const after = (await req('acc', 'GET', `/sales/documents/${invoice.id}`)).body;
  assert.equal(after.state, 'partial');
  assert.equal(after.balance, 2200);
  assert.equal((await req('acc', 'POST', `/sales/documents/${invoice.id}/void`, { reason: 'x' })).status, 409, 'cannot void with payments');
  assert.equal((await req('acc', 'PATCH', `/payments/${p1.body.id}`, { amount: 1 })).status, 409, 'payment amount locked');
  assert.equal((await req('coord', 'POST', '/payments', { invoice_id: invoice.id, amount: 1, method: 'cash' })).status, 403, 'coordinator cannot record money');
});

test('unallocated payment, then allocate to an invoice', async () => {
  const p = await req('acc', 'POST', '/payments', { customer_name: 'أ. سالم', customer_phone: '0500000001', amount: 200, method: 'stc_pay' });
  assert.equal(p.body.invoice_id, '');
  let rep = (await req('acc', 'GET', '/reports')).body;
  assert.equal(rep.unallocated_payments.length, 1);
  const a = await req('acc', 'POST', `/payments/${p.body.id}/allocate`, { invoice_id: invoice.id });
  assert.equal(a.body.invoice_number, 'INV-0001');
  rep = (await req('acc', 'GET', '/reports')).body;
  assert.equal(rep.unallocated_payments.length, 0);
  assert.equal((await req('acc', 'GET', `/sales/documents/${invoice.id}`)).body.balance, 2000);
});

test('expenses linked to a project; profitability, P&L and a balanced ledger', async () => {
  const prj = await req('owner', 'POST', '/data/projects', { name: 'برج تجريبي', customer_id: quote.customer_id, contract_value: 3200 });
  assert.equal(prj.body.code, 'PRJ-0001');
  assert.equal(prj.body.customer_name, 'أ. سالم');
  await store.patch('documents', invoice.id, { project_id: prj.body.id });
  assert.equal((await req('acc', 'POST', '/data/expenses', { date: today, category: 'supplies', amount: -5, method: 'cash' })).status, 400, 'negative expense');
  assert.equal((await req('acc', 'POST', '/data/expenses', { date: today, category: 'supplies', amount: 450, method: 'cash', project_id: 'NOPE' })).status, 400, 'unknown project');
  await req('acc', 'POST', '/data/expenses', { date: today, category: 'supplies', amount: 450, method: 'cash', project_id: prj.body.id });
  await req('acc', 'POST', '/data/expenses', { date: today, category: 'fuel', amount: 50, method: 'card' });
  const rep = (await req('owner', 'GET', '/reports')).body;
  const p = rep.projects.find((x) => x.id === prj.body.id);
  assert.deepEqual([p.invoiced, p.collected, p.costs, p.profit], [3200, 1200, 450, 2750]);
  assert.equal(rep.pnl.total.revenue, 3200);
  assert.equal(rep.pnl.total.expenses, 500);
  assert.equal(rep.pnl.total.profit, 2700);
  assert.equal(rep.cash.received, 1200, 'voided payment excluded');
  assert.equal(rep.receivables.confirmed, 2000);
  assert.ok(rep.trial_balance.balanced, 'debits equal credits');
  const ar = rep.trial_balance.rows.find((r) => r.account === 1200);
  assert.equal(ar.balance, 2000, 'receivable account equals open invoice balances');
  assert.equal((await req('owner', 'DELETE', `/data/projects/${prj.body.id}`)).status, 409, 'project in use');
  assert.equal(rep.by_service.reduce((s, r) => s + r.amount, 0), 3200);
});

test('invoice void creates a reversing entry and stays balanced', async () => {
  const d = await req('coord', 'POST', '/sales/documents', { type: 'invoice', customer_name: 'نقدي', customer_phone: '0500000077', items: [{ description: 'كنب', service: 'upholstery', qty: 1, unit_price: 400 }] });
  await req('acc', 'POST', `/sales/documents/${d.body.id}/issue`);
  assert.equal((await req('acc', 'POST', `/sales/documents/${d.body.id}/void`, {})).status, 400, 'reason required');
  const v = await req('acc', 'POST', `/sales/documents/${d.body.id}/void`, { reason: 'العميل ألغى' });
  assert.equal(v.body.state, 'void');
  const entries = journal({ documents: store.list('documents'), payments: store.list('payments'), expenses: store.list('expenses') });
  assert.equal(entries.filter((e) => e.source.id === d.body.id).length, 2);
  assert.ok(trialBalance(entries).balanced);
  assert.equal((await req('owner', 'GET', '/reports')).body.pnl.total.revenue, 3200, 'voided invoice nets to zero');
});

test('lead → quote and booking → draft invoice', async () => {
  const lead = await req('coord', 'POST', '/data/leads', { customer_name: 'عميل موقع', phone: '0500000055', service_code: 'deep_cleaning', estimate_min: 800, estimate_max: 1000 });
  const q = await req('coord', 'POST', `/data/leads/${lead.body.id}/quote`);
  assert.equal(q.body.type, 'quote');
  assert.equal(q.body.total_value, 1000);
  assert.equal(store.get('leads', lead.body.id).status, 'quoted');
  const b = await req('coord', 'POST', '/data/bookings', { customer_name: 'حجز', phone: '0500000066', date: today, services: ['carpet'] });
  const inv = await req('coord', 'POST', `/data/bookings/${b.body.id}/invoice`);
  assert.equal(inv.body.status, 'draft');
  assert.equal(store.get('bookings', b.body.id).invoice_id, inv.body.id);
});

test('legacy upgrade links records, keeps every original value, and is idempotent', async () => {
  const s2 = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-leg-')), 'db.json') });
  await s2.init();
  const L = { created_by: 'legacy' };
  await s2.insert('documents', { ...L, id: 'q1', doc_number: 'QO-0001', type: 'quote', date: '2026-08-01', customer_name: 'أ. علي', customer_phone: '0500000101', price: 1000, quote_status: 'accepted', converted_to: 'INV-0001' });
  await s2.insert('documents', { ...L, id: 'i1', doc_number: 'INV-0001', type: 'invoice', date: '2026-08-02', customer_name: 'أ. علي', customer_phone: '0500000101', price: 1000, converted_from: 'QO-0001', payment_method: 'card' });
  await s2.insert('documents', { ...L, id: 'i2', doc_number: 'INV-0002', type: 'invoice', date: '2026-08-05', customer_name: 'أ. علي', customer_phone: '+966500000101', price: 700 });
  await s2.insert('documents', { ...L, id: 'r1', doc_number: 'REC-0001', type: 'receipt', date: '2026-08-06', customer_name: 'B', customer_phone: '0500000202', price: 900, paid_amount: 900, payment_method: 'cash' });
  await s2.insert('revenue', { id: 'v1', date: '2026-08-03', customer_name: 'أ. علي', project: 'INV-0001', method: 'card', amount: 1000, source_doc_id: 'i1', created_by: 'legacy' });
  await s2.insert('revenue', { id: 'v2', date: '2026-08-07', customer_name: 'C', project: 'شقة', method: 'cash', amount: 315, created_by: 'legacy' });
  await s2.insert('expenses', { id: 'e1', date: '2026-08-04', category: 'fuel', amount: 22.5, method: 'cash', created_by: 'legacy' });
  const before = JSON.stringify(['documents', 'revenue', 'expenses'].map((t) => s2.list(t).map(({ id, price, paid_amount, amount, date, doc_number, customer_name }) => ({ id, price, paid_amount, amount, date, doc_number, customer_name }))));
  const ctx = { store: s2, user: { username: 'owner', role: 'owner' }, perms: ['finance'], audit: async () => {} };
  const rep = await upgradeLegacy(ctx);
  assert.equal(rep.customers_created, 3, 'علي (two phone formats → one), B, C');
  assert.equal(rep.payments_created, 3);
  assert.equal(rep.unverified_invoices, 1);
  const after = JSON.stringify(['documents', 'revenue', 'expenses'].map((t) => s2.list(t).map(({ id, price, paid_amount, amount, date, doc_number, customer_name }) => ({ id, price, paid_amount, amount, date, doc_number, customer_name }))));
  assert.equal(after, before, 'original values untouched');
  assert.equal(s2.list('payments').reduce((s, p) => s + p.amount, 0), 1000 + 315 + 900);
  assert.equal(s2.get('documents', 'i1').status, 'issued');
  assert.equal(s2.get('documents', 'i2').balance_review, 'unverified');
  const aging = receivablesAging(s2.list('documents'), s2.list('payments'), '2026-10-23');
  assert.equal(aging.unverified, 700);
  assert.equal(aging.confirmed, 0, 'unverified balances are not counted as confirmed debt');
  assert.ok(trialBalance(journal({ documents: s2.list('documents'), payments: s2.list('payments'), expenses: s2.list('expenses') })).balanced);
  const again = await upgradeLegacy(ctx);
  assert.deepEqual([again.customers_created, again.payments_created, again.documents_linked], [0, 0, 0], 'second run changes nothing');
});

test('treasury: reconcile to real balances, partner contributions and drawings, transfers', async () => {
  const before = (await req('acc', 'GET', '/treasury')).body.balances.find((b) => b.code === 'bank').balance;
  const set = await req('acc', 'POST', '/treasury/balance', { account: 'bank', actual: 8000, date: today, notes: 'رصيد البنك الفعلي' });
  assert.equal(set.status, 201);
  assert.equal(set.body.book_balance, before);
  assert.equal(set.body.amount, Math.round((8000 - before) * 100) / 100);
  await req('acc', 'POST', '/treasury/balance', { account: 'cash', actual: 600, date: today });
  let tr = (await req('acc', 'GET', '/treasury')).body;
  assert.equal(tr.balances.find((b) => b.code === 'bank').balance, 8000);
  assert.equal(tr.balances.find((b) => b.code === 'cash').balance, 600);
  assert.equal((await req('acc', 'POST', '/treasury', { kind: 'capital_in', account: 'bank', amount: 5000 })).status, 400, 'partner required');
  await req('acc', 'POST', '/treasury', { kind: 'capital_in', account: 'bank', amount: 5000, partner: 'معاذ' });
  await req('acc', 'POST', '/treasury', { kind: 'drawing', account: 'cash', amount: 200, partner: 'الشريك الثاني' });
  await req('acc', 'POST', '/treasury', { kind: 'transfer', account: 'bank', to_account: 'cash', amount: 1000 });
  assert.equal((await req('acc', 'POST', '/treasury', { kind: 'transfer', account: 'bank', to_account: 'bank', amount: 1 })).status, 400);
  tr = (await req('acc', 'GET', '/treasury')).body;
  assert.equal(tr.balances.find((b) => b.code === 'bank').balance, 12000);
  assert.equal(tr.balances.find((b) => b.code === 'cash').balance, 1400);
  const p1 = tr.partners.find((p) => p.partner === 'معاذ');
  assert.equal(p1.capital, 5000);
  assert.equal(tr.partners.find((p) => p.partner === 'الشريك الثاني').drawings, 200);
  const rep = (await req('owner', 'GET', '/reports')).body;
  assert.ok(rep.trial_balance.balanced);
  assert.equal(rep.pnl.total.profit, 2700, 'treasury movements never touch profit');
  const id = tr.entries.find((e) => e.kind === 'drawing').id;
  await req('acc', 'POST', `/treasury/${id}/void`, { reason: 'خطأ' });
  assert.equal((await req('acc', 'GET', '/treasury')).body.balances.find((b) => b.code === 'cash').balance, 1600);
});

test('owner settings: only owners, lists extend services, defaults applied to new documents', async () => {
  assert.equal((await req('acc', 'PUT', '/settings', { 'contact.email': 'x@y.z' })).status, 403);
  const r = await req('owner', 'PUT', '/settings', {
    'company.partners': 'معاذ، الشريك الثاني', 'docs.quote_valid_days': '7', 'docs.default_terms_ar': 'شروطنا', 'docs.invoice_due_days': '5',
    'list.service': JSON.stringify([{ code: 'tank_cleaning', ar: 'تنظيف خزانات', en: 'Tank cleaning' }, { code: 'facility_ops', hidden: true }]),
    'not.allowed': 'x',
  });
  assert.equal(r.status, 200);
  assert.equal(store.list('settings').some((s) => s.key === 'not.allowed'), false);
  assert.match(r.body['wa.quote_ar'], /\{number\}/, 'message templates have defaults');
  const q = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'خزان', customer_phone: '0500000088', items: [{ description: 'خزان علوي', service: 'tank_cleaning', qty: 1, unit_price: 350 }] });
  assert.equal(q.status, 201);
  assert.equal(q.body.items_parsed[0].service, 'tank_cleaning', 'owner-added service accepted');
  assert.equal(q.body.terms, 'شروطنا');
  const d = new Date(Date.parse(`${q.body.date}T00:00:00Z`) + 7 * 864e5).toISOString().slice(0, 10);
  assert.equal(q.body.valid_until, d);
  const inv = await req('coord', 'POST', '/sales/documents', { type: 'invoice', customer_id: q.body.customer_id, items: [{ description: 'x', qty: 1, unit_price: 10 }] });
  const iss = await req('acc', 'POST', `/sales/documents/${inv.body.id}/issue`);
  assert.equal(iss.body.due_date, new Date(Date.parse(`${iss.body.date}T00:00:00Z`) + 5 * 864e5).toISOString().slice(0, 10));
  assert.deepEqual((await req('acc', 'GET', '/treasury')).body.partner_names, ['معاذ', 'الشريك الثاني']);
});

test('sending: change the phone on a document and the customer, quote → booking', async () => {
  const q = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'رقم', customer_phone: '0500000123', items: [{ description: 'x', qty: 1, unit_price: 100 }] });
  const ch = await req('coord', 'POST', `/sales/documents/${q.body.id}/phone`, { phone: '+966 55 111 2222', update_customer: true });
  assert.equal(ch.body.customer_phone, '0551112222');
  assert.equal(store.get('customers', q.body.customer_id).phone, '0551112222');
  assert.equal((await req('coord', 'POST', `/sales/documents/${q.body.id}/phone`, { phone: '12' })).status, 400);
  await req('owner', 'POST', `/sales/documents/${q.body.id}/approve`);
  const sh = await req('coord', 'POST', `/sales/documents/${q.body.id}/shared`, { via: 'pdf', phone: '0551112222' });
  assert.equal(sh.body.status, 'sent', 'sharing an approved quote marks it sent');
  assert.equal((await req('coord', 'POST', `/sales/documents/${q.body.id}/to-booking`)).status, 409, 'not accepted yet');
  await req('coord', 'POST', `/sales/documents/${q.body.id}/accept`);
  const b = await req('coord', 'POST', `/sales/documents/${q.body.id}/to-booking`, { date: today, time: '09:00' });
  assert.equal(b.body.quote_id, q.body.id);
  assert.equal(b.body.phone, '0551112222');
  const h = await req('coord', 'GET', `/history/documents/${q.body.id}`);
  assert.ok(h.body.some((x) => x.action === 'document.shared'));
});

test('sending: the number comes from the customer record, Arabic digits included', async () => {
  const q = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'أرقام عربية', customer_phone: '٠٥٥٠٠٠٠٣٣٣', items: [{ description: 'x', qty: 1, unit_price: 100 }] });
  assert.equal(store.get('customers', q.body.customer_id).phone, '0550000333');
  assert.equal(q.body.send_phone, '0550000333');
  // The customer's number changed later in their record: documents follow it.
  await store.patch('customers', q.body.customer_id, { phone: '+966 55 000 0444' });
  assert.equal((await req('coord', 'GET', `/sales/documents/${q.body.id}`)).body.send_phone, '0550000444');
  await store.patch('customers', q.body.customer_id, { phone: '' });
  assert.equal((await req('coord', 'GET', `/sales/documents/${q.body.id}`)).body.send_phone, '0550000333', 'falls back to the number on the document');
});

test('calendar feed: bookings in Riyadh time, same UID after edits, cancellations, permissions', async () => {
  const day = new Date(Date.now() + 3 * 864e5).toISOString().slice(0, 10);
  const b = await req('coord', 'POST', '/data/bookings', { customer_name: 'تقويم, وفاصلة', phone:'0500000666', date: day, time: '09:00', services: 'deep_cleaning', status: 'confirmed' });
  assert.equal(b.status, 201);
  const link = await req('coord', 'POST', '/auth/calendar');
  assert.match(link.body.path, /^\/api\/public\/calendar\/[\w-]{32}\.ics$/);
  const feed = async (path) => { const r = await fetch(base.replace(/\/api$/, '') + path); return { status: r.status, type: r.headers.get('content-type'), text: await r.text() }; };
  const f = await feed(link.body.path);
  assert.equal(f.status, 200);
  assert.match(f.type, /text\/calendar/);
  assert.match(f.text, /^BEGIN:VCALENDAR\r\n/);
  assert.ok(f.text.includes(`UID:${b.body.id}@system.cleansense.co`));
  assert.ok(f.text.includes(`DTSTART:${day.replace(/-/g, '')}T060000Z`), '09:00 Riyadh = 06:00 UTC');
  assert.ok(f.text.replace(/\r\n /g, '').includes('SUMMARY:تقويم\\, وفاصلة'), 'commas escaped (after unfolding)');
  assert.ok(f.text.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75), 'lines folded');
  assert.ok(f.text.includes('TRIGGER:-PT1H'), 'reminder an hour before');

  await req('coord', 'PATCH', `/data/bookings/${b.body.id}`, { status: 'cancelled' });
  const g = await feed(link.body.path);
  assert.equal(g.text.split(`UID:${b.body.id}@`).length, 2, 'still one event for the booking');
  assert.ok(/STATUS:CANCELLED/.test(g.text));

  const acc = await req('acc', 'POST', '/auth/calendar');
  assert.ok(!(await feed(acc.body.path)).text.includes(b.body.id), 'no bookings without the bookings permission');
  assert.equal((await feed('/api/public/calendar/wrong-token-0000000000000.ics')).status, 404);
  const again = await req('coord', 'POST', '/auth/calendar', { reset: true });
  assert.equal((await feed(link.body.path)).status, 404, 'old address stops after a reset');
  assert.equal((await feed(again.body.path)).status, 200);
});

test('customer link: private, reused, shows only printed fields, marks first view', async () => {
  const q = await req('coord', 'POST', '/sales/documents', { type: 'quote', customer_name: 'رابط', customer_phone: '0500000555', items: [{ description: 'تنظيف', qty: 2, unit_price: 150 }], notes: 'ملاحظة للعميل' });
  assert.equal(q.body.share_token, undefined, 'the token is not sent with the document');
  const a = await req('coord', 'POST', `/sales/documents/${q.body.id}/link`);
  assert.equal(a.status, 201);
  assert.match(a.body.path, /^\/d\/[\w-]{32}$/);
  assert.equal((await req('coord', 'POST', `/sales/documents/${q.body.id}/link`)).body.path, a.body.path, 'same link every time');

  const token = a.body.path.slice(3);
  const pub = await req(null, 'GET', `/public/doc/${token}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.body.doc.doc_number, q.body.doc_number);
  assert.equal(pub.body.doc.total_value, 300);
  assert.equal(pub.body.doc.notes, 'ملاحظة للعميل');
  for (const k of ['id', 'customer_id', 'created_by', 'approved_by', 'share_token', 'submitted_by']) assert.equal(pub.body.doc[k], undefined, `${k} stays internal`);
  assert.ok(Object.keys(pub.body.company).every((k) => /^(company|contact|guarantee|docs)\./.test(k)), 'only public settings');
  assert.ok(store.get('documents', q.body.id).viewed_at, 'first view recorded');

  assert.equal((await req(null, 'GET', '/public/doc/not-a-real-token-123456789')).status, 404);
  const reset = await req('coord', 'POST', `/sales/documents/${q.body.id}/link`, { reset: true });
  assert.notEqual(reset.body.path, a.body.path);
  assert.equal((await req(null, 'GET', `/public/doc/${token}`)).status, 404, 'old link stops working after a reset');
  await req('coord', 'POST', `/sales/documents/${q.body.id}/cancel`);
  assert.equal((await req(null, 'GET', `/public/doc/${reset.body.path.slice(3)}`)).status, 404, 'cancelled documents are not shown');
  assert.equal((await req('coord', 'POST', `/sales/documents/${q.body.id}/link`)).status, 409);
});

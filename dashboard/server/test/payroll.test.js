// Payroll, worker advances and debts, and the dashboard period: end to end through the HTTP API,
// checking that every step lands correctly in the books (journal, treasury, profit and loss).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { Store } from '../store.js';
import { createApp } from '../app.js';
import { journal, trialBalance, accountBalance, profitAndLoss } from '../../shared/finance.js';

let server, base, store;
const jar = {};
const month = '2026-09';

async function req(who, method, path, body) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(jar[who] ? { Cookie: jar[who] } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const set = res.headers.get('set-cookie');
  if (set && who) jar[who] = set.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const books = () => journal({
  documents: store.list('documents'), payments: store.list('payments'), expenses: store.list('expenses'), treasury: store.list('treasury'),
  payroll_runs: store.list('payroll_runs'), payroll_lines: store.list('payroll_lines'), worker_advances: store.list('worker_advances'),
});

before(async () => {
  store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-pay-')), 'db.json') });
  await store.init();
  const user = (id, username, role) => store.insert('users', { id, name: username, username, role, active: 'yes', password_hash: bcrypt.hashSync('Pass1234', 4), must_change_password: 'no' });
  await user('U1', 'owner', 'owner');
  await user('U2', 'acc', 'accountant');
  await user('U3', 'ops', 'ops_manager');
  await store.insert('workers', { id: 'W1', name: 'عامل شهري', employment_type: 'full_time', wage: 3000, allowances: 500, status: 'active' });
  await store.insert('workers', { id: 'W2', name: 'عامل يومي', employment_type: 'daily', wage: 120, status: 'active' });
  await store.insert('workers', { id: 'W3', name: 'غير نشط', employment_type: 'full_time', wage: 2000, status: 'inactive' });
  const app = createApp({ store, secret: 'x'.repeat(40), secureCookies: false });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
  for (const u of ['owner', 'acc', 'ops']) await req(u, 'POST', '/auth/login', { username: u, password: 'Pass1234' });
});
after(() => server.close());

let run;

test('advances: cash out to the worker becomes a debt; repayment cannot exceed it', async () => {
  const a = await req('acc', 'POST', '/payroll/advances', { worker_id: 'W1', kind: 'advance', amount: 1000, installment: 300, method: 'cash', date: '2026-09-05' });
  assert.equal(a.status, 201);
  assert.equal((await req('acc', 'POST', '/payroll/advances', { worker_id: 'W1', kind: 'repayment', amount: 5000, method: 'cash' })).status, 409);
  assert.equal((await req('acc', 'POST', '/payroll/advances', { worker_id: 'W1', kind: 'advance', amount: 100 })).status, 400, 'method required');
  assert.equal((await req('ops', 'GET', '/payroll')).status, 403, 'salaries need the finance permission');
  const e = books();
  assert.equal(accountBalance(e, 1300), 1000);
  assert.equal(accountBalance(e, 1010), -1000, 'cash box paid the advance');
});

test('run: active workers filled in, daily pay follows days, recovery suggested from the instalment', async () => {
  const r = await req('acc', 'POST', '/payroll/runs', { month });
  assert.equal(r.status, 201);
  run = r.body;
  assert.equal(run.lines.length, 2, 'inactive worker left out');
  const w1 = run.lines.find((l) => l.worker_id === 'W1');
  assert.equal(w1.basic, 3000);
  assert.equal(w1.allowances, 500);
  assert.equal(w1.advance_recovery, 300);
  assert.equal(w1.net, 3200);
  assert.equal((await req('acc', 'POST', '/payroll/runs', { month })).status, 409, 'one run per month');
  const w2 = run.lines.find((l) => l.worker_id === 'W2');
  const u = await req('acc', 'PATCH', `/payroll/runs/${run.id}/lines/${w2.id}`, { days: 20, overtime: 100 });
  assert.equal(u.body.lines.find((l) => l.id === w2.id).basic, 2400);
  assert.equal((await req('acc', 'PATCH', `/payroll/runs/${run.id}/lines/${w1.id}`, { advance_recovery: 99999 })).status, 400, 'net cannot go negative');
  assert.equal(u.body.totals.net, 3200 + 2500);
  assert.equal(books().filter((x) => x.source.table === 'payroll_runs').length, 0, 'a draft posts nothing');
});

test('approve: wages expense, debt recovered, salaries owed; paying moves money and settles them', async () => {
  const a = await req('acc', 'POST', `/payroll/runs/${run.id}/approve`);
  assert.equal(a.status, 201);
  assert.equal(a.body.state, 'unpaid');
  let e = books();
  assert.ok(trialBalance(e).balanced);
  assert.equal(profitAndLoss(e, `${month}-01`, `${month}-30`).total.expenses, 3500 + 2500, 'gross wages in profit and loss');
  assert.equal(accountBalance(e, 1300), 700, 'advance partly recovered');
  assert.equal(accountBalance(e, 2100), -(3200 + 2500), 'owed to workers');
  assert.equal((await req('acc', 'PATCH', `/payroll/runs/${run.id}/lines/${run.lines[0].id}`, { bonus: 1 })).status, 409, 'approved runs are locked');

  const w1 = a.body.lines.find((l) => l.worker_id === 'W1');
  const p = await req('acc', 'POST', `/payroll/runs/${run.id}/pay`, { method: 'bank_transfer', date: '2026-10-01', line_ids: [w1.id] });
  assert.equal(p.body.state, 'partial');
  e = books();
  assert.equal(accountBalance(e, 1020), -3200, 'bank paid the net salary');
  assert.equal(accountBalance(e, 2100), -2500);
  assert.equal((await req('acc', 'POST', `/payroll/runs/${run.id}/void`, { reason: 'x' })).status, 409, 'cannot void with payments');

  const all = await req('acc', 'POST', `/payroll/runs/${run.id}/pay`, { method: 'cash', date: '2026-10-01' });
  assert.equal(all.body.state, 'paid');
  e = books();
  assert.equal(accountBalance(e, 2100), 0, 'nothing owed any more');
  assert.ok(trialBalance(e).balanced);

  const st = await req('acc', 'GET', '/payroll/workers/W1');
  assert.equal(st.body.totals.debt, 700);
  const adv = store.list('worker_advances').find((x) => x.worker_id === 'W1');
  assert.equal((await req('acc', 'POST', `/payroll/advances/${adv.id}/void`, { reason: 'x' })).status, 409, 'a partly recovered advance cannot be voided');
  assert.equal(st.body.totals.salary_due, 0);
  assert.equal(st.body.totals.paid, 3200);
  const ov = await req('acc', 'GET', '/payroll');
  assert.equal(ov.body.totals.worker_debts, 700);
});

test('charge to a worker reduces that expense; repayment and void restore the books', async () => {
  await store.insert('expenses', { id: 'X1', date: '2026-09-10', category: 'housing', amount: 900, method: 'cash' });
  const c = await req('acc', 'POST', '/payroll/advances', { worker_id: 'W2', kind: 'charge', amount: 200, category: 'housing', date: '2026-09-11' });
  assert.equal(c.status, 201);
  let e = books();
  assert.equal(profitAndLoss(e, '2026-09-01', '2026-09-30').rows[0].by_category.housing, 700);
  const rp = await req('acc', 'POST', '/payroll/advances', { worker_id: 'W2', kind: 'repayment', amount: 200, method: 'cash', date: '2026-09-12' });
  assert.equal(rp.status, 201);
  assert.equal((await req('acc', 'GET', '/payroll/workers/W2')).body.totals.debt, 0);
  await req('acc', 'POST', `/payroll/advances/${rp.body.id}/void`, { reason: 'خطأ' });
  assert.equal((await req('acc', 'GET', '/payroll/workers/W2')).body.totals.debt, 200);
  assert.ok(trialBalance(books()).balanced);
  assert.equal((await req('owner', 'DELETE', '/data/workers/W2')).status, 409, 'workers with payroll history cannot be deleted');
});

test('dashboard period: custom range, comparison with the period before, payroll totals', async () => {
  const s = await req('owner', 'GET', '/summary?from=2026-09-01&to=2026-09-30');
  const f = s.body.finance;
  assert.equal(f.period.from, '2026-09-01');
  assert.equal(f.prev.from, '2026-08-01');
  assert.equal(f.prev.to, '2026-08-31');
  assert.equal(f.period.expenses, 6000 + 700);
  assert.ok(f.trend.length >= 6);
  assert.equal(f.payroll.worker_debts, 900);
  const y = await req('owner', 'GET', '/summary?from=2026-01-01&to=2026-12-31');
  assert.equal(y.body.finance.prev.from, '2025-01-01');
  assert.equal(y.body.finance.trend.length, 12);
  const odd = await req('owner', 'GET', '/summary?from=2026-09-10&to=2026-09-19');
  assert.deepEqual([odd.body.finance.prev.from, odd.body.finance.prev.to], ['2026-08-31', '2026-09-09']);
  assert.ok((await req('owner', 'GET', '/summary?from=bad&to=2026-01-01')).body.finance.period.from.endsWith('-01'), 'invalid dates fall back to this month');
});

test('owner-added expense categories keep their own name in reports', async () => {
  await req('owner', 'PUT', '/settings', { 'list.expense_category': JSON.stringify([{ code: 'uniforms', ar: 'زي العمال', en: 'Uniforms' }]) });
  const x = await req('acc', 'POST', '/data/expenses', { date: '2026-09-15', category: 'uniforms', amount: 150, method: 'cash' });
  assert.equal(x.status, 201);
  const r = await req('acc', 'GET', '/reports?from=2026-09-01&to=2026-09-30');
  assert.equal(r.body.pnl.rows[0].by_category.uniforms, 150);
});

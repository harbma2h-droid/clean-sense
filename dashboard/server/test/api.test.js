import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { Store } from '../store.js';
import { createApp } from '../app.js';

let server, base, store;
const jar = {};

async function req(who, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(jar[who] ? { Cookie: jar[who] } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.get('set-cookie');
  if (set && who) jar[who] = set.split(';')[0];
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}

before(async () => {
  store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-')), 'db.json') });
  await store.init();
  await store.insert('users', { id: 'U1', name: 'Owner', username: 'owner', role: 'owner', active: 'yes', password_hash: bcrypt.hashSync('Start123', 4), must_change_password: 'yes' });
  await store.insert('users', { id: 'U2', name: 'Acc', username: 'acc', role: 'accountant', active: 'yes', password_hash: bcrypt.hashSync('Acc12345', 4), must_change_password: 'no' });
  const app = createApp({ store, secret: 'x'.repeat(40), secureCookies: false, extraOrigins: ['http://test.local'] });
  await new Promise((r) => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}/api`;
});
after(() => server.close());

test('login, forced password change, then access', async () => {
  assert.equal((await req('o', 'POST', '/auth/login', { username: 'owner', password: 'wrong' })).status, 401);
  const r = await req('o', 'POST', '/auth/login', { username: 'OWNER', password: 'Start123' });
  assert.equal(r.status, 200);
  assert.equal(r.body.must_change_password, true);
  assert.equal((await req('o', 'GET', '/data/bookings')).status, 403, 'blocked until password changed');
  assert.equal((await req('o', 'POST', '/auth/password', { current: 'Start123', next: 'short' })).status, 400);
  const c = await req('o', 'POST', '/auth/password', { current: 'Start123', next: 'NewPass2026' });
  assert.equal(c.status, 200);
  assert.equal((await req('o', 'GET', '/data/bookings')).status, 200);
});

test('permissions: accountant cannot see bookings or users', async () => {
  assert.equal((await req('a', 'POST', '/auth/login', { username: 'acc', password: 'Acc12345' })).status, 200);
  assert.equal((await req('a', 'GET', '/data/bookings')).status, 403);
  assert.equal((await req('a', 'GET', '/users')).status, 403);
  assert.equal((await req('a', 'GET', '/payments')).status, 200);
  assert.equal((await req('a', 'GET', '/reports')).status, 200);
  assert.equal((await req('a', 'POST', '/data/bookings', { customer_name: 'x', date: '2026-11-01' })).status, 403);
  assert.equal((await req(null, 'GET', '/payments')).status, 401);
});

test('bookings CRUD with soft delete and validation', async () => {
  assert.equal((await req('o', 'POST', '/data/bookings', { customer_name: 'X' })).status, 400, 'date required');
  assert.equal((await req('o', 'POST', '/data/bookings', { customer_name: 'X', date: '2026-11-01', status: 'nope' })).status, 400, 'bad enum');
  const c = await req('o', 'POST', '/data/bookings', { customer_name: '=IMPORTXML("x")', date: '2026-11-01', services: ['deep_cleaning', 'ac_cleaning'] });
  assert.equal(c.status, 201);
  assert.equal(c.body.status, 'pending');
  assert.equal(c.body.services, 'deep_cleaning,ac_cleaning');
  assert.equal(c.body.customer_name, '=IMPORTXML("x")', 'stored as text, not a formula');
  const p = await req('o', 'PATCH', `/data/bookings/${c.body.id}`, { status: 'confirmed', id: 'HACK' });
  assert.equal(p.body.status, 'confirmed');
  assert.equal(p.body.id, c.body.id, 'id cannot be changed');
  assert.equal((await req('o', 'DELETE', `/data/bookings/${c.body.id}`)).status, 204);
  const list = await req('o', 'GET', '/data/bookings');
  assert.equal(list.body.length, 0);
  assert.ok(store.get('bookings', c.body.id).deleted_at, 'row kept with deleted_at');
  assert.ok(store.list('audit_log').some((a) => a.action === 'delete'));
});

test('public lead: validation, honeypot, idempotency, CORS, convert', async () => {
  const bad = await req(null, 'POST', '/public/leads', { customer_name: 'A', phone: '123' });
  assert.equal(bad.status, 400);
  const bot = await req(null, 'POST', '/public/leads', { customer_name: 'A', phone: '0537717716', website: 'spam' });
  assert.equal(bot.status, 201);
  assert.equal(store.list('leads').length, 0, 'honeypot not stored');
  const body = { customer_name: 'عميل', phone: '0537717716', service_code: 'ac_cleaning', city: 'dhahran', idempotency_key: 'k1', language: 'en' };
  const r1 = await req(null, 'POST', '/public/leads', body, { Origin: 'http://test.local' });
  assert.equal(r1.status, 201);
  assert.match(r1.body.id, /^CS-\d{4}-0001$/);
  assert.equal(r1.headers.get('access-control-allow-origin'), 'http://test.local');
  const r2 = await req(null, 'POST', '/public/leads', body);
  assert.equal(r2.body.id, r1.body.id);
  assert.equal(r2.body.duplicate, true);
  assert.equal(store.list('leads').length, 1);
  const conv = await req('o', 'POST', `/data/leads/${r1.body.id}/convert`);
  assert.equal(conv.status, 201);
  assert.equal(conv.body.lead_id, r1.body.id);
  assert.equal(store.get('leads', r1.body.id).status, 'booked');
  assert.equal((await req('o', 'POST', `/data/leads/${r1.body.id}/convert`)).status, 409);
});

test('users: create with temp password, cannot lock yourself out', async () => {
  const c = await req('o', 'POST', '/users', { name: 'عمار', username: 'ammar', role: 'ops_manager', language: 'en' });
  assert.equal(c.status, 201);
  assert.ok(c.body.temporary_password.length >= 8);
  assert.equal(c.body.user.password_hash, undefined);
  const list = await req('o', 'GET', '/users');
  assert.ok(list.body.every((u) => u.password_hash === undefined));
  assert.equal((await req('o', 'PATCH', '/users/U1', { active: false })).status, 400);
  const login = await req('m', 'POST', '/auth/login', { username: 'ammar', password: c.body.temporary_password });
  assert.equal(login.body.language, 'en');
});

test('account locks after 5 wrong passwords', async () => {
  for (let i = 0; i < 5; i++) await req('x', 'POST', '/auth/login', { username: 'acc', password: 'nope' });
  const r = await req('x', 'POST', '/auth/login', { username: 'acc', password: 'Acc12345' });
  assert.equal(r.status, 429);
});

test('open access: no sign-in needed, acts as owner; off by default', async () => {
  assert.equal((await req(null, 'GET', '/auth/me')).status, 401);
  const app = createApp({ store, secret: 'x'.repeat(40), secureCookies: false, openAccess: true });
  const s = await new Promise((r) => { const x = app.listen(0, () => r(x)); });
  try {
    const res = await fetch(`http://127.0.0.1:${s.address().port}/api/auth/me`);
    const me = await res.json();
    assert.equal(res.status, 200);
    assert.equal(me.role, 'owner');
    assert.equal(me.must_change_password, false);
    const meta = await (await fetch(`http://127.0.0.1:${s.address().port}/api/meta`)).json();
    assert.equal(meta.open_access, true);
  } finally {
    s.close();
  }
});

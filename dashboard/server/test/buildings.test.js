// Building management: type A template, roles per building, resident approval by the
// representative, and one-time sign-in links for phone-only accounts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { Store } from '../store.js';
import { createApp } from '../app.js';
import { notificationText } from '../../shared/buildings.js';

let server, base, origin, store, site;
const jar = {};

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
const tokenOf = (url) => url.split('/l/')[1];

before(async () => {
  store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-b-')), 'db.json') });
  await store.init();
  await store.insert('users', { id: 'U1', name: 'Owner', username: 'owner', role: 'owner', active: 'yes', password_hash: bcrypt.hashSync('Owner123', 4), must_change_password: 'no' });
  await store.insert('users', { id: 'U2', name: 'Acc', username: 'acc', role: 'accountant', active: 'yes', password_hash: bcrypt.hashSync('Acc12345', 4), must_change_password: 'no' });
  await store.insert('workers', { id: 'W1', name: 'فني 1', phone: '0555000111', status: 'active' });
  const app = createApp({ store, secret: 'x'.repeat(40), secureCookies: false });
  await new Promise((r) => { server = app.listen(0, r); });
  origin = `http://127.0.0.1:${server.address().port}`;
  base = `${origin}/api`;
  assert.equal((await req('o', 'POST', '/auth/login', { username: 'owner', password: 'Owner123' })).status, 200);
  assert.equal((await req('a', 'POST', '/auth/login', { username: 'acc', password: 'Acc12345' })).status, 200);
});
after(() => server.close());

test('type A template creates building 5 with 26 units, common areas and 3 QR points', async () => {
  assert.equal((await req('a', 'POST', '/buildings/from-template', { code: 'AJ-05', name: 'x' })).status, 403, 'needs the buildings permission');
  const r = await req('o', 'POST', '/buildings/from-template', { code: 'aj-05', name: 'عمارة 5 - سكن أجيال', district: 'أجيال', city: 'dhahran', response_hours: 2 });
  assert.equal(r.status, 201);
  site = r.body.site;
  assert.equal(site.code, 'AJ-05');
  assert.equal(r.body.units.length, 26);
  assert.deepEqual(r.body.units.slice(0, 3).map((u) => u.code), ['001', '002', '101']);
  assert.equal(r.body.units.at(-1).code, '604');
  assert.equal(r.body.units.find((u) => u.code === '302').floor, 3);
  // Owner's numbering, same on every floor, back to the lift: 01 right, 02 left, 03 opposite 01, 04 opposite 02.
  const pos = Object.fromEntries(r.body.units.map((u) => [u.code, u.position]));
  assert.match(pos['301'], /^يمين المصعد/);
  assert.match(pos['302'], /^يسار المصعد/);
  assert.equal(pos['303'], 'مقابل شقة 301');
  assert.equal(pos['304'], 'مقابل شقة 302');
  assert.match(pos['001'], /^يمين/);
  assert.match(pos['002'], /^يسار/);
  assert.ok(r.body.zones.some((z) => z.code === 'PUMPS') && r.body.zones.some((z) => z.code === 'ELEV-ROOM'));
  assert.deepEqual(r.body.qr_points.map((q) => q.kind).sort(), ['elevators', 'fire_pumps', 'lobby']);
  assert.ok(r.body.qr_points.every((q) => q.token.length >= 16), 'QR codes are not guessable');
  assert.equal((await req('o', 'POST', '/buildings/from-template', { code: 'AJ-05', name: 'again' })).status, 409);
  const c = await req('o', 'POST', '/buildings/from-template', { code: 'AJ-04', name: 'عمارة 4', building_type: 'C' });
  assert.equal(c.body.site.building_type, 'C', 'types B and C share the layout, only the type is recorded');
  assert.equal(c.body.units.length, 26);
  assert.equal((await req('o', 'POST', '/buildings/from-template', { code: 'bad code!', name: 'x' })).status, 400);
});

test('report types: defaults added once, priority by type', async () => {
  const r = await req('o', 'POST', '/buildings/ticket-types/seed');
  assert.equal(r.status, 201);
  assert.equal(r.body.added, 27);
  assert.equal((await req('o', 'POST', '/buildings/ticket-types/seed')).body.added, 0);
  const types = (await req('o', 'GET', `/buildings/${site.id}`)).body.ticket_types;
  const by = Object.fromEntries(types.map((t) => [t.code, t]));
  assert.equal(by.lift_trapped.priority, 'critical');
  assert.equal(by.water_leak.priority, 'urgent');
  assert.equal(Number(by.water_leak.ack_minutes), 30);
  assert.equal(Number(by.water_leak.fix_minutes), 240);
  assert.equal(Number(by.lobby.ack_minutes), 1440);
  assert.equal(by.in_unit.in_unit, 'yes');
  assert.ok(by.pests.name_bn, 'Bengali name for workers');
});

test('units and codes stay unique; a building in use cannot be deleted', async () => {
  assert.equal((await req('o', 'POST', '/data/units', { site_id: site.id, code: '101', floor: 1 })).status, 409);
  const other = await req('o', 'POST', '/data/sites', { code: 'AJ-11', name: 'عمارة 11' });
  assert.equal(other.status, 201);
  assert.equal((await req('o', 'POST', '/data/units', { site_id: other.body.id, code: '101', floor: 1 })).status, 201, 'same number in another building is fine');
  assert.equal((await req('o', 'DELETE', `/data/sites/${site.id}`)).status, 409);
  assert.ok((await req('o', 'GET', '/lookup/sites')).body.some((s) => s.code === 'AJ-11'));
});

let repMember, resMember;
test('representative and resident: one customers table, rep approves residents', async () => {
  const units = (await req('o', 'GET', `/buildings/${site.id}`)).body.units;
  const u101 = units.find((u) => u.code === '101').id;
  const u302 = units.find((u) => u.code === '302').id;

  // A resident who is already a cleaning customer keeps the same customer record.
  const cust = await req('o', 'POST', '/data/customers', { name: 'سارة', phone: '0500000002' });
  assert.equal(cust.status, 201);
  const before = (await req('o', 'GET', '/data/customers')).body.length;

  assert.equal((await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'resident', name: 'سارة', phone: '0500000002' })).status, 400, 'a resident needs a unit');
  const rep = await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'rep', name: 'مشعل', phone: '+966 50 000 0001', unit_id: u101 });
  assert.equal(rep.status, 201);
  assert.equal(rep.body.status, 'active');
  assert.equal(rep.body.user.kind, 'resident');
  repMember = rep.body;

  const res = await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'resident', name: 'سارة', phone: '٠٥٠٠٠٠٠٠٠٢', unit_id: u302 });
  assert.equal(res.status, 201);
  assert.equal(res.body.status, 'pending', 'residents wait for the representative');
  resMember = res.body;
  assert.equal((await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'resident', name: 'سارة', phone: '0500000002', unit_id: u302 })).status, 409);

  const customers = (await req('o', 'GET', '/data/customers')).body;
  assert.equal(customers.length, before + 1, 'only the representative was new; Sara kept her customer record');
  assert.equal(store.get('users', resMember.user.id).customer_id, cust.body.id);
  assert.ok(customers.some((c) => c.phone === '0500000001' && c.source === 'بوابة المبنى'));

  assert.equal((await req('o', 'POST', `/buildings/members/${resMember.id}/decision`, { decision: 'approve' })).body.error, 'rep_only');
  assert.equal((await req('o', 'POST', `/buildings/members/${resMember.id}/link`)).status, 409, 'no link before approval');
});

test('sign-in link: works once, then the representative approves the resident', async () => {
  const link = await req('o', 'POST', `/buildings/members/${repMember.id}/link`);
  assert.equal(link.status, 201);
  assert.ok(link.body.url.startsWith(`${origin}/l/`));
  assert.ok(link.body.whatsapp.startsWith('https://wa.me/966500000001?text='));
  assert.ok(!JSON.stringify(store.list('login_links')).includes(tokenOf(link.body.url)), 'only a fingerprint is stored');

  const page = await fetch(link.body.url);
  assert.equal(page.status, 200);
  assert.equal(store.list('login_links').filter((l) => !l.used_at).length, 1, 'opening the page (or a WhatsApp preview) does not use the link');

  const login = await req('rep', 'POST', '/auth/link', { token: tokenOf(link.body.url) });
  assert.equal(login.status, 200);
  assert.equal(login.body.kind, 'resident');
  assert.deepEqual(login.body.permissions, [], 'no access to the internal system');
  assert.equal((await req('x', 'POST', '/auth/link', { token: tokenOf(link.body.url) })).status, 410, 'one time only');

  const me = await req('rep', 'GET', '/portal/me');
  assert.equal(me.body[0].role, 'rep');
  assert.equal(me.body[0].unit.code, '101');
  assert.equal((await req('rep', 'GET', '/data/customers')).status, 403);
  assert.equal((await req('rep', 'GET', `/buildings/${site.id}`)).status, 200);
  assert.equal((await req('rep', 'POST', `/buildings/${site.id}/members`, { role: 'resident', name: 'x', phone: '0500000009', unit_id: repMember.unit_id })).status, 403, 'the representative only approves');

  const ok = await req('rep', 'POST', `/buildings/members/${resMember.id}/decision`, { decision: 'approve' });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.status, 'active');
  assert.equal((await req('rep', 'POST', `/buildings/members/${resMember.id}/decision`, { decision: 'reject' })).body.error, 'already_decided');

  const resLink = await req('o', 'POST', `/buildings/members/${resMember.id}/link`);
  assert.equal((await req('res', 'POST', '/auth/link', { token: tokenOf(resLink.body.url) })).status, 200);
  assert.equal((await req('res', 'GET', `/buildings/${site.id}`)).status, 403, 'residents do not see the building admin data');
});

test('expired links and new links close the old ones', async () => {
  const a = await req('o', 'POST', `/buildings/members/${repMember.id}/link`);
  const b = await req('o', 'POST', `/buildings/members/${repMember.id}/link`);
  assert.equal((await req('y', 'POST', '/auth/link', { token: tokenOf(a.body.url) })).status, 410, 'a newer link replaces it');
  const live = store.list('login_links').find((l) => !l.used_at);
  await store.patch('login_links', live.id, { expires_at: new Date(Date.now() - 1000).toISOString() });
  assert.equal((await req('y', 'POST', '/auth/link', { token: tokenOf(b.body.url) })).status, 410, 'expired');
  assert.equal((await req('y', 'POST', '/auth/link', { token: 'short' })).status, 410);
});

test('contractor: approved phone can change, old sessions stop', async () => {
  assert.equal((await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'vendor', name: 'TKE', phone: '0566000001' })).status, 400, 'company name required');
  const v = await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'vendor', vendor: 'TKE', name: 'مسؤول TKE', phone: '0566000001' });
  assert.equal(v.status, 201);
  assert.equal(v.body.status, 'active');
  const link = await req('o', 'POST', `/buildings/members/${v.body.id}/link`);
  assert.equal((await req('tke', 'POST', '/auth/link', { token: tokenOf(link.body.url) })).status, 200);
  assert.equal((await req('tke', 'GET', '/portal/me')).body[0].vendor, 'TKE');

  const ch = await req('o', 'POST', `/buildings/members/${v.body.id}/phone`, { phone: '0566000002', name: 'مسؤول TKE الجديد' });
  assert.equal(ch.status, 201);
  assert.equal(ch.body.user.phone, '0566000002');
  assert.equal((await req('tke', 'GET', '/portal/me')).status, 401, 'the old phone holder is signed out');

  assert.equal((await req('o', 'POST', `/buildings/members/${v.body.id}/status`, { status: 'inactive' })).status, 201);
  assert.equal((await req('o', 'POST', `/buildings/members/${v.body.id}/link`)).status, 409, 'stopped: no new links');
});

test('notification wording: short, building first, critical stays on screen', () => {
  const s = { name: 'عمارة 5 - سكن أجيال', code: 'AJ-05' };
  const crit = notificationText('new_ticket', s, { priority: 'critical', type: 'أحد محبوس في المصعد', place: 'المصاعد', number: 1047 });
  assert.equal(crit.title, '🚨 بلاغ خطير — عمارة 5 - سكن أجيال');
  assert.equal(crit.body, 'أحد محبوس في المصعد · المصاعد · رقم 1047. افتح البلاغ الحين.');
  assert.equal(crit.urgent, true);
  const norm = notificationText('new_ticket', s, { priority: 'normal', type: 'اللوبي يبي تنظيف', place: 'اللوبي', number: 1048 });
  assert.equal(norm.urgent, false);
  assert.ok(norm.title.startsWith('بلاغ جديد'));
  assert.match(notificationText('escalated', s, { type: 'تسريب موية', number: 7, minutes: 30, reason: 'pickup' }).body, /ما أحد استلمه من 30 دقيقة/);
  assert.match(notificationText('assigned', s, { type: 'x', place: 'y', lang: 'bn' }).title, /^নতুন কাজ/);
  const long = notificationText('notice', s, { title: 'تنبيه', text: 'ا'.repeat(400) });
  assert.ok(long.body.length <= 140 && long.body.endsWith('…'));
  for (const k of ['resolved', 'pm_reminder', 'member_pending']) assert.ok(notificationText(k, s, { type: 'x', title: 'y', date: '2026-11-07', name: 'n', unit: '302', number: 1 }).title.length <= 50);
  assert.throws(() => notificationText('nope', s));
});

test('field staff link to the workers table; staff list stays staff only', async () => {
  const t = await req('o', 'POST', `/buildings/${site.id}/members`, { role: 'technician', name: 'فني 1', phone: '0555000111' });
  assert.equal(t.status, 201);
  assert.equal(store.get('users', t.body.user.id).worker_id, 'W1', 'same worker for bookings and building reports');
  const users = (await req('o', 'GET', '/users')).body;
  assert.ok(users.every((u) => u.kind === 'staff'), 'residents and contractors are not in the staff list');
  assert.equal(users.length, 2);
});

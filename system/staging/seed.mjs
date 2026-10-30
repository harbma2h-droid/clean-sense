// Fills a TEST environment with fake data: an owner login, a few customers and workers, and
// building 5 (Ajyal) from the type A template with fake residents, staff and contractors.
//
//   STAGING_DB_URL=mysql://user:pass@host:port/cleansense_staging node system/staging/seed.mjs
//
// It refuses any database whose name does not contain "staging" or "test", so it can never
// touch the real system. The owner's password is written to STAGING_SECRETS (a private file
// outside the project), never printed.

import { appendFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { Store } from '../../dashboard/server/store.js';
import { PERMISSIONS } from '../../dashboard/shared/model.js';
import { createRecord } from '../../dashboard/shared/services.js';
import { createSiteFromTemplate, seedTicketTypes, addMember, decideMember } from '../../dashboard/shared/buildings.js';

// bcryptjs lives with the system's packages (dashboard/node_modules).
const bcrypt = createRequire(new URL('../../dashboard/package.json', import.meta.url))('bcryptjs');

const url = process.env.STAGING_DB_URL;
if (!url) throw new Error('Set STAGING_DB_URL');
const db = new URL(url).pathname.slice(1);
if (!/staging|test/i.test(db)) throw new Error(`Refusing "${db}": the database name must contain "staging" or "test"`);

const store = new Store({ kind: 'mysql', url });
await store.init();
if (store.list('users').length) {
  console.log('Already seeded: nothing changed.');
  await store.backend.close?.();
  process.exit(0);
}

const password = randomBytes(9).toString('base64url');
const owner = await store.insert('users', {
  id: 'US-OWNER', name: 'مالك تجريبي', username: 'owner', job_title: 'المالك', role: 'owner', language: 'ar', active: 'yes', kind: 'staff',
  password_hash: bcrypt.hashSync(password, 10), must_change_password: 'no',
});
if (process.env.STAGING_SECRETS) appendFileSync(process.env.STAGING_SECRETS, `STAGING_OWNER=owner\nSTAGING_OWNER_PASSWORD=${password}\n`);

const ctx = {
  store, user: owner, perms: Object.keys(PERMISSIONS),
  audit: (action, entity, id, details = '') => store.insert('audit_log', { at: new Date().toISOString(), user: 'seed', action, entity, entity_id: id, details: typeof details === 'string' ? details : JSON.stringify(details) }),
};

// Fake people only (05000xxxxx numbers are not real customers).
for (const [name, phone, city] of [['عميل تجريبي 1', '0500000101', 'khobar'], ['عميل تجريبي 2', '0500000102', 'dammam'], ['شركة تجريبية', '0500000103', 'dhahran']]) {
  await createRecord(ctx, 'customers', { name, phone, city, source: 'بيانات تجريبية' });
}
for (const [name, phone, role] of [['فني تجريبي 1', '0500000201', 'فني صيانة'], ['فني تجريبي 2', '0500000202', 'فني صيانة'], ['عامل نظافة تجريبي 1', '0500000203', 'عامل نظافة'], ['عامل نظافة تجريبي 2', '0500000204', 'عامل نظافة']]) {
  await createRecord(ctx, 'workers', { name, phone, role, status: 'active', employment_type: 'full_time' });
}

await seedTicketTypes(ctx);
const { site, units } = await createSiteFromTemplate(ctx, {
  code: 'AJ-05', name: 'عمارة 5 - سكن أجيال', name_en: 'Building 5 - Ajyal', district: 'سكن أجيال', city: 'dhahran',
  notes: 'بيئة تجريبية: كل الأسماء والأرقام وهمية.',
});
const unit = (code) => units.find((u) => u.code === code).id;

await addMember(ctx, site.id, { role: 'manager', name: 'مدير تجريبي', phone: '0500000301' });
await addMember(ctx, site.id, { role: 'maint_supervisor', name: 'مشرف صيانة تجريبي', phone: '0500000302' });
await addMember(ctx, site.id, { role: 'clean_supervisor', name: 'مشرف نظافة تجريبي', phone: '0500000303' });
await addMember(ctx, site.id, { role: 'technician', name: 'فني تجريبي 1', phone: '0500000201' });
await addMember(ctx, site.id, { role: 'cleaner', name: 'عامل نظافة تجريبي 1', phone: '0500000203' });
await addMember(ctx, site.id, { role: 'vendor', vendor: 'TKE', name: 'مسؤول TKE تجريبي', phone: '0500000401' });
await addMember(ctx, site.id, { role: 'vendor', vendor: 'رماد', name: 'مسؤول رماد تجريبي', phone: '0500000402' });
await addMember(ctx, site.id, { role: 'rep', name: 'ممثل العمارة التجريبي', phone: '0500000501', unit_id: unit('101') });
const residents = [];
for (const [i, code] of ['102', '201', '302', '404', '601', '001'].entries()) {
  residents.push(await addMember(ctx, site.id, { role: 'resident', name: `ساكن تجريبي ${code}`, phone: `05000006${String(i + 1).padStart(2, '0')}`, unit_id: unit(code) }));
}
// The representative approves four; two stay waiting so the approval screen has something to show.
const rep = store.list('users').find((u) => u.phone === '0500000501');
const repCtx = { ...ctx, user: rep, perms: [] };
for (const m of residents.slice(0, 4)) await decideMember(repCtx, m.id, 'approve');

console.log(`Seeded ${db}: building ${site.code} with ${units.length} units, ${store.list('site_members').length} people, ${store.list('ticket_types').length} report types.`);
await store.backend.close?.();

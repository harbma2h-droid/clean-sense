// Building management: buildings, units, common areas, QR points, who does what in each
// building, and sign-in links for people who use only their phone number (residents,
// contractor companies, field staff). Same ctx and store as services.js.
//
// Rules (owner's reference document, 2026-10-30):
// - One customers table: a resident is a customer. One staff table: field staff are workers.
// - Roles are per building: a person can be a technician in one building and nothing in another.
// - The building representative approves residents (and only that). While a building has no
//   active representative, staff with the "buildings" permission can approve instead.
// - Phone-only accounts sign in through a one-time link the manager sends on WhatsApp.

import { ServiceError, normPhone, validPhone, newId, newToken } from './services.js';
import { ENUMS } from './model.js';

const fail = (status, code, extra) => { throw new ServiceError(status, code, extra); };
const nowIso = () => new Date().toISOString();
const can = (ctx, perm) => ctx.perms.includes(perm);

export const LINK_HOURS = 72;

/** sha256 hex of a link token; only the fingerprint is stored, never the token itself. */
export async function tokenHash(token) {
  const d = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(token)));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const liveSite = (ctx, id) => {
  const s = ctx.store.get('sites', id);
  if (!s || s.deleted_at) fail(404, 'not_found');
  return s;
};
const members = (ctx, siteId) => ctx.store.list('site_members').filter((m) => m.site_id === siteId);

/** Active roles of a user, optionally in one building. */
export function rolesOf(ctx, userId, siteId) {
  return ctx.store.list('site_members').filter((m) => m.user_id === userId && m.status === 'active' && (!siteId || m.site_id === siteId));
}
const hasRole = (ctx, siteId, roles) => !!ctx.user && rolesOf(ctx, ctx.user.id, siteId).some((m) => roles.includes(m.role));
const isSiteManager = (ctx, siteId) => can(ctx, 'buildings') || hasRole(ctx, siteId, ['manager']);

function userView(ctx, userId) {
  const u = ctx.store.get('users', userId);
  return u ? { id: u.id, name: u.name, phone: u.phone, kind: u.kind || 'staff', active: u.active !== 'no' } : null;
}

/* ================= Buildings ================= */

export function listSites(ctx) {
  return ctx.store.list('sites').map((s) => {
    const m = members(ctx, s.id);
    return {
      ...s,
      units_total: ctx.store.list('units').filter((u) => u.site_id === s.id).length,
      residents_active: m.filter((x) => x.role === 'resident' && x.status === 'active').length,
      residents_pending: m.filter((x) => x.role === 'resident' && x.status === 'pending').length,
    };
  });
}

export function getSite(ctx, id) {
  const site = liveSite(ctx, id);
  if (!isSiteManager(ctx, id) && !hasRole(ctx, id, ['rep'])) fail(403, 'forbidden');
  const byCode = (a, b) => String(a.code).localeCompare(String(b.code), 'en', { numeric: true });
  return {
    site,
    units: ctx.store.list('units').filter((u) => u.site_id === id).sort(byCode),
    zones: ctx.store.list('zones').filter((z) => z.site_id === id).sort(byCode),
    qr_points: ctx.store.list('qr_points').filter((q) => q.site_id === id),
    members: members(ctx, id).map((m) => ({ ...m, user: userView(ctx, m.user_id) })),
    ticket_types: ticketTypes(ctx, id),
  };
}

export function ticketTypes(ctx, siteId) {
  return ctx.store.list('ticket_types')
    .filter((t) => t.active !== 'no' && (!t.site_id || t.site_id === siteId))
    .sort((a, b) => Number(a.sort || 0) - Number(b.sort || 0));
}

/* ================= People in a building ================= */

// Finds the account for a phone number, or creates a phone-only one.
async function accountFor(ctx, { name, phone, kind }) {
  const users = ctx.store.list('users', { includeDeleted: true });
  const existing = users.find((u) => normPhone(u.phone) === phone && !u.deleted_at);
  if (existing) {
    if (existing.active === 'no') fail(409, 'account_inactive', { id: existing.id });
    return existing;
  }
  return ctx.store.insert('users', {
    id: newId('us'), name, username: `p${phone}`, phone, kind, role: 'portal', permissions: '', language: 'ar', active: 'yes',
    password_hash: '', must_change_password: 'no', login_version: newToken(6),
  });
}

// A resident is a customer (one customers table for cleaning and buildings).
async function customerFor(ctx, { name, phone, site, unit }) {
  const found = ctx.store.list('customers').find((c) => normPhone(c.phone) === phone);
  if (found) return found;
  const all = ctx.store.list('customers', { includeDeleted: true });
  const max = all.reduce((m, c) => Math.max(m, Number(String(c.code || '').match(/^CUS-(\d+)$/)?.[1] || 0)), 0);
  const row = await ctx.store.insert('customers', {
    id: newId('cu'), code: `CUS-${String(max + 1).padStart(4, '0')}`, name, phone, type: 'individual', city: site.city || '',
    district: site.district || '', address: [site.name, unit ? `شقة ${unit.code}` : ''].filter(Boolean).join(' - '),
    language: 'ar', source: 'بوابة المبنى', created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '',
  });
  await ctx.audit('create', 'customers', row.id, { via: 'building', site_id: site.id });
  return row;
}

const KIND_OF_ROLE = { resident: 'resident', rep: 'resident', vendor: 'vendor', technician: 'field', cleaner: 'field', maint_supervisor: 'field', clean_supervisor: 'field', manager: 'field' };

/**
 * Adds a person to a building with a role. Residents start as "pending" until the
 * representative approves them; everyone else is active straight away.
 * Residents may also ask for themselves (ctx.user is then empty and selfRequest is true).
 */
export async function addMember(ctx, siteId, body = {}, { selfRequest = false } = {}) {
  const site = liveSite(ctx, siteId);
  if (site.status === 'inactive') fail(409, 'site_inactive');
  const role = String(body.role || '');
  if (!ENUMS.site_role[role]) fail(400, 'validation', { fields: ['role:invalid'] });
  if (selfRequest ? role !== 'resident' : !isSiteManager(ctx, siteId)) fail(403, 'forbidden');
  const phone = validPhone(body.phone);
  const name = String(body.name || '').trim().slice(0, 120);
  const errors = [];
  if (!phone) errors.push('phone:invalid');
  if (!name) errors.push('name:required');
  let unit = null;
  if (role === 'resident' || role === 'rep') {
    unit = ctx.store.get('units', body.unit_id);
    if (!unit || unit.deleted_at || unit.site_id !== siteId) errors.push('unit_id:required');
  }
  if (role === 'vendor' && !String(body.vendor || '').trim()) errors.push('vendor:required');
  if (errors.length) fail(400, 'validation', { fields: errors });

  const user = await accountFor(ctx, { name, phone, kind: KIND_OF_ROLE[role] });
  const open = members(ctx, siteId).find((m) => m.user_id === user.id && m.role === role && ['active', 'pending'].includes(m.status) && (m.unit_id || '') === (unit?.id || ''));
  if (open) fail(409, 'already_member', { id: open.id, status: open.status });

  const patch = {};
  if (role === 'resident' || role === 'rep') patch.customer_id = user.customer_id || (await customerFor(ctx, { name, phone, site, unit })).id;
  if (KIND_OF_ROLE[role] === 'field' && !user.worker_id) {
    const w = ctx.store.list('workers').find((x) => normPhone(x.phone) === phone);
    if (w) patch.worker_id = w.id;
  }
  if (Object.keys(patch).length) await ctx.store.patch('users', user.id, patch);

  const row = await ctx.store.insert('site_members', {
    id: newId('sm'), site_id: siteId, user_id: user.id, role, unit_id: unit?.id || '', vendor: String(body.vendor || '').trim().slice(0, 80),
    status: role === 'resident' ? 'pending' : 'active', requested_at: nowIso(), notes: String(body.notes || '').slice(0, 1000),
    created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || (selfRequest ? 'self' : ''),
  });
  await ctx.audit('create', 'site_members', row.id, { site_id: siteId, role, user_id: user.id });
  return { ...row, user: userView(ctx, user.id) };
}

/** The representative approves or rejects a resident (staff may, while the building has no representative). */
export async function decideMember(ctx, memberId, decision) {
  const m = ctx.store.get('site_members', memberId);
  if (!m || m.deleted_at) fail(404, 'not_found');
  if (m.role !== 'resident') fail(409, 'not_a_resident');
  if (m.status !== 'pending') fail(409, 'already_decided', { status: m.status });
  if (!['approve', 'reject'].includes(decision)) fail(400, 'validation', { fields: ['decision:invalid'] });
  const repExists = members(ctx, m.site_id).some((x) => x.role === 'rep' && x.status === 'active');
  const allowed = hasRole(ctx, m.site_id, ['rep']) || (!repExists && isSiteManager(ctx, m.site_id));
  if (!allowed) fail(403, repExists ? 'rep_only' : 'forbidden');
  const status = decision === 'approve' ? 'active' : 'rejected';
  const row = await ctx.store.patch('site_members', memberId, { status, decided_by: ctx.user.id, decided_at: nowIso(), updated_at: nowIso() });
  await ctx.audit(decision, 'site_members', memberId, { site_id: m.site_id });
  return row;
}

/** Stops or restarts someone's role in a building (manager). Stopping also ends their open sign-in links. */
export async function setMemberStatus(ctx, memberId, status) {
  const m = ctx.store.get('site_members', memberId);
  if (!m || m.deleted_at) fail(404, 'not_found');
  if (!isSiteManager(ctx, m.site_id)) fail(403, 'forbidden');
  if (!['active', 'inactive'].includes(status)) fail(400, 'validation', { fields: ['status:invalid'] });
  if (m.status === 'pending' || m.status === 'rejected') fail(409, 'not_decided');
  const row = await ctx.store.patch('site_members', memberId, { status, updated_at: nowIso() });
  if (status === 'inactive') await closeLinks(ctx, m.user_id);
  await ctx.audit(status === 'inactive' ? 'stop' : 'restart', 'site_members', memberId, { site_id: m.site_id });
  return row;
}

/**
 * Changes the approved phone of a phone-only account (e.g. a contractor's new contact).
 * Their current sessions and links stop working; a new link goes to the new number.
 */
export async function changeMemberPhone(ctx, memberId, body = {}) {
  const m = ctx.store.get('site_members', memberId);
  if (!m || m.deleted_at) fail(404, 'not_found');
  if (!isSiteManager(ctx, m.site_id)) fail(403, 'forbidden');
  const phone = validPhone(body.phone);
  if (!phone) fail(400, 'validation', { fields: ['phone:invalid'] });
  const user = ctx.store.get('users', m.user_id);
  if (!user || (user.kind || 'staff') === 'staff') fail(409, 'staff_account');
  const taken = ctx.store.list('users').find((u) => u.id !== user.id && normPhone(u.phone) === phone);
  if (taken) fail(409, 'duplicate_phone');
  const patch = { phone, username: `p${phone}`, login_version: newToken(6) };
  if (body.name) patch.name = String(body.name).trim().slice(0, 120);
  await ctx.store.patch('users', user.id, patch);
  await closeLinks(ctx, user.id);
  await ctx.audit('change_phone', 'users', user.id, { site_member: memberId });
  return { ...m, user: userView(ctx, user.id) };
}

/* ================= Sign-in links ================= */

async function closeLinks(ctx, userId) {
  for (const l of ctx.store.list('login_links').filter((x) => x.user_id === userId && !x.used_at)) {
    await ctx.store.patch('login_links', l.id, { used_at: nowIso(), updated_at: nowIso() });
  }
}

/**
 * One-time sign-in link for a phone-only account, valid LINK_HOURS. Returns the link and a
 * ready WhatsApp message; the manager sends it from their own WhatsApp. Older unused links close.
 */
export async function createLoginLink(ctx, memberId, { origin = '' } = {}) {
  const m = ctx.store.get('site_members', memberId);
  if (!m || m.deleted_at) fail(404, 'not_found');
  if (!isSiteManager(ctx, m.site_id)) fail(403, 'forbidden');
  if (m.status !== 'active') fail(409, 'member_not_active', { status: m.status });
  const user = ctx.store.get('users', m.user_id);
  if (!user || user.active === 'no') fail(409, 'account_inactive');
  if ((user.kind || 'staff') === 'staff') fail(409, 'staff_account');
  await closeLinks(ctx, user.id);
  const token = newToken(24);
  const expires = new Date(Date.now() + LINK_HOURS * 3600e3).toISOString();
  await ctx.store.insert('login_links', { id: newId('ll'), user_id: user.id, token_hash: await tokenHash(token), expires_at: expires, created_at: nowIso(), created_by: ctx.user?.username || '' });
  await ctx.audit('create_link', 'users', user.id, { site_member: memberId });
  const site = ctx.store.get('sites', m.site_id);
  const url = `${origin}/l/${token}`;
  const message = `هلا ${user.name} 👋\nهذا رابط دخولك لتطبيق كلين سنس (${site?.name || ''}).\nالرابط يشتغل مرة وحدة، وصالح ${LINK_HOURS} ساعة:\n${url}\n\nلا ترسله لأحد.`;
  const digits = normPhone(user.phone).replace(/^0/, '966');
  return { url, expires_at: expires, message, whatsapp: `https://wa.me/${digits}?text=${encodeURIComponent(message)}` };
}

/** Uses a sign-in link once. Returns the user, or null when the link is unknown, used, expired, or the person has no active role. */
export async function consumeLoginLink(store, token) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(String(token || ''))) return null;
  const hash = await tokenHash(token);
  const link = store.list('login_links').find((l) => l.token_hash === hash);
  if (!link || link.used_at || Date.parse(link.expires_at) < Date.now()) return null;
  await store.patch('login_links', link.id, { used_at: nowIso(), updated_at: nowIso() });
  const user = store.get('users', link.user_id);
  if (!user || user.active === 'no' || user.deleted_at) return null;
  const active = store.list('site_members').some((m) => m.user_id === user.id && m.status === 'active');
  return active ? user : null;
}

/** What a phone-only user sees about themselves: their buildings and roles. */
export function myBuildings(ctx) {
  return rolesOf(ctx, ctx.user.id).map((m) => {
    const site = ctx.store.get('sites', m.site_id);
    const unit = m.unit_id ? ctx.store.get('units', m.unit_id) : null;
    return { member_id: m.id, role: m.role, vendor: m.vendor, site: site && { id: site.id, code: site.code, name: site.name, emergency_phone: site.emergency_phone }, unit: unit && { id: unit.id, code: unit.code, floor: unit.floor } };
  });
}

/* ================= Notification wording ================= */

// Phone notifications are cut short on lock screens (iPhone shows about 50 characters of the
// title and 4 lines of text; Samsung about 2 lines until opened). So: the building and what
// happened in the title, the detail in the body, the most important words first.
const NOTE_MAX = { title: 50, body: 140 };
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const PRIORITY_TITLE = { critical: '🚨 بلاغ خطير', urgent: '🟠 بلاغ عاجل', normal: 'بلاغ جديد' };

/**
 * Text of one phone notification. kind:
 *  new_ticket   to the supervisor and the manager      { priority, type, place, number }
 *  escalated    to the manager                          { type, number, minutes, reason: 'pickup' | 'fix' }
 *  assigned     to the technician or cleaner            { type, place, number, lang: 'ar' | 'bn' }
 *  resolved     summary to the resident                 { type, number }
 *  notice       announcement to residents               { title, text }
 *  pm_reminder  to the supervisor, a week before         { title, date }
 *  member_pending  to the representative                { name, unit }
 * Returns { title, body, tag, urgent }. urgent = stays on screen until opened (critical only).
 */
export function notificationText(kind, site, d = {}) {
  const where = site?.name || '';
  const n = d.number ? ` · رقم ${d.number}` : '';
  let title;
  let body;
  switch (kind) {
    case 'new_ticket':
      title = `${PRIORITY_TITLE[d.priority] || PRIORITY_TITLE.normal} — ${where}`;
      body = `${d.type} · ${d.place}${n}${d.priority === 'critical' ? '. افتح البلاغ الحين.' : ''}`;
      break;
    case 'escalated':
      title = `⏰ بلاغ متأخر — ${where}`;
      body = `${d.type}${n} · ${d.reason === 'fix' ? `ما انحل من ${d.minutes} دقيقة` : `ما أحد استلمه من ${d.minutes} دقيقة`}`;
      break;
    case 'assigned':
      title = d.lang === 'bn' ? `নতুন কাজ — ${where}` : `مهمة جديدة لك — ${where}`;
      body = `${d.type} · ${d.place}${n}`;
      break;
    case 'resolved':
      title = `✅ انحل بلاغك — ${where}`;
      body = `${d.type}${n}. خلصناه، وشكراً لأنك بلغتنا.`;
      break;
    case 'notice':
      title = `📢 ${d.title} — ${where}`;
      body = d.text;
      break;
    case 'pm_reminder':
      title = `🗓️ صيانة دورية بعد أسبوع — ${where}`;
      body = `${d.title} · ${d.date}`;
      break;
    case 'member_pending':
      title = `طلب تسجيل ساكن — ${where}`;
      body = `${d.name} · شقة ${d.unit}. وافق أو ارفض من التطبيق.`;
      break;
    default:
      throw new Error(`unknown notification: ${kind}`);
  }
  return {
    title: clip(title, NOTE_MAX.title),
    body: clip(String(body || ''), NOTE_MAX.body),
    // Same tag = the newer notification replaces the older one instead of piling up.
    tag: `${kind}-${site?.code || ''}-${d.number || d.title || ''}`,
    urgent: kind === 'new_ticket' && d.priority === 'critical',
  };
}

/* ================= Type A template (Ajyal buildings 2, 5, 8, 11) ================= */

// From the building's as-built drawings: ground + 6 floors, 2 units on the ground floor and 4 on
// each upper floor. Numbering confirmed by the owner (2026-10-30), the same on every floor, standing
// with your back to the lift: x01 on the right, x02 on the left, x03 opposite x01, x04 opposite x02.
// Ajyal has 12 buildings: type A = 2, 5, 8, 11; type B = 3, 6, 9, 12; type C = 1, 4, 7, 10.
// The types differ in their façades; units, floors and common areas are the same, so all
// three use this template and only the recorded type changes.
export const AJYAL_TYPES = { 1: 'C', 2: 'A', 3: 'B', 4: 'C', 5: 'A', 6: 'B', 7: 'C', 8: 'A', 9: 'B', 10: 'C', 11: 'A', 12: 'B' };
export const TYPE_A = {
  floors: 6,
  area_net: 211.64,
  area_gross: 254.22,
  position: (floor, pos) => {
    const no = (p) => (floor === 0 ? `00${p}` : `${floor}0${p}`);
    return { 1: 'يمين المصعد (والمصعد ورا ظهرك)', 2: 'يسار المصعد (والمصعد ورا ظهرك)', 3: `مقابل شقة ${no(1)}`, 4: `مقابل شقة ${no(2)}` }[pos];
  },
  zones: [
    ['LOBBY', 'اللوبي والمدخل', 'Lobby & entrance', 'lobby', 0],
    ['ELEV', 'المصعدين', 'Both lifts', 'elevator', ''],
    ['STAIRS-1', 'الدرج 1', 'Stairs 1', 'stairs', ''],
    ['STAIRS-2', 'الدرج 2', 'Stairs 2', 'stairs', ''],
    ...[1, 2, 3, 4, 5, 6].map((n) => [`CORR-${n}`, `ممر الدور ${n}`, `Floor ${n} corridor`, 'corridor', n]),
    ['CHUTE', 'شوت النفايات (كل الأدوار)', 'Waste chute (all floors)', 'waste', ''],
    ['WASTE-G', 'غرفة النفايات', 'Waste room', 'waste', 0],
    ['PARKING', 'المواقف', 'Parking', 'parking', 0],
    ['YARD-1', 'الفناء 1', 'Yard 1', 'yard', 0],
    ['YARD-2', 'الفناء 2', 'Yard 2', 'yard', 0],
    ['PUMPS', 'غرفة مضخات الحريق والبوسترات', 'Fire pump & booster room', 'plant', 0],
    ['FACP', 'لوحة إنذار الحريق', 'Fire alarm panel', 'plant', 0],
    ['ELEC', 'غرفة الكهرباء', 'Electrical room', 'plant', 0],
    ['METERS', 'غرفة العدادات', 'Meter room', 'plant', 0],
    ['CER', 'غرفة الاتصالات', 'Communications room (CER)', 'plant', 0],
    ['GUARD', 'غرفة الحارس', 'Guard room', 'service', 0],
    ['LAUNDRY', 'الغسيل', 'Laundry', 'service', 0],
    ['DRIVERS', 'غرف السائقين (12)', 'Driver rooms (12)', 'service', 0],
    ['ROOF', 'السطح', 'Roof', 'roof', 7],
    ['ELEV-ROOM', 'غرفة المصاعد', 'Lift machine room', 'plant', 7],
    ['ROOF-AC', 'وحدات التكييف على السطح', 'Roof AC units', 'plant', 7],
  ],
  qr: [
    ['lobby', 'باركود اللوبي', 'LOBBY,ELEV,STAIRS-1,STAIRS-2,CORR-1,CORR-2,CORR-3,CORR-4,CORR-5,CORR-6,CHUTE,WASTE-G,PARKING,YARD-1,YARD-2,ROOF,GUARD,LAUNDRY,DRIVERS'],
    ['elevators', 'باركود المصاعد (TKE)', 'ELEV,ELEV-ROOM'],
    ['fire_pumps', 'باركود أنظمة الحريق والمضخات (رماد)', 'PUMPS,FACP'],
  ],
};

/**
 * Creates a building from the type A template: the building, its 26 units, common areas and
 * three QR points. Units are numbered as in building 5 and can be edited afterwards.
 */
export async function createSiteFromTemplate(ctx, body = {}) {
  if (!can(ctx, 'buildings')) fail(403, 'forbidden');
  const code = String(body.code || '').trim().toUpperCase().slice(0, 20);
  const name = String(body.name || '').trim().slice(0, 120);
  const errors = [];
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) errors.push('code:invalid');
  if (!name) errors.push('name:required');
  if (body.city && !ENUMS.city[body.city]) errors.push('city:invalid');
  if (errors.length) fail(400, 'validation', { fields: errors });
  if (ctx.store.list('sites').some((s) => String(s.code).toUpperCase() === code)) fail(409, 'duplicate_code');
  const stamp = { created_at: nowIso(), updated_at: nowIso(), created_by: ctx.user?.username || '' };
  const site = await ctx.store.insert('sites', {
    id: newId('si'), code, name, name_en: String(body.name_en || '').slice(0, 120), building_type: ['A', 'B', 'C'].includes(body.building_type) ? body.building_type : 'A', district: String(body.district || '').slice(0, 80),
    city: body.city || '', floors: TYPE_A.floors, unit_count: 2 + 4 * TYPE_A.floors, contract_start: body.contract_start || '', contract_end: body.contract_end || '',
    response_hours: body.response_hours ?? '', emergency_phone: body.emergency_phone || '', status: 'active', notes: String(body.notes || '').slice(0, 2000), ...stamp,
  });
  const units = [['001', 0, 1], ['002', 0, 2], ...Array.from({ length: TYPE_A.floors }, (_, i) => [1, 2, 3, 4].map((p) => [`${i + 1}0${p}`, i + 1, p])).flat()];
  for (const [ucode, floor, pos] of units) {
    await ctx.store.insert('units', { id: newId('un'), site_id: site.id, code: ucode, floor, position: TYPE_A.position(floor, pos), area_net: TYPE_A.area_net, area_gross: TYPE_A.area_gross, occupancy: 'unknown', ...stamp });
  }
  for (const [zcode, zname, zen, kind, floor] of TYPE_A.zones) {
    await ctx.store.insert('zones', { id: newId('zo'), site_id: site.id, code: zcode, name: zname, name_en: zen, kind, floor, ...stamp });
  }
  for (const [kind, label, zoneCodes] of TYPE_A.qr) {
    await ctx.store.insert('qr_points', { id: newId('qr'), site_id: site.id, kind, label, token: newToken(12), zone_codes: zoneCodes, active: 'yes', ...stamp });
  }
  await ctx.audit('create_from_template', 'sites', site.id, { type: 'A', units: units.length });
  return getSite(ctx, site.id);
}

/* ================= Report types ================= */

// From the reference document (section 7). Priority follows the type, never the resident's choice.
// Minutes: critical goes out at once; urgent escalates after 30 min without pick-up or 4 h unsolved;
// normal after 24 h without pick-up. Bengali names are for the workers' screens (to be reviewed).
const SLA = { critical: [0, ''], urgent: [30, 240], normal: [1440, ''] };
// Arabic names are in clear, polite Saudi dialect (what a resident would say).
export const DEFAULT_TICKET_TYPES = [
  ['maint', 'water_leak', 'تسريب موية', 'Water leak', 'পানি লিক', 'urgent'],
  ['maint', 'water_cut', 'الموية مقطوعة', 'No water', 'পানি নেই', 'urgent'],
  ['maint', 'water_pressure', 'ضغط الموية ضعيف', 'Low water pressure', 'পানির চাপ কম', 'normal'],
  ['maint', 'drain_block', 'انسداد في الصرف أو المجاري', 'Blocked drain or sewer', 'ড্রেন বন্ধ', 'normal'],
  ['maint', 'power_cut', 'الكهرباء مقطوعة', 'Power cut', 'বিদ্যুৎ নেই', 'urgent'],
  ['maint', 'lighting', 'إنارة أو كهرباء خربانة', 'Lighting or electrical fault', 'লাইট বা বিদ্যুৎ নষ্ট', 'normal'],
  ['maint', 'lift_stopped', 'المصعد واقف', 'Lift out of service', 'লিফট বন্ধ', 'urgent'],
  ['maint', 'lift_trapped', 'أحد محبوس في المصعد', 'Someone trapped in a lift', 'লিফটে কেউ আটকে আছে', 'critical'],
  ['maint', 'common_ac', 'التكييف في الممرات أو اللوبي', 'Common-area air conditioning', 'সাধারণ এলাকার এসি', 'normal'],
  ['maint', 'doors_locks', 'باب أو قفل خربان', 'Door or lock fault', 'দরজা বা তালা নষ্ট', 'normal'],
  ['maint', 'intercom_cctv', 'الانتركم أو البوابة أو الكاميرات', 'Intercom, gate or cameras', 'ইন্টারকম, গেট বা ক্যামেরা', 'normal'],
  ['maint', 'false_alarm', 'جرس الحريق يصفّر بدون سبب', 'Fire alarm sounding with no cause', 'অকারণে ফায়ার অ্যালার্ম', 'normal'],
  ['maint', 'damage', 'شي مكسور أو خربان', 'Something broken or damaged', 'কিছু ভাঙা বা নষ্ট', 'normal'],
  ['maint', 'gas_fire', 'ريحة غاز أو حريق', 'Gas smell or fire', 'গ্যাসের গন্ধ বা আগুন', 'critical'],
  ['clean', 'stairs_corridors', 'الدرج أو الممرات تبي تنظيف', 'Stairs or corridors need cleaning', 'সিঁড়ি বা করিডোর পরিষ্কার', 'normal'],
  ['clean', 'lobby', 'اللوبي يبي تنظيف', 'Lobby needs cleaning', 'লবি পরিষ্কার', 'normal'],
  ['clean', 'waste_rooms', 'غرفة النفايات أو الشوت', 'Waste room or chute', 'ময়লার ঘর বা শুট', 'normal'],
  ['clean', 'pests', 'حشرات', 'Pests', 'পোকামাকড়', 'normal'],
  ['clean', 'parking', 'المواقف تبي تنظيف', 'Parking needs cleaning', 'পার্কিং পরিষ্কার', 'normal'],
  ['clean', 'dust_storm', 'غبار بعد العاصفة', 'Dust after a storm', 'ঝড়ের পরে ধুলো', 'normal'],
  ['clean', 'spill', 'شي انكب أو وساخة مفاجئة', 'Spill or sudden mess', 'হঠাৎ ময়লা বা ছিটকে পড়া', 'normal'],
  ['clean', 'odour', 'ريحة مو حلوة', 'Bad smell', 'দুর্গন্ধ', 'normal'],
  ['clean', 'roof', 'السطح يبي تنظيف', 'Roof needs cleaning', 'ছাদ পরিষ্কার', 'normal'],
  ['other', 'suggestion', 'ملاحظة أو اقتراح', 'Note or suggestion', 'মন্তব্য বা পরামর্শ', 'normal'],
  ['other', 'noise', 'إزعاج', 'Noise or disturbance', 'শব্দ বা বিরক্তি', 'normal'],
  ['other', 'other', 'شي ثاني', 'Something else', 'অন্য কিছু', 'normal'],
];
// Inside a unit is outside the contract: the app offers a paid cleaning or maintenance booking instead.
const IN_UNIT = ['other', 'in_unit', 'داخل شقتي (خدمة بمقابل)', 'Inside my unit (paid service)', 'ফ্ল্যাটের ভিতরে (পেইড সার্ভিস)', 'normal'];

/** Adds the default report types once (types shared by all buildings). Returns how many were added. */
export async function seedTicketTypes(ctx) {
  if (!can(ctx, 'buildings')) fail(403, 'forbidden');
  const have = new Set(ctx.store.list('ticket_types').filter((t) => !t.site_id).map((t) => t.code));
  let added = 0;
  for (const [i, [dept, code, name, en, bn, priority]] of [...DEFAULT_TICKET_TYPES, IN_UNIT].entries()) {
    if (have.has(code)) continue;
    await ctx.store.insert('ticket_types', {
      id: newId('tt'), site_id: '', dept, code, name, name_en: en, name_bn: bn, priority, ack_minutes: SLA[priority][0], fix_minutes: SLA[priority][1],
      in_unit: code === 'in_unit' ? 'yes' : 'no', sort: (i + 1) * 10, active: 'yes', created_at: nowIso(), updated_at: nowIso(),
    });
    added += 1;
  }
  if (added) await ctx.audit('seed', 'ticket_types', '', { added });
  return { added };
}

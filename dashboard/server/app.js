// HTTP API for the Clean Sense internal system.

import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { TABLES, ENUMS, ROLES, PERMISSIONS } from '../shared/model.js';
import { createAuth } from './auth.js';

// Same prefixes as the previous system, so numbering continues where it stopped.
const DOC_PREFIX = { quote: 'QO', invoice: 'INV', receipt: 'REC', contract: 'CS' };
const PUBLIC_ORIGINS = ['https://cleansense.co', 'https://www.cleansense.co'];

const newId = (p) => `${p}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.toUpperCase();
const nowIso = () => new Date().toISOString();
const asNumber = (v) => (v === '' || v === null || v === undefined ? '' : Number.isFinite(Number(v)) ? Number(v) : String(v));

export function createApp({ store, secret, secureCookies = true, webDist, extraOrigins = [] }) {
  const app = express();
  const auth = createAuth({ store, secret, secureCookies });
  const allowedOrigins = [...PUBLIC_ORIGINS, ...extraOrigins];

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(auth.load);

  const audit = (req, action, entity, entityId, details = '') =>
    store.insert('audit_log', { at: nowIso(), user: req.user?.username || 'public', action, entity, entity_id: entityId, details: typeof details === 'string' ? details : JSON.stringify(details) });

  /** Strip unknown fields, coerce money fields, validate selects against enums. */
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
      else v = String(v).slice(0, 5000).trim();
      if (f.type === 'select' && v && !ENUMS[f.enum][v]) errors.push(`${f.key}:invalid`);
      out[f.key] = v;
    }
    if (!partial) for (const f of def.fields) if (f.required && (out[f.key] === undefined || out[f.key] === '')) errors.push(`${f.key}:required`);
    return { data: out, errors };
  }

  function nextDocNumber(type) {
    const prefix = DOC_PREFIX[type] || 'DOC';
    const re = new RegExp(`^${prefix}-(\\d+)$`);
    const max = store.list('documents', { includeDeleted: true }).reduce((m, d) => {
      const x = String(d.doc_number || '').match(re);
      return x ? Math.max(m, Number(x[1])) : m;
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  function nextLeadRef() {
    const d = new Date();
    const ym = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}`;
    const re = new RegExp(`^CS-${ym}-(\\d+)$`);
    const max = store.list('leads', { includeDeleted: true }).reduce((m, l) => {
      const x = String(l.id).match(re);
      return x ? Math.max(m, Number(x[1])) : m;
    }, 0);
    return `CS-${ym}-${String(max + 1).padStart(4, '0')}`;
  }

  const api = express.Router();

  /* ---------- Auth ---------- */
  api.post('/auth/login', (req, res) => auth.login(req, res));
  api.post('/auth/logout', (req, res) => auth.logout(req, res));
  api.get('/auth/me', auth.require(), (req, res) => res.json(auth.publicUser(req.user)));
  api.patch('/auth/me', auth.require(), async (req, res) => {
    const language = req.body?.language;
    if (!['ar', 'en'].includes(language)) return res.status(400).json({ error: 'invalid_language' });
    const u = await store.patch('users', req.user.id, { language });
    res.json(auth.publicUser(u));
  });
  api.post('/auth/password', auth.require(), async (req, res) => {
    const { current, next } = req.body || {};
    const bcryptOk = (await import('bcryptjs')).default.compareSync(String(current || ''), req.user.password_hash || '');
    if (!bcryptOk) return res.status(401).json({ error: 'wrong_password' });
    const bad = auth.validatePassword(next);
    if (bad) return res.status(400).json({ error: `password_${bad}` });
    const u = await store.patch('users', req.user.id, { password_hash: auth.hash(next), must_change_password: 'no' });
    await audit(req, 'password.changed', 'users', u.id);
    auth.reissue(res, u);
    res.json(auth.publicUser(u));
  });

  /* ---------- Lookups ---------- */
  api.get('/meta', auth.require(), (req, res) => {
    const company = Object.fromEntries(store.list('settings').map((s) => [s.key, s.value]));
    res.json({ company, roles: ROLES, permissions: PERMISSIONS });
  });

  /* ---------- Home summary ---------- */
  api.get('/summary', auth.require('dashboard'), (req, res) => {
    const perms = auth.permsOf(req.user);
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const sum = (rows, k) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
    const out = {};
    if (perms.includes('bookings')) {
      const b = store.list('bookings');
      out.bookings_today = b.filter((x) => x.date === today && x.status !== 'cancelled').length;
      out.bookings_upcoming = b.filter((x) => x.date > today && x.status !== 'cancelled').length;
      out.bookings_pending = b.filter((x) => x.status === 'pending').length;
      out.today = b.filter((x) => x.date === today).sort((a, c) => String(a.time).localeCompare(String(c.time)));
    }
    if (perms.includes('leads')) out.leads_new = store.list('leads').filter((l) => l.status === 'new').length;
    if (perms.includes('finance')) {
      out.revenue_month = sum(store.list('revenue').filter((r) => String(r.date).startsWith(month)), 'amount');
      out.expenses_month = sum(store.list('expenses').filter((r) => String(r.date).startsWith(month)), 'amount');
    }
    if (perms.includes('projects')) out.projects_active = store.list('projects').filter((p) => p.status === 'active').length;
    if (perms.includes('tasks')) {
      const mine = store.list('tasks').filter((t) => t.status !== 'done');
      out.tasks_open = perms.includes('projects') ? mine.length : mine.filter((t) => t.assigned_worker === req.user.name).length;
    }
    res.json(out);
  });

  /* ---------- Generic CRUD for business tables ---------- */
  for (const [table, def] of Object.entries(TABLES)) {
    const base = `/data/${table}`;
    api.get(base, auth.require(def.perm), (req, res) => res.json(store.list(table)));

    api.post(base, auth.require(def.perm), async (req, res) => {
      const { data, errors } = sanitize(table, req.body || {});
      if (errors.length) return res.status(400).json({ error: 'validation', fields: errors });
      data.id = table === 'leads' ? nextLeadRef() : newId(table.slice(0, 2));
      if (table === 'documents') data.doc_number = nextDocNumber(data.type);
      Object.assign(data, { created_at: nowIso(), updated_at: nowIso(), created_by: req.user.username });
      const row = await store.insert(table, data);
      await audit(req, 'create', table, row.id);
      res.status(201).json(row);
    });

    api.patch(`${base}/:id`, auth.require(def.perm), async (req, res) => {
      const existing = store.get(table, req.params.id);
      if (!existing || existing.deleted_at) return res.status(404).json({ error: 'not_found' });
      const { data, errors } = sanitize(table, req.body || {}, { partial: true });
      if (errors.length) return res.status(400).json({ error: 'validation', fields: errors });
      const before = Object.fromEntries(Object.keys(data).map((k) => [k, existing[k]]));
      const row = await store.patch(table, req.params.id, { ...data, updated_at: nowIso() });
      await audit(req, 'update', table, row.id, { before, after: data });
      res.json(row);
    });

    // Soft delete: the row stays in the sheet with a deleted_at date.
    api.delete(`${base}/:id`, auth.require(def.perm), async (req, res) => {
      const existing = store.get(table, req.params.id);
      if (!existing || existing.deleted_at) return res.status(404).json({ error: 'not_found' });
      await store.patch(table, req.params.id, { deleted_at: nowIso() });
      await audit(req, 'delete', table, req.params.id);
      res.status(204).end();
    });
  }

  /* ---------- Convert a website lead into a booking ---------- */
  api.post('/data/leads/:id/convert', auth.require('bookings'), async (req, res) => {
    const lead = store.get('leads', req.params.id);
    if (!lead || lead.deleted_at) return res.status(404).json({ error: 'not_found' });
    if (lead.booking_id) return res.status(409).json({ error: 'already_converted', booking_id: lead.booking_id });
    const booking = await store.insert('bookings', {
      id: newId('bo'), status: 'pending', customer_name: lead.customer_name, phone: lead.phone, city: lead.city,
      services: lead.service_code, date: lead.preferred_date, time: lead.preferred_time, lead_id: lead.id,
      notes: [lead.details, lead.notes].filter(Boolean).join('\n'), created_at: nowIso(), updated_at: nowIso(), created_by: req.user.username,
    });
    await store.patch('leads', lead.id, { status: 'booked', booking_id: booking.id });
    await audit(req, 'convert', 'leads', lead.id, { booking: booking.id });
    res.status(201).json(booking);
  });

  /* ---------- Users (owner / users permission) ---------- */
  const userOut = (u) => ({ ...auth.publicUser(u), active: u.active !== 'no', last_login_at: u.last_login_at });
  api.get('/users', auth.require('users'), (req, res) => res.json(store.list('users').map(userOut)));
  api.post('/users', auth.require('users'), async (req, res) => {
    const { name, username, job_title, role, language } = req.body || {};
    const uname = String(username || '').trim().toLowerCase();
    if (!name || !/^[a-z0-9._-]{3,30}$/.test(uname) || !ROLES[role]) return res.status(400).json({ error: 'validation' });
    if (store.list('users').some((u) => String(u.username).toLowerCase() === uname)) return res.status(409).json({ error: 'username_taken' });
    const temp = auth.tempPassword();
    const u = await store.insert('users', {
      id: newId('us'), name: String(name).trim(), username: uname, job_title: job_title || ROLES[role].ar, role,
      permissions: '', language: language === 'en' ? 'en' : 'ar', active: 'yes', password_hash: auth.hash(temp), must_change_password: 'yes',
    });
    await audit(req, 'create', 'users', u.id);
    res.status(201).json({ user: userOut(u), temporary_password: temp });
  });
  api.patch('/users/:id', auth.require('users'), async (req, res) => {
    const u = store.get('users', req.params.id);
    if (!u) return res.status(404).json({ error: 'not_found' });
    const patch = {};
    const { role, active, job_title, name, permissions, reset_password } = req.body || {};
    if (u.id === req.user.id && (active === false || (role && role !== u.role))) return res.status(400).json({ error: 'cannot_change_self' });
    if (role !== undefined) { if (!ROLES[role]) return res.status(400).json({ error: 'validation' }); patch.role = role; }
    if (active !== undefined) patch.active = active ? 'yes' : 'no';
    if (job_title !== undefined) patch.job_title = String(job_title).slice(0, 80);
    if (name !== undefined) patch.name = String(name).slice(0, 80);
    if (permissions !== undefined) patch.permissions = (Array.isArray(permissions) ? permissions : []).filter((p) => PERMISSIONS[p]).join(',');
    let temp;
    if (reset_password) { temp = auth.tempPassword(); patch.password_hash = auth.hash(temp); patch.must_change_password = 'yes'; }
    const next = await store.patch('users', u.id, patch);
    await audit(req, reset_password ? 'password.reset' : 'update', 'users', u.id);
    res.json({ user: userOut(next), temporary_password: temp });
  });

  /* ---------- Public endpoints for cleansense.co ---------- */
  const pub = express.Router();
  pub.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') return res.status(204).end();
    next();
  });
  const leadHits = new Map();
  pub.post('/leads', async (req, res) => {
    const b = req.body || {};
    if (b.website) return res.status(201).json({ id: 'CS-OK' }); // honeypot field: bots fill it
    const now = Date.now();
    const e = leadHits.get(req.ip) || { n: 0, t: now };
    if (now - e.t > 10 * 60 * 1000) Object.assign(e, { n: 0, t: now });
    e.n += 1;
    leadHits.set(req.ip, e);
    if (e.n > 5) return res.status(429).json({ error: 'too_many_requests' });

    const key = String(b.idempotency_key || '').slice(0, 64);
    if (key) {
      const dup = store.list('leads', { includeDeleted: true }).find((l) => l.idempotency_key === key);
      if (dup) return res.status(200).json({ id: dup.id, duplicate: true });
    }
    const phone = String(b.phone || '').replace(/[^\d+]/g, '');
    if (!String(b.customer_name || '').trim() || !/^(\+?966|0)?5\d{8}$/.test(phone)) return res.status(400).json({ error: 'validation' });
    const { data, errors } = sanitize('leads', { ...b, status: 'new', phone });
    if (errors.length) return res.status(400).json({ error: 'validation', fields: errors });
    Object.assign(data, {
      id: nextLeadRef(), created_at: nowIso(), idempotency_key: key,
      utm_source: String(b.utm_source || '').slice(0, 80), utm_medium: String(b.utm_medium || '').slice(0, 80), utm_campaign: String(b.utm_campaign || '').slice(0, 80),
    });
    const lead = await store.insert('leads', data);
    await audit({ user: null }, 'create', 'leads', lead.id, 'website');
    res.status(201).json({ id: lead.id });
  });
  pub.get('/pricing', (req, res) => {
    res.json(store.list('pricing').filter((p) => p.active === 'yes' && p.approved === 'yes')
      .map(({ service_code, name_ar, name_en, unit, price_min, price_max }) => ({ service_code, name_ar, name_en, unit, price_min, price_max })));
  });
  api.use('/public', pub);

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('*', (req, res) => res.sendFile(join(webDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}

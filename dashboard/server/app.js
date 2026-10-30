// HTTP API for the Clean Sense internal system.

import express from 'express';
import cookieParser from 'cookie-parser';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { ROLES, PERMISSIONS } from '../shared/model.js';
import { ROUTES, allowed } from '../shared/routes.js';
import { ServiceError, createRecord, companyInfo, settingsMap, publicDocument, calendarLink, calendarFeed } from '../shared/services.js';
import { applyLists } from '../shared/model.js';
import { consumeLoginLink } from '../shared/buildings.js';
import { createAuth } from './auth.js';

const PUBLIC_ORIGINS = ['https://cleansense.co', 'https://www.cleansense.co'];

const newId = (p) => `${p}-${Date.now().toString(36)}${randomBytes(2).toString('hex')}`.toUpperCase();

// Page behind a sign-in link. Self-contained (no outside files), Arabic, Clean Sense colours.
const ROLE_AR = { manager: 'المدير', maint_supervisor: 'مشرف الصيانة', clean_supervisor: 'مشرف النظافة', technician: 'فني', cleaner: 'عامل نظافة', rep: 'ممثل العمارة', resident: 'ساكن', vendor: 'شركة متعاقدة' };
const LINK_PAGE = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>كلين سنس | Clean Sense</title><meta property="og:title" content="كلين سنس | Clean Sense"><meta property="og:description" content="رابط دخولك لتطبيق كلين سنس">
<meta name="robots" content="noindex"><meta name="theme-color" content="#0B1F41">
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0B1F41;color:#F7F3E9;font-family:Tajawal,"Segoe UI",Tahoma,sans-serif}
main{width:min(420px,calc(100% - 32px));background:#fff;color:#0B1F41;border-radius:18px;padding:28px 22px;text-align:center}
h1{font-size:22px;margin:0 0 6px}p{color:#56607A;margin:6px 0 18px;line-height:1.8}
button{width:100%;border:0;border-radius:12px;padding:14px;font-family:inherit;font-weight:700;font-size:17px;background:#D1AD45;color:#0B1F41;cursor:pointer}
button:disabled{opacity:.6}ul{list-style:none;padding:0;margin:12px 0 0;text-align:start}li{border:1px solid #E4DDCB;border-radius:10px;padding:10px 12px;margin-top:8px}
.err{color:#B42318}</style></head><body><main>
<h1>أهلاً بك في كلين سنس</h1><p id="msg">اضغط الزر للدخول. الرابط يشتغل مرة وحدة.</p>
<button id="go">دخول</button><ul id="list"></ul></main>
<script>
const R=${JSON.stringify(ROLE_AR)};
const msg=document.getElementById('msg'),go=document.getElementById('go'),list=document.getElementById('list');
go.onclick=async()=>{go.disabled=true;
  const token=location.pathname.split('/').pop();
  const r=await fetch('/api/auth/link',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
  if(!r.ok){msg.textContent=r.status===429?'محاولات كثيرة. جرّب بعد ربع ساعة.':'الرابط منتهي أو مستخدم. اطلب رابط جديد من مدير العمارة.';msg.className='err';go.hidden=true;return;}
  const me=await r.json();const b=await (await fetch('/api/portal/me')).json();
  msg.textContent='تم الدخول، '+me.name+'. أدوارك:';go.hidden=true;
  for(const x of b){const li=document.createElement('li');li.textContent=(x.site?x.site.name:'')+' — '+(R[x.role]||x.role)+(x.unit?' — شقة '+x.unit.code:'')+(x.vendor?' — '+x.vendor:'');list.appendChild(li);}
};
</script></body></html>`;
const nowIso = () => new Date().toISOString();

// portalOrigin: address used in sign-in links sent to residents and contractors (PORTAL_ORIGIN);
// by default the address the request came in on.
export function createApp({ store, secret, secureCookies = true, webDist, extraOrigins = [], openAccess = false, mirror = null, portalOrigin = '', onPasswordChanged = () => {} }) {
  const app = express();
  const auth = createAuth({ store, secret, secureCookies, openAccess });
  applyLists(settingsMap({ store })); // owner-edited lists (services, cities, ...)
  const allowedOrigins = [...PUBLIC_ORIGINS, ...extraOrigins];

  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    // Internal staff system: keep it out of search engines.
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(auth.load);

  const audit = (req, action, entity, entityId, details = '') =>
    store.insert('audit_log', { at: nowIso(), user: req.user?.username || 'public', action, entity, entity_id: entityId, details: typeof details === 'string' ? details : JSON.stringify(details) });

  const api = express.Router();

  /* ---------- Auth ---------- */
  api.post('/auth/login', (req, res) => auth.login(req, res));
  api.post('/auth/logout', (req, res) => auth.logout(req, res));
  // One-time sign-in link (/l/<token>) for residents, contractors and field staff.
  api.post('/auth/link', (req, res) => auth.loginWithLink(req, res, (token) => consumeLoginLink(store, token)));
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
    onPasswordChanged(u);
    auth.reissue(res, u);
    res.json(auth.publicUser(u));
  });

  // The signed-in user's private calendar feed (bookings and tasks they may see).
  api.post('/auth/calendar', auth.require(), async (req, res) => {
    res.json(await calendarLink({ store, user: req.user, perms: auth.permsOf(req.user), audit: (...a) => audit(req, ...a) }, req.body || {}));
  });

  /* ---------- Lookups ---------- */
  api.get('/meta', auth.require(), (req, res) => {
    res.json({ company: companyInfo({ store }), roles: ROLES, permissions: PERMISSIONS, open_access: openAccess });
  });

  /* ---------- Business routes (shared with the demo, see shared/routes.js) ---------- */
  const ctxOf = (req) => ({ store, user: req.user, perms: auth.permsOf(req.user), audit: (...a) => audit(req, ...a), origin: portalOrigin || `${req.protocol}://${req.get('host')}` });
  for (const [method, path, perm, handler] of ROUTES) {
    api[method.toLowerCase()](path, auth.require(), async (req, res, next) => {
      const ctx = ctxOf(req);
      if (!allowed(ctx.perms, perm)) return res.status(403).json({ error: 'forbidden' });
      try {
        const out = await handler(ctx, req.params, req.body || {}, req.query || {});
        if (out === undefined) return res.status(204).end();
        res.status(method === 'POST' ? 201 : 200).json(out);
      } catch (e) {
        if (e instanceof ServiceError) return res.status(e.status).json({ error: e.code, ...e.extra });
        next(e);
      }
    });
  }

  /* ---------- Users (owner / users permission) ---------- */
  const userOut = (u) => ({ ...auth.publicUser(u), active: u.active !== 'no', last_login_at: u.last_login_at });
  // Staff accounts only: residents and contractors are managed per building.
  api.get('/users', auth.require('users'), (req, res) => res.json(store.list('users').filter((u) => !u.kind || u.kind === 'staff').map(userOut)));
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
    const { role, active, job_title, name, permissions, username } = req.body || {};
    let { reset_password } = req.body || {};
    if (u.id === req.user.id && (active === false || (role && role !== u.role))) return res.status(400).json({ error: 'cannot_change_self' });
    // Imported staff have no username yet: setting one gives them a login (once; usernames never change).
    if (username !== undefined) {
      const uname = String(username).trim().toLowerCase();
      if (u.username || !/^[a-z0-9._-]{3,30}$/.test(uname)) return res.status(400).json({ error: 'validation' });
      if (store.list('users', { includeDeleted: true }).some((x) => String(x.username).toLowerCase() === uname)) return res.status(409).json({ error: 'username_taken' });
      patch.username = uname;
      patch.active = 'yes';
      reset_password = true;
    }
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

  /* ---------- Google Sheets view copy (owners) ---------- */
  const ownerOnly = (req, res, next) => (req.user?.role === 'owner' ? next() : res.status(403).json({ error: 'forbidden' }));
  api.get('/admin/mirror', auth.require(), ownerOnly, (req, res) => res.json({ enabled: !!mirror, ...(mirror?.last || {}) }));
  api.post('/admin/mirror', auth.require(), ownerOnly, async (req, res) => {
    if (!mirror) return res.status(400).json({ error: 'mirror_not_configured' });
    const r = await mirror.push(store);
    audit(req, 'mirror.push', 'system', '', { ok: r.ok, rows: r.rows });
    res.status(r.ok ? 200 : 502).json(r);
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
    const allowedKeys = ['customer_name', 'phone', 'service_code', 'details', 'city', 'district', 'preferred_date', 'preferred_time', 'estimate_min', 'estimate_max', 'language', 'notes'];
    const ctx = { store, user: { username: 'website' }, perms: ['leads'], audit: (action, entity, id) => audit({ user: null }, action, entity, id, 'website') };
    let lead;
    try {
      lead = await createRecord(ctx, 'leads', { ...Object.fromEntries(allowedKeys.filter((k) => b[k] !== undefined).map((k) => [k, b[k]])), status: 'new', phone });
    } catch (e) {
      if (e instanceof ServiceError) return res.status(e.status).json({ error: e.code, ...e.extra });
      throw e;
    }
    lead = await store.patch('leads', lead.id, {
      idempotency_key: key, created_by: 'website',
      utm_source: String(b.utm_source || '').slice(0, 80), utm_medium: String(b.utm_medium || '').slice(0, 80), utm_campaign: String(b.utm_campaign || '').slice(0, 80),
    });
    res.status(201).json({ id: lead.id });
  });
  // A customer's private document link (/d/<token>): the document as printed, no sign-in.
  pub.get('/doc/:token', async (req, res, next) => {
    const ctx = { store, user: { username: 'customer-link' }, perms: [], audit: (action, entity, id, details) => audit({ user: null }, action, entity, id, details) };
    try {
      res.setHeader('Cache-Control', 'no-store');
      res.json(await publicDocument(ctx, req.params.token));
    } catch (e) {
      if (e instanceof ServiceError) return res.status(e.status).json({ error: e.code });
      next(e);
    }
  });
  // Calendar apps fetch this address on their own schedule (iPhone, Google, Outlook).
  pub.get('/calendar/:file', (req, res, next) => {
    try {
      const ics = calendarFeed({ store }, req.params.file.replace(/\.ics$/, ''));
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="clean-sense.ics"');
      res.setHeader('Cache-Control', 'no-store');
      res.send(ics);
    } catch (e) {
      if (e instanceof ServiceError) return res.status(e.status).type('text/plain').send('not found');
      next(e);
    }
  });
  pub.get('/pricing', (req, res) => {
    res.json(store.list('pricing').filter((p) => p.active === 'yes' && p.approved === 'yes')
      .map(({ service_code, name_ar, name_en, unit, price_min, price_max }) => ({ service_code, name_ar, name_en, unit, price_min, price_max })));
  });
  api.use('/public', pub);

  app.use('/api', api);
  app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

  // Sign-in link page. Opening it does not use the link: the person taps the button, so
  // WhatsApp's link preview (which also opens the address) can't spend the one-time link.
  app.get('/l/:token', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.type('html').send(LINK_PAGE);
  });

  if (webDist && existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    // Customer links (/d/<code>): the WhatsApp preview shows the company, not the internal system.
    let customerHtml = '';
    app.get('/d/:code', (req, res) => {
      customerHtml ||= readFileSync(join(webDist, 'index.html'), 'utf8').replace(/<title>[^<]*<\/title>/,
        '<title>كلين سنس | Clean Sense</title><meta property="og:title" content="كلين سنس | Clean Sense" />' +
        '<meta property="og:description" content="اضغط لعرض المستند وتحميله" /><meta property="og:type" content="website" />' +
        '<meta property="og:image" content="https://system.cleansense.co/og-logo.png" /><meta property="og:image:width" content="600" /><meta property="og:image:height" content="600" />');
      res.setHeader('Cache-Control', 'no-store');
      res.type('html').send(customerHtml);
    });
    app.get('*', (req, res) => res.sendFile(join(webDist, 'index.html')));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'server_error' });
  });
  return app;
}

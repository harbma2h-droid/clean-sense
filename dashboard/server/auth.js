// Login, sessions and permissions.
// Sessions are signed tokens in an httpOnly cookie (not readable by page scripts).

import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { ROLES } from '../shared/model.js';

const COOKIE = 'cs_session';
const TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days
const WINDOW_MS = 15 * 60 * 1000;

// openAccess: temporary build-phase switch. Requests without a session act as the
// owner, so nobody needs to sign in. Roles and permissions stay as they are.
export function createAuth({ store, secret, secureCookies, openAccess = false }) {
  if (!secret || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

  const sign = (body) => createHmac('sha256', secret).update(body).digest('base64url');
  // Session version: changing the password (or, for phone-only accounts, the approved phone)
  // makes older sessions invalid.
  const versionOf = (u) => (u.password_hash ? u.password_hash.slice(-8) : `L${u.login_version || ''}`);
  const issue = (user) => {
    const body = Buffer.from(JSON.stringify({ uid: user.id, exp: Date.now() + TTL_MS, v: versionOf(user) })).toString('base64url');
    return `${body}.${sign(body)}`;
  };
  const verify = (token) => {
    if (!token || !token.includes('.')) return null;
    const [body, sig] = token.split('.');
    const a = Buffer.from(sig || '');
    const b = Buffer.from(sign(body));
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString());
      return p.exp > Date.now() ? p : null;
    } catch {
      return null;
    }
  };

  const permsOf = (user) => {
    const custom = String(user.permissions || '').split(',').map((s) => s.trim()).filter(Boolean);
    return custom.length ? custom : ROLES[user.role]?.perms ?? [];
  };
  const publicUser = (u) => ({
    id: u.id, name: u.name, username: u.username, job_title: u.job_title, role: u.role, kind: u.kind || 'staff',
    language: u.language || 'ar', permissions: permsOf(u), must_change_password: u.must_change_password === 'yes',
  });

  // Brute-force protection
  const ipHits = new Map();
  const fails = new Map();
  const tooMany = (ip) => {
    const now = Date.now();
    const e = ipHits.get(ip) || { n: 0, t: now };
    if (now - e.t > WINDOW_MS) Object.assign(e, { n: 0, t: now });
    e.n += 1;
    ipHits.set(ip, e);
    return e.n > 10;
  };
  const locked = (u) => {
    const e = fails.get(u);
    return e && e.n >= 5 && Date.now() - e.t < WINDOW_MS;
  };

  const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: secureCookies, maxAge: TTL_MS, path: '/' };

  return {
    hash: (pw) => bcrypt.hashSync(pw, 10),
    tempPassword: () => randomBytes(6).toString('base64url'),
    publicUser,
    permsOf,

    validatePassword(pw) {
      if (typeof pw !== 'string' || pw.length < 8) return 'short';
      if (!/\d/.test(pw) || !/[A-Za-z؀-ۿ]/.test(pw)) return 'weak';
      return null;
    },

    async login(req, res) {
      const { username, password } = req.body || {};
      const uname = String(username || '').trim().toLowerCase();
      if (tooMany(req.ip) || locked(uname)) return res.status(429).json({ error: 'too_many_attempts' });
      const user = store.list('users').find((u) => String(u.username).toLowerCase() === uname && u.active !== 'no');
      const ok = user && user.password_hash && bcrypt.compareSync(String(password || ''), user.password_hash);
      if (!ok) {
        const e = fails.get(uname) || { n: 0, t: Date.now() };
        if (Date.now() - e.t > WINDOW_MS) e.n = 0;
        e.n += 1;
        e.t = Date.now();
        fails.set(uname, e);
        return res.status(401).json({ error: 'invalid_credentials' });
      }
      fails.delete(uname);
      await store.patch('users', user.id, { last_login_at: new Date().toISOString() });
      res.cookie(COOKIE, issue(user), cookieOpts);
      res.json(publicUser(user));
    },

    /** Signs in through a one-time link (phone-only accounts). consume(token) returns the user or null. */
    async loginWithLink(req, res, consume) {
      if (tooMany(req.ip)) return res.status(429).json({ error: 'too_many_attempts' });
      const user = await consume(String(req.body?.token || ''));
      if (!user) return res.status(410).json({ error: 'link_invalid' });
      await store.patch('users', user.id, { last_login_at: new Date().toISOString() });
      res.cookie(COOKIE, issue(user), cookieOpts);
      res.json(publicUser(user));
    },

    logout(req, res) {
      res.clearCookie(COOKIE, { path: '/' });
      res.status(204).end();
    },

    /** Attaches req.user when the session is valid. */
    load(req, _res, next) {
      const p = verify(req.cookies?.[COOKIE]);
      if (p) {
        const u = store.get('users', p.uid);
        if (u && u.active !== 'no' && versionOf(u) === p.v) req.user = u;
      }
      if (!req.user && openAccess) {
        const owner = store.list('users').find((u) => u.role === 'owner' && u.active !== 'no');
        if (owner) req.user = { ...owner, must_change_password: 'no' };
      }
      next();
    },

    reissue(res, user) {
      res.cookie(COOKIE, issue(user), cookieOpts);
    },

    require(perm) {
      return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
        if (req.user.must_change_password === 'yes' && !req.path.startsWith('/auth')) {
          return res.status(403).json({ error: 'must_change_password' });
        }
        if (perm && !permsOf(req.user).includes(perm)) return res.status(403).json({ error: 'forbidden' });
        next();
      };
    },
  };
}

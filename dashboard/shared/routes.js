// API routes shared by the Express server and the in-browser demo.
// Each route: [method, path, permission (string or list: any of), handler(ctx, params, body, query)]

import { TABLES } from './model.js';
import * as S from './services.js';

export const ROUTES = [
  ['GET', '/summary', 'dashboard', (ctx) => S.summary(ctx)],

  ...Object.entries(TABLES).flatMap(([table, def]) => [
    ['GET', `/data/${table}`, def.perm, (ctx) => S.listRecords(ctx, table)],
    ['POST', `/data/${table}`, def.perm, (ctx, p, body) => S.createRecord(ctx, table, body)],
    ['PATCH', `/data/${table}/:id`, def.perm, (ctx, p, body) => S.updateRecord(ctx, table, p.id, body)],
    ['DELETE', `/data/${table}/:id`, def.perm, (ctx, p) => S.deleteRecord(ctx, table, p.id)],
  ]),
  // Pickers need customers and projects from screens owned by other permissions.
  ['GET', '/lookup/customers', ['customers', 'sales', 'finance', 'bookings', 'projects'], (ctx) => ctx.store.list('customers').map(({ id, code, name, phone, city, language }) => ({ id, code, name, phone, city, language }))],
  ['GET', '/lookup/projects', ['projects', 'sales', 'finance', 'bookings'], (ctx) => ctx.store.list('projects').map(({ id, code, name, customer_id, status }) => ({ id, code, name, customer_id, status }))],
  ['GET', '/customers/:id/statement', ['customers', 'finance'], (ctx, p) => S.statement(ctx, p.id)],

  ['POST', '/data/leads/:id/convert', 'bookings', (ctx, p) => S.leadToBooking(ctx, p.id)],
  ['POST', '/data/leads/:id/quote', 'sales', (ctx, p) => S.leadToQuote(ctx, p.id)],
  ['POST', '/data/bookings/:id/invoice', 'sales', (ctx, p) => S.bookingToInvoice(ctx, p.id)],

  ['GET', '/sales/documents', ['sales', 'finance'], (ctx) => S.listDocuments(ctx)],
  ['GET', '/sales/documents/:id', ['sales', 'finance'], (ctx, p) => S.getDocument(ctx, p.id)],
  ['POST', '/sales/documents', 'sales', (ctx, p, body) => S.createDocument(ctx, body)],
  ['PATCH', '/sales/documents/:id', ['sales', 'finance'], (ctx, p, body) => S.updateDocument(ctx, p.id, body)],
  ['POST', '/sales/documents/:id/:action', ['sales', 'finance'], (ctx, p, body) => S.documentAction(ctx, p.id, p.action, body)],

  ['GET', '/payments', 'finance', (ctx) => S.listPayments(ctx)],
  ['POST', '/payments', 'finance', (ctx, p, body) => S.recordPayment(ctx, body)],
  ['PATCH', '/payments/:id', 'finance', (ctx, p, body) => S.updatePaymentNotes(ctx, p.id, body)],
  ['POST', '/payments/:id/void', 'finance', (ctx, p, body) => S.voidPayment(ctx, p.id, body)],
  ['POST', '/payments/:id/allocate', 'finance', (ctx, p, body) => S.allocatePayment(ctx, p.id, body)],

  ['GET', '/treasury', 'finance', (ctx, p, b, q) => S.treasuryOverview(ctx, { to: q.to || '' })],
  ['POST', '/treasury', 'finance', (ctx, p, body) => S.treasuryRecord(ctx, body)],
  ['POST', '/treasury/balance', 'finance', (ctx, p, body) => S.treasurySetBalance(ctx, body)],
  ['POST', '/treasury/:id/void', 'finance', (ctx, p, body) => S.treasuryVoid(ctx, p.id, body)],

  ['GET', '/settings', 'settings', (ctx) => S.companyInfo(ctx)],
  ['PUT', '/settings', 'settings', (ctx, p, body) => S.updateSettings(ctx, body)],
  ['POST', '/admin/upgrade-legacy', 'settings', (ctx) => S.upgradeLegacy(ctx)],
  ['GET', '/history/:entity/:id', ['sales', 'finance', 'customers'], (ctx, p) => S.historyOf(ctx, p.entity, p.id)],

  ['GET', '/reports', 'reports', (ctx, p, b, q) => S.reports(ctx, { from: q.from || '', to: q.to || '' })],
  ['GET', '/ledger', 'reports', (ctx, p, b, q) => S.ledger(ctx, { from: q.from || '', to: q.to || '' })],
];

/** Match a request path against the route table. Returns { route, params } or null. */
export function matchRoute(method, path) {
  for (const route of ROUTES) {
    if (route[0] !== method) continue;
    const pat = route[1].split('/');
    const parts = path.split('/');
    if (pat.length !== parts.length) continue;
    const params = {};
    if (pat.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(parts[i])), true) : seg === parts[i]))) return { route, params };
  }
  return null;
}

export const allowed = (perms, need) => !need || (Array.isArray(need) ? need.some((p) => perms.includes(p)) : perms.includes(need));

// In-browser stand-in for the server, used only by the preview build (VITE_DEMO=1).
// It runs the same business rules as the server (shared/services.js) on an
// in-memory store seeded with invented sample data — never real customers.
import { ROLES } from '@shared/model.js';
import { matchRoute, allowed } from '@shared/routes.js';
import * as S from '@shared/services.js';
import { ApiError, type Row } from './api';

const tables: Record<string, Row[]> = {};
const store = {
  list: (t: string, { includeDeleted = false } = {}) => (tables[t] ||= []).filter((r) => includeDeleted || !r.deleted_at),
  get: (t: string, id: string) => (tables[t] ||= []).find((r) => String(r.id) === String(id)),
  insert: async (t: string, row: Row) => { (tables[t] ||= []).push({ ...row }); return { ...row }; },
  patch: async (t: string, id: string, data: Row) => { const r = store.get(t, id)!; Object.assign(r, data); return { ...r }; },
  setting: (key: string) => (tables.settings ||= []).find((r) => r.key === key)?.value ?? '',
  setSetting: async (key: string, value: string) => {
    const r = (tables.settings ||= []).find((x) => x.key === key);
    if (r) r.value = value; else tables.settings.push({ key, value });
  },
};

const owner: Row = { id: 'us-demo', name: 'معاذ', username: 'moath', job_title: 'المالك', role: 'owner', language: 'ar', active: 'yes', must_change_password: 'no', permissions: '' };
tables.users = [owner, { id: 'us-2', name: 'منسق تجريبي', username: 'coord', job_title: 'منسق حجوزات', role: 'booking_coordinator', language: 'ar', active: 'yes', must_change_password: 'yes', permissions: '' }];
const perms = (u: Row) => (u.permissions ? String(u.permissions).split(',') : (ROLES as any)[u.role].perms);
const pub = (u: Row) => ({ ...u, permissions: perms(u), must_change_password: u.must_change_password === 'yes', active: u.active !== 'no' });
const ctxFor = (user: Row): any => ({
  store, user, perms: perms(user),
  audit: async (action: string, entity: string, id: string) => { (tables.audit_log ||= []).push({ at: new Date().toISOString(), user: user.username, action, entity, entity_id: id }); },
});

const settings: Record<string, string> = {
  'company.legal_name': 'مؤسسة كلين سنس', 'company.brand_ar': 'كلين سنس', 'company.brand_en': 'Clean Sense', 'company.unified_number': '7049749042',
  'contact.phone': '0537717716', 'contact.email': 'info@cleansense.co', 'contact.website': 'cleansense.co',
  'guarantee.golden_ar': 'لا نعتبر العمل منتهياً إلا بعد رضاك. أي ملاحظة ضمن نطاق العمل المتفق عليه نعالجها مباشرة دون أي تكلفة إضافية، خلال 24 ساعة من تاريخ التسليم.',
  'guarantee.golden_en': "We don't consider the job finished until you're satisfied. Any note within the agreed scope of work is fixed right away at no extra cost, within 24 hours of handover.",
};

const d = (offset: number) => new Date(Date.now() + offset * 864e5).toISOString().slice(0, 10);

tables.settings = Object.entries({ ...settings, 'company.partners': 'معاذ، عبدالرحمن', 'docs.invoice_due_days': '7', 'docs.quote_valid_days': '14', 'docs.show_bank': 'yes', 'bank.name': 'بنك تجريبي', 'bank.account_name': 'مؤسسة كلين سنس', 'bank.iban': 'SA00 0000 0000 0000 0000 0000', 'docs.default_terms_ar': 'السعر شامل المواد والعمالة حسب نطاق العمل المذكور أعلاه. أي بند خارج النطاق يُحتسب بشكل منفصل. الدفع: دفعة مقدمة والمتبقي عند التسليم حسب الاتفاق.' }).map(([key, value]) => ({ key, value }));

/** Build the sample data through the real business rules, so every link and number is consistent. */
async function seed() {
  const ctx = ctxFor(owner);
  const cust = (name: string, phone: string, city: string, type = 'individual') => S.createRecord(ctx, 'customers', { name, phone, city, type });
  const c1 = await cust('عميل تجريبي — أ. فهد', '0500000003', 'dammam');
  const c2 = await cust('شركة تجريبية للمقاولات', '0500000004', 'khobar', 'company');
  const c3 = await cust('عميلة تجريبية — أ. نورة', '0500000005', 'dhahran');
  const prj = await S.createRecord(ctx, 'projects', { name: 'مشروع تجريبي — برج سكني 9 أدوار', customer_id: c2.id, status: 'active', start_date: d(-12), delivery_date: d(10), contract_value: 18000, budget_cost: 6000 });

  // Quote → approved → sent → accepted → invoice → partly paid
  const q1 = await S.createDocument(ctx, {
    type: 'quote', customer_id: c2.id, project_id: prj.id, date: d(-14), scope: '* إزالة مخلفات التشطيب\n* تنظيف الأرضيات والزجاج\n* تنظيف دورات المياه',
    items: [
      { description: 'تنظيف تأهيلي — الأدوار 1 إلى 9', service: 'post_construction', qty: 9, unit_price: 1800 },
      { description: 'تنظيف الواجهات الزجاجية للمدخل', service: 'facade', qty: 1, unit_price: 1800 },
    ],
    discount: 1800, terms: 'السعر شامل المواد والعمالة حسب نطاق العمل المذكور أعلاه.', duration: '10 أيام',
  });
  for (const a of ['submit', 'approve', 'send', 'accept']) await S.documentAction(ctx, q1.id, a);
  const inv1 = await S.documentAction(ctx, q1.id, 'to-invoice');
  await S.documentAction(ctx, inv1.id, 'issue', { date: d(-12), due_date: d(3) });
  await S.recordPayment(ctx, { invoice_id: inv1.id, amount: 9000, method: 'bank_transfer', date: d(-11), reference: 'TRX-11834' });

  // Small job: booking → invoice → paid in full
  const b1 = await S.createRecord(ctx, 'bookings', { customer_id: c1.id, status: 'completed', city: 'dammam', services: ['villa_apartment', 'ac_cleaning'], date: d(-3), time: '09:00', assigned_workers: 'فريق 1' });
  const inv2 = await S.bookingToInvoice(ctx, b1.id);
  await S.updateDocument(ctx, inv2.id, { items: [{ description: 'تنظيف شقة 3 غرف', service: 'villa_apartment', qty: 1, unit_price: 900 }, { description: 'تنظيف مكيفات سبليت', service: 'ac_cleaning', qty: 4, unit_price: 100 }], discount: 0 });
  await S.documentAction(ctx, inv2.id, 'issue', { date: d(-3) });
  await S.recordPayment(ctx, { invoice_id: inv2.id, amount: 1300, method: 'card', date: d(-3) });

  // Overdue invoice
  const inv3 = await S.createDocument(ctx, { type: 'invoice', customer_id: c3.id, date: d(-40), items: [{ description: 'غسيل كنب ومجلس', service: 'upholstery', qty: 1, unit_price: 750 }] });
  await S.documentAction(ctx, inv3.id, 'issue', { date: d(-40), due_date: d(-33) });

  // Quotes waiting for approval and with the customer
  const q2 = await S.createDocument(ctx, { type: 'quote', customer_id: c3.id, date: d(-1), items: [{ description: 'تنظيف عميق لفيلا دورين', service: 'deep_cleaning', qty: 1, unit_price: 2400 }] });
  await S.documentAction(ctx, q2.id, 'submit');
  const q3 = await S.createDocument(ctx, { type: 'quote', customer_name: 'Demo Co. (English)', customer_phone: '0500000007', language: 'en', date: d(-2), items: [{ description: 'Office deep clean, 2 floors', service: 'commercial', qty: 2, unit_price: 1600 }] });
  for (const a of ['approve', 'send']) await S.documentAction(ctx, q3.id, a);

  // Imported legacy invoice whose collection was never recorded, and an unlinked legacy payment
  await store.insert('documents', { id: 'do-legacy', doc_number: 'INV-0027', type: 'invoice', status: 'issued', legacy: 'yes', balance_review: 'unverified', date: d(-30), customer_id: c1.id, customer_name: c1.name, customer_phone: c1.phone, price: 1200, scope: 'تنظيف شامل للشقة', payment_method: 'bank_transfer', language: 'ar', created_by: 'legacy' });
  await store.insert('payments', { id: 'pa-legacy', receipt_no: '', date: d(-28), amount: 700, method: 'cash', customer_name: 'عميل كلين سنس', invoice_id: '', status: 'posted', legacy_source: 'revenue:demo', notes: 'تنظيف شقة (من سجل الإيرادات القديم)', created_by: 'legacy' });

  const exp: [string, number, string, string, string][] = [
    ['supplies', 640, 'card', 'مواد تنظيف للبرج', prj.id], ['labor_transport', 380, 'cash', 'نقل العمال للبرج', prj.id],
    ['fuel', 150, 'cash', 'بنزين', ''], ['wages', 2500, 'bank_transfer', 'يوميات العمال', prj.id],
  ];
  for (const [category, amount, method, notes, project_id] of exp) await S.createRecord(ctx, 'expenses', { date: d(-5), category, amount, method, notes, project_id });
  await S.createRecord(ctx, 'leads', { customer_name: 'عميل تجريبي — أ. سالم', phone: '0500000001', service_code: 'post_construction', city: 'khobar', preferred_date: d(3), details: 'فيلا دورين بعد التشطيب، تقريباً 400 م²', estimate_min: 2500, estimate_max: 3200 });
  await S.createRecord(ctx, 'bookings', { customer_id: c3.id, status: 'confirmed', city: 'dhahran', services: ['upholstery'], date: d(0), time: '10:30', assigned_workers: 'فريق 2' });
  await S.createRecord(ctx, 'bookings', { customer_id: c1.id, status: 'pending', city: 'dammam', services: ['deep_cleaning'], date: d(2), time: '14:00' });
  await S.createRecord(ctx, 'workers', { name: 'عامل تجريبي 1', role: 'فني تنظيف', employment_type: 'full_time', status: 'active' });
  await S.createRecord(ctx, 'workers', { name: 'عامل تجريبي 2', role: 'فني مكيفات', employment_type: 'daily', status: 'active' });
  // Opening balances as they are today, and partner movements
  await S.treasuryRecord(ctx, { kind: 'capital_in', account: 'bank', amount: 3000, partner: 'معاذ', date: d(-15), notes: 'شراء معدات' });
  await S.treasuryRecord(ctx, { kind: 'drawing', account: 'cash', amount: 300, partner: 'عبدالرحمن', date: d(-4) });
  await S.createRecord(ctx, 'tasks', { title: 'تجهيز مواد الدور الخامس', assigned_worker: 'عامل تجريبي 1', project: prj.name, due_date: d(1), status: 'open' });
  // Last: today's real balances, so everything recorded before them is reconciled.
  await S.treasurySetBalance(ctx, { account: 'bank', actual: 8000, date: d(0), notes: 'الرصيد الفعلي حسب كشف البنك' });
  await S.treasurySetBalance(ctx, { account: 'cash', actual: 600, date: d(0), notes: 'جرد الصندوق' });
}
const ready = seed().catch((e) => console.error('demo seed failed', e?.code || e, e?.extra || ''));

export async function demoFetch(path: string, method: string, body: any): Promise<any> {
  await ready;
  await new Promise((r) => setTimeout(r, 60));
  const [p, qs] = path.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  if (p === '/auth/me' && method === 'GET') return pub(owner);
  if (p === '/auth/me' && method === 'PATCH') { owner.language = body.language; return pub(owner); }
  if (p.startsWith('/auth/')) return pub(owner);
  if (p === '/meta') return { company: S.companyInfo(ctxFor(owner)), roles: ROLES, open_access: true };
  if (p === '/users') {
    if (method === 'GET') return tables.users.map(pub);
    const u = { id: S.newId('us'), ...body, active: 'yes', must_change_password: 'yes', permissions: '' };
    tables.users.push(u);
    return { user: pub(u), temporary_password: `Demo${Math.floor(Math.random() * 9000 + 1000)}` };
  }
  const um = p.match(/^\/users\/(.+)$/);
  if (um) {
    const u = tables.users.find((x) => x.id === um[1])!;
    if (body.active !== undefined) u.active = body.active ? 'yes' : 'no';
    if (body.role) u.role = body.role;
    if (body.permissions !== undefined) u.permissions = (body.permissions || []).join(',');
    return { user: pub(u), temporary_password: body.reset_password ? `Demo${Math.floor(Math.random() * 9000 + 1000)}` : undefined };
  }
  const m = matchRoute(method, p);
  if (!m) throw new ApiError(404, 'not_found', {});
  const ctx = ctxFor(owner);
  if (!allowed(ctx.perms, m.route[2])) throw new ApiError(403, 'forbidden', {});
  try {
    const out = await (m.route[3] as any)(ctx, m.params, body || {}, query);
    return out === undefined ? undefined : JSON.parse(JSON.stringify(out));
  } catch (e: any) {
    if (e instanceof S.ServiceError) throw new ApiError(e.status, e.code, { error: e.code, ...e.extra });
    throw e;
  }
}

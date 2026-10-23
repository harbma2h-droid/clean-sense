// In-browser stand-in for the API, used only by the preview build (VITE_DEMO=1).
// All records here are invented sample data, never real customers.
import { ROLES, TABLES } from '@shared/model.js';
import { ApiError, type Row } from './api';

const today = new Date();
const d = (offset: number) => new Date(today.getTime() + offset * 864e5).toISOString().slice(0, 10);
const month = d(0).slice(0, 7);

const owner = { id: 'us-demo', name: 'معاذ', username: 'moath', job_title: 'المالك', role: 'owner', language: 'ar', active: 'yes', must_change_password: 'no', permissions: '' };

const db: Record<string, Row[]> = {
  leads: [
    { id: 'CS-2610-0002', status: 'new', customer_name: 'عميل تجريبي — أ. سالم', phone: '0500000001', service_code: 'post_construction', city: 'khobar', district: 'العقربية', preferred_date: d(3), preferred_time: 'صباحاً', details: 'فيلا دورين بعد التشطيب، تقريباً 400 م²', language: 'ar', utm_source: 'instagram', created_at: `${d(0)}T07:12:00Z` },
    { id: 'CS-2610-0001', status: 'contacted', customer_name: 'Demo — Mr. James', phone: '0500000002', service_code: 'deep_cleaning', city: 'dhahran', preferred_date: d(5), details: '3BR apartment', language: 'en', utm_source: 'google', created_at: `${d(-1)}T15:40:00Z` },
  ],
  bookings: [
    { id: 'bo-1', status: 'confirmed', customer_name: 'عميل تجريبي — أ. فهد', phone: '0500000003', city: 'dammam', services: 'villa_apartment,ac_cleaning', date: d(0), time: '09:00', assigned_workers: 'فريق 1' },
    { id: 'bo-2', status: 'in_progress', customer_name: 'عميل تجريبي — شركة نخبة', phone: '0500000004', city: 'khobar', services: 'commercial', date: d(0), time: '14:00', assigned_workers: 'فريق 2' },
    { id: 'bo-3', status: 'pending', customer_name: 'عميل تجريبي — أ. نورة', phone: '0500000005', city: 'dhahran', services: 'upholstery', date: d(2), time: '10:30' },
  ],
  projects: [
    { id: 'pr-1', name: 'مشروع تجريبي — برج سكني', customer_name: 'شركة تجريبية', status: 'active', start_date: d(-6), delivery_date: d(8), contract_value: 40000, paid_amount: 15000, remaining: 'الأدوار 5 إلى 9' },
  ],
  documents: [
    { id: 'do-1', doc_number: 'INV-0021', type: 'invoice', date: d(-2), customer_name: 'عميل تجريبي — أ. فهد', customer_phone: '0500000003', services: 'villa_apartment', scope: '* تنظيف شامل للشقة\n* تنظيف 4 مكيفات', price: 1400, paid_amount: 700, payment_method: 'bank_transfer', duration: 'يوم', terms: 'السعر شامل المواد والعمالة حسب نطاق العمل المذكور أعلاه.', language: 'ar' },
    { id: 'do-2', doc_number: 'QO-0018', type: 'quote', date: d(-1), customer_name: 'Demo Co.', services: 'commercial', scope: '* Office floor deep clean\n* Glass partitions', price: 3200, quote_status: 'pending', payment_method: 'bank_transfer', duration: '2 days', language: 'en' },
  ],
  revenue: [
    { id: 're-1', date: `${month}-02`, customer_name: 'عميل تجريبي', method: 'bank_transfer', amount: 2700, doc_number: 'INV-0019' },
    { id: 're-2', date: d(-2), customer_name: 'عميل تجريبي — أ. فهد', method: 'card', amount: 700, doc_number: 'INV-0021' },
  ],
  expenses: [
    { id: 'ex-1', date: `${month}-03`, category: 'supplies', amount: 420.5, method: 'card', notes: 'مواد تنظيف' },
    { id: 'ex-2', date: d(-1), category: 'fuel', amount: 150, method: 'cash', notes: 'بنزين السيارة' },
  ],
  workers: [
    { id: 'wo-1', name: 'عامل تجريبي 1', phone: '0500000010', role: 'فني تنظيف', employment_type: 'full_time', status: 'active' },
    { id: 'wo-2', name: 'عامل تجريبي 2', phone: '0500000011', role: 'فني مكيفات', employment_type: 'daily', status: 'active' },
  ],
  tasks: [{ id: 'ta-1', title: 'تجهيز مواد مشروع البرج', assigned_worker: 'عامل تجريبي 1', due_date: d(1), status: 'open' }],
  users: [owner, { id: 'us-2', name: 'موظف تجريبي', username: 'staff1', job_title: 'منسق حجوزات', role: 'booking_coordinator', language: 'ar', active: 'yes', must_change_password: 'yes', permissions: '' }],
};

const settings = {
  'company.legal_name': 'مؤسسة كلين سنس', 'company.brand_ar': 'كلين سنس', 'company.brand_en': 'Clean Sense', 'company.unified_number': '7049749042',
  'contact.phone': '0537717716', 'contact.email': 'info@cleansense.co', 'contact.website': 'cleansense.co',
  'guarantee.golden_ar': 'لا نعتبر العمل منتهياً إلا بعد رضاك. أي ملاحظة ضمن نطاق العمل المتفق عليه نعالجها مباشرة دون أي تكلفة إضافية، خلال 24 ساعة من تاريخ التسليم.',
  'guarantee.golden_en': "We don't consider the job finished until you're satisfied. Any note within the agreed scope of work is fixed right away at no extra cost, within 24 hours of handover.",
};

const PREFIX: Record<string, string> = { quote: 'QO', invoice: 'INV', receipt: 'REC', contract: 'CS' };
const perms = (u: Row) => (u.permissions ? String(u.permissions).split(',') : (ROLES as any)[u.role].perms);
const pub = (u: Row) => ({ ...u, permissions: perms(u), must_change_password: u.must_change_password === 'yes', active: u.active !== 'no' });
let seq = 100;
const sum = (rows: Row[], k: string) => rows.reduce((s, r) => s + (Number(r[k]) || 0), 0);
const live = (t: string) => db[t].filter((r) => !r.deleted_at);

export async function demoFetch(path: string, method: string, body: any): Promise<any> {
  await new Promise((r) => setTimeout(r, 120));
  const [p] = path.split('?');
  if (p === '/auth/me' && method === 'GET') return pub(owner);
  if (p === '/auth/me' && method === 'PATCH') { owner.language = body.language; return pub(owner); }
  if (p === '/auth/login') return pub(owner);
  if (p === '/auth/logout') return undefined;
  if (p === '/auth/password') return pub(owner);
  if (p === '/meta') return { company: settings, roles: ROLES, open_access: true };
  if (p === '/summary') {
    const t = d(0);
    const b = live('bookings');
    return {
      bookings_today: b.filter((x) => x.date === t && x.status !== 'cancelled').length,
      bookings_upcoming: b.filter((x) => x.date > t && x.status !== 'cancelled').length,
      bookings_pending: b.filter((x) => x.status === 'pending').length,
      today: b.filter((x) => x.date === t).sort((a, c) => String(a.time).localeCompare(String(c.time))),
      leads_new: live('leads').filter((l) => l.status === 'new').length,
      revenue_month: sum(live('revenue').filter((r) => String(r.date).startsWith(month)), 'amount'),
      expenses_month: sum(live('expenses').filter((r) => String(r.date).startsWith(month)), 'amount'),
      projects_active: live('projects').filter((x) => x.status === 'active').length,
      tasks_open: live('tasks').filter((x) => x.status !== 'done').length,
    };
  }
  if (p === '/users') {
    if (method === 'GET') return db.users.map(pub);
    const u = { id: `us-${++seq}`, ...body, active: 'yes', must_change_password: 'yes', permissions: '' };
    db.users.push(u);
    return { user: pub(u), temporary_password: 'Demo' + seq + 'x' };
  }
  let m = p.match(/^\/users\/(.+)$/);
  if (m) {
    const u = db.users.find((x) => x.id === m![1])!;
    if (body.active !== undefined) u.active = body.active ? 'yes' : 'no';
    if (body.role) u.role = body.role;
    return { user: pub(u), temporary_password: body.reset_password ? 'Demo' + ++seq + 'x' : undefined };
  }
  m = p.match(/^\/data\/documents\/(.+)\/to-invoice$/);
  if (m) {
    const qo = db.documents.find((x) => x.id === m![1])!;
    const inv = await demoFetch('/data/documents', 'POST', { ...qo, id: undefined, doc_number: undefined, quote_status: '', type: 'invoice', date: d(0), converted_from: qo.doc_number });
    Object.assign(qo, { quote_status: 'accepted', converted_to: inv.doc_number });
    return inv;
  }
  m = p.match(/^\/data\/leads\/(.+)\/convert$/);
  if (m) {
    const l = db.leads.find((x) => x.id === m![1])!;
    const b = { id: `bo-${++seq}`, status: 'pending', customer_name: l.customer_name, phone: l.phone, city: l.city, services: l.service_code, date: l.preferred_date, lead_id: l.id, notes: l.details };
    db.bookings.push(b);
    Object.assign(l, { status: 'booked', booking_id: b.id });
    return b;
  }
  m = p.match(/^\/data\/(\w+)(?:\/(.+))?$/);
  if (m && (TABLES as any)[m[1]]) {
    const [, t, id] = m;
    if (method === 'GET') return live(t);
    if (method === 'POST') {
      const row: Row = { ...body, id: t === 'leads' ? `CS-DEMO-${++seq}` : `${t.slice(0, 2)}-${++seq}`, created_at: new Date().toISOString() };
      if (t === 'documents') {
        const pre = PREFIX[row.type] || 'DOC';
        const max = db.documents.reduce((mx, x) => Math.max(mx, Number(String(x.doc_number).match(new RegExp(`^${pre}-(\\d+)$`))?.[1] || 0)), 0);
        row.doc_number = `${pre}-${String(max + 1).padStart(4, '0')}`;
      }
      db[t].push(row);
      return row;
    }
    const row = db[t].find((x) => x.id === id);
    if (!row) throw new ApiError(404, 'not_found', {});
    if (method === 'PATCH') return Object.assign(row, body);
    if (method === 'DELETE') { row.deleted_at = new Date().toISOString(); return undefined; }
  }
  throw new ApiError(404, 'not_found', {});
}

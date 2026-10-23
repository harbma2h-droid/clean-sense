// Shared data model for the Clean Sense system (server, web app and demo).
// Stored values are language-neutral codes; labels come from here in AR/EN.
// Column keys must exist in ./schema.json (the Google Sheets layout).

export const PERMISSIONS = {
  dashboard: { ar: 'الرئيسية', en: 'Home' },
  leads: { ar: 'طلبات الموقع', en: 'Website leads' },
  customers: { ar: 'العملاء', en: 'Customers' },
  sales: { ar: 'عروض الأسعار والفواتير', en: 'Quotes & invoices' },
  approve_quotes: { ar: 'اعتماد عروض الأسعار', en: 'Approve quotations' },
  finance: { ar: 'التحصيل والمصروفات', en: 'Payments & expenses' },
  reports: { ar: 'التقارير المالية', en: 'Financial reports' },
  bookings: { ar: 'الحجوزات', en: 'Bookings' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  workers: { ar: 'العمال', en: 'Workers' },
  tasks: { ar: 'المهام', en: 'Tasks' },
  users: { ar: 'المستخدمون والصلاحيات', en: 'Users & access' },
  settings: { ar: 'إعدادات النظام', en: 'System settings' },
};

export const ROLES = {
  owner: { ar: 'المالك', en: 'Owner', perms: Object.keys(PERMISSIONS) },
  ops_manager: { ar: 'مدير تشغيل', en: 'Operations manager', perms: ['dashboard', 'leads', 'customers', 'sales', 'approve_quotes', 'bookings', 'projects', 'workers', 'tasks'] },
  booking_coordinator: { ar: 'منسق حجوزات', en: 'Booking coordinator', perms: ['dashboard', 'leads', 'customers', 'sales', 'bookings', 'tasks'] },
  accountant: { ar: 'محاسب', en: 'Accountant', perms: ['dashboard', 'customers', 'sales', 'finance', 'reports'] },
  supervisor: { ar: 'مشرف', en: 'Supervisor', perms: ['dashboard', 'bookings', 'projects', 'tasks'] },
  employee: { ar: 'موظف', en: 'Employee', perms: ['dashboard', 'tasks'] },
};

const e = (pairs) => Object.fromEntries(pairs.map(([code, ar, en]) => [code, { ar, en }]));

export const ENUMS = {
  lead_status: e([['new', 'جديد', 'New'], ['contacted', 'تم التواصل', 'Contacted'], ['quoted', 'أُرسل عرض سعر', 'Quote sent'], ['booked', 'تحوّل لحجز', 'Booked'], ['lost', 'لم يتم', 'Lost']]),
  booking_status: e([['pending', 'بانتظار التأكيد', 'Pending'], ['confirmed', 'مؤكد', 'Confirmed'], ['in_progress', 'قيد التنفيذ', 'In progress'], ['completed', 'مكتمل', 'Completed'], ['cancelled', 'ملغي', 'Cancelled']]),
  project_status: e([['planned', 'مخطط', 'Planned'], ['active', 'قيد التنفيذ', 'Active'], ['delivered', 'تم التسليم', 'Delivered'], ['closed', 'مغلق', 'Closed']]),
  doc_type: e([['quote', 'عرض سعر', 'Quotation'], ['invoice', 'فاتورة', 'Invoice'], ['receipt', 'إيصال استلام دفعة', 'Payment receipt'], ['contract', 'عقد عمل', 'Service contract']]),
  // Quotation workflow. "accepted" is the customer's agreement: it never means money was collected.
  quote_status: e([['draft', 'مسودة', 'Draft'], ['pending_approval', 'بانتظار الاعتماد', 'Awaiting approval'], ['approved', 'معتمد داخلياً', 'Approved'], ['sent', 'أُرسل للعميل', 'Sent'], ['accepted', 'قبله العميل', 'Accepted'], ['rejected', 'رفضه العميل', 'Rejected'], ['cancelled', 'ملغي', 'Cancelled'], ['pending', 'بانتظار الرد (قديم)', 'Awaiting reply (legacy)']]),
  invoice_status: e([['draft', 'مسودة', 'Draft'], ['issued', 'صادرة', 'Issued'], ['void', 'ملغاة', 'Void']]),
  // Derived from payments, never typed by hand.
  payment_state: e([['unpaid', 'غير مدفوعة', 'Unpaid'], ['partial', 'مدفوعة جزئياً', 'Partly paid'], ['paid', 'مدفوعة', 'Paid'], ['overdue', 'متأخرة', 'Overdue'], ['unverified', 'رصيد غير مؤكد', 'Balance unverified'], ['void', 'ملغاة', 'Void'], ['draft', 'مسودة', 'Draft']]),
  contract_status: e([['draft', 'مسودة', 'Draft'], ['active', 'ساري', 'Active'], ['completed', 'منتهي', 'Completed'], ['cancelled', 'ملغي', 'Cancelled']]),
  payment_status: e([['posted', 'مسجّلة', 'Posted'], ['void', 'ملغاة', 'Void']]),
  balance_review: e([['unverified', 'غير مؤكد', 'Unverified'], ['confirmed_due', 'مستحق فعلاً', 'Confirmed due']]),
  payment_method: e([['card', 'شبكة', 'Card (POS)'], ['bank_transfer', 'تحويل بنكي', 'Bank transfer'], ['cash', 'كاش', 'Cash'], ['stc_pay', 'STC Pay', 'STC Pay'], ['other', 'أخرى', 'Other']]),
  customer_type: e([['individual', 'فرد', 'Individual'], ['company', 'شركة / جهة', 'Company']]),
  task_status: e([['open', 'مفتوحة', 'Open'], ['done', 'منجزة', 'Done']]),
  worker_status: e([['active', 'على رأس العمل', 'Active'], ['leave', 'إجازة', 'On leave'], ['inactive', 'غير نشط', 'Inactive']]),
  employment_type: e([['full_time', 'دوام كامل', 'Full time'], ['daily', 'يومي', 'Daily'], ['contract', 'بالعقد', 'Contract']]),
  expense_category: e([['supplies', 'مواد', 'Supplies'], ['fuel', 'وقود', 'Fuel'], ['labor_transport', 'نقل عمالة', 'Labour transport'], ['housing', 'سكن', 'Housing'], ['equipment', 'معدات', 'Equipment'], ['vehicle', 'سيارة', 'Vehicle'], ['wages', 'رواتب وأجور', 'Wages'], ['marketing', 'تسويق', 'Marketing'], ['other', 'مصاريف أخرى', 'Other expenses']]),
  city: e([['khobar', 'الخبر', 'Al Khobar'], ['dammam', 'الدمام', 'Dammam'], ['dhahran', 'الظهران', 'Dhahran'], ['jubail', 'الجبيل', 'Jubail'], ['ras_tanura', 'رأس تنورة', 'Ras Tanura'], ['qatif', 'القطيف', 'Qatif']]),
  service: e([
    ['post_construction', 'التنظيف التأهيلي بعد البناء والتشطيب', 'Post-construction cleaning'],
    ['villa_apartment', 'تنظيف الفلل والشقق', 'Villa & apartment cleaning'],
    ['deep_cleaning', 'التنظيف العميق', 'Deep cleaning'],
    ['upholstery', 'تنظيف الكنب والمجالس', 'Sofa & majlis cleaning'],
    ['floor_polishing', 'تنظيف وتلميع الأرضيات', 'Floor cleaning & polishing'],
    ['carpet', 'تنظيف السجاد والموكيت', 'Carpet & moquette'],
    ['ac_cleaning', 'تنظيف المكيفات', 'AC cleaning'],
    ['commercial', 'مشاريع تجارية وعقارية', 'Commercial & property'],
    ['facade', 'تنظيف الواجهات', 'Façade cleaning'],
    ['facility_ops', 'تشغيل وصيانة المرافق', 'Facility O&M'],
    ['other', 'أخرى', 'Other'],
  ]),
  treasury_kind: e([['capital_in', 'إيداع من الشريك', 'Partner contribution'], ['drawing', 'سحب للشريك', 'Partner drawing'], ['transfer', 'تحويل بين الحسابات', 'Transfer between accounts'], ['balance_set', 'مطابقة رصيد', 'Balance reconciliation']]),
  treasury_account: e([['bank', 'البنك', 'Bank'], ['cash', 'الصندوق (كاش)', 'Cash box'], ['stc_pay', 'STC Pay', 'STC Pay']]),
  language: e([['ar', 'العربية', 'Arabic'], ['en', 'الإنجليزية', 'English']]),
  yes_no: e([['yes', 'نعم', 'Yes'], ['no', 'لا', 'No']]),
};

/**
 * Field types: text, tel, email, date, time, money, number, select, multiselect, textarea, url, ref
 * ref: a link to another table (ref: 'customers' | 'projects' ...), shown as a picker.
 * list: shown in the list view; title/sub: card headline / subtitle on phones.
 */
const f = (key, ar, en, type = 'text', extra = {}) => ({ key, label: { ar, en }, type, ...extra });

// Simple record tables edited through the generic list + form screens.
// Quotes, invoices and payments have their own screens and rules (see services.js).
export const TABLES = {
  customers: {
    perm: 'customers', label: PERMISSIONS.customers, title: 'name', sub: ['code', 'phone'], sort: 'created_at',
    fields: [
      f('code', 'رقم العميل', 'Customer no.', 'text', { readonly: true, list: true }),
      f('name', 'الاسم', 'Name', 'text', { required: true, list: true }),
      f('type', 'النوع', 'Type', 'select', { enum: 'customer_type', default: 'individual', list: true }),
      f('phone', 'الجوال', 'Phone', 'tel', { required: true, list: true }),
      f('phone2', 'جوال إضافي', 'Alt. phone', 'tel'),
      f('email', 'البريد', 'Email', 'email'),
      f('city', 'المدينة', 'City', 'select', { enum: 'city', list: true }),
      f('district', 'الحي', 'District'),
      f('address', 'العنوان', 'Address', 'textarea'),
      f('location_url', 'الموقع على الخريطة', 'Map location', 'url'),
      f('language', 'لغة التواصل', 'Language', 'select', { enum: 'language', default: 'ar' }),
      f('source', 'من وين عرفنا', 'Source'),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  leads: {
    perm: 'leads', label: PERMISSIONS.leads, title: 'customer_name', sub: ['service_code', 'city'], sort: 'created_at',
    fields: [
      f('id', 'الرقم المرجعي', 'Reference', 'text', { readonly: true, list: true }),
      f('status', 'الحالة', 'Status', 'select', { enum: 'lead_status', list: true, badge: true, default: 'new' }),
      f('customer_name', 'اسم العميل', 'Customer name', 'text', { required: true, list: true }),
      f('phone', 'الجوال', 'Phone', 'tel', { required: true, list: true }),
      f('service_code', 'الخدمة', 'Service', 'select', { enum: 'service', list: true }),
      f('details', 'تفاصيل الخدمة', 'Service details', 'textarea'),
      f('city', 'المدينة', 'City', 'select', { enum: 'city' }),
      f('district', 'الحي', 'District'),
      f('preferred_date', 'التاريخ المفضل', 'Preferred date', 'date', { list: true }),
      f('preferred_time', 'الفترة المفضلة', 'Preferred time'),
      f('estimate_min', 'التقدير من', 'Estimate from', 'money'),
      f('estimate_max', 'التقدير إلى', 'Estimate to', 'money'),
      f('language', 'اللغة', 'Language', 'select', { enum: 'language' }),
      f('utm_source', 'مصدر الزيارة', 'Traffic source', 'text', { readonly: true }),
      f('assigned_to', 'المسؤول', 'Assigned to'),
      f('lost_reason', 'سبب عدم الإتمام', 'Lost reason', 'text', { showIf: ['status', 'lost'] }),
      f('customer_id', 'العميل', 'Customer', 'ref', { ref: 'customers', readonly: true }),
      f('quote_id', 'عرض السعر', 'Quote', 'ref', { ref: 'documents', readonly: true }),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
      f('created_at', 'وقت الطلب', 'Created at', 'text', { readonly: true }),
    ],
  },
  bookings: {
    perm: 'bookings', label: PERMISSIONS.bookings, title: 'customer_name', sub: ['date', 'time'], sort: 'date',
    fields: [
      f('status', 'الحالة', 'Status', 'select', { enum: 'booking_status', list: true, badge: true, default: 'pending' }),
      f('customer_id', 'العميل', 'Customer', 'ref', { ref: 'customers' }),
      f('customer_name', 'اسم العميل', 'Customer name', 'text', { required: true, list: true }),
      f('phone', 'الجوال', 'Phone', 'tel', { list: true }),
      f('city', 'المدينة', 'City', 'select', { enum: 'city', list: true }),
      f('location_url', 'رابط الموقع (قوقل ماب)', 'Location (Google Maps)', 'url'),
      f('services', 'الخدمات', 'Services', 'multiselect', { enum: 'service', list: true }),
      f('other_service', 'خدمة أخرى', 'Other service'),
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('time', 'الوقت', 'Time', 'time', { list: true }),
      f('assigned_workers', 'العمال المكلفون', 'Assigned workers'),
      f('project_id', 'المشروع', 'Project', 'ref', { ref: 'projects' }),
      f('quote_id', 'عرض السعر', 'Quote', 'ref', { ref: 'documents', readonly: true }),
      f('invoice_id', 'الفاتورة', 'Invoice', 'ref', { ref: 'documents', readonly: true }),
      f('lead_id', 'رقم طلب الموقع', 'Lead ref', 'text', { readonly: true }),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  projects: {
    perm: 'projects', label: PERMISSIONS.projects, title: 'name', sub: ['code', 'customer_name'], sort: 'start_date',
    fields: [
      f('code', 'رقم المشروع', 'Project no.', 'text', { readonly: true, list: true }),
      f('name', 'اسم المشروع', 'Project name', 'text', { required: true, list: true }),
      f('customer_id', 'العميل', 'Customer', 'ref', { ref: 'customers' }),
      f('customer_name', 'اسم العميل', 'Customer name', 'text', { list: true }),
      f('status', 'الحالة', 'Status', 'select', { enum: 'project_status', list: true, badge: true, default: 'active' }),
      f('start_date', 'تاريخ البداية', 'Start date', 'date'),
      f('delivery_date', 'تاريخ التسليم', 'Delivery date', 'date', { list: true }),
      f('team', 'الفريق المسؤول', 'Team'),
      f('contract_value', 'قيمة العقد', 'Contract value', 'money', { list: true }),
      f('budget_cost', 'التكلفة التقديرية', 'Estimated cost', 'money'),
      f('completed', 'المنجز', 'Completed', 'textarea'),
      f('remaining', 'المتبقي', 'Remaining', 'textarea'),
      f('missing', 'النواقص', 'Missing items', 'textarea'),
      f('warranty_notes', 'ملاحظات الضمان الذهبي', 'Golden guarantee notes', 'textarea'),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  expenses: {
    perm: 'finance', label: { ar: 'المصروفات', en: 'Expenses' }, title: 'notes', sub: ['date', 'category'], sort: 'date',
    fields: [
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('category', 'التصنيف', 'Category', 'select', { enum: 'expense_category', required: true, list: true }),
      f('amount', 'المبلغ', 'Amount', 'money', { required: true, list: true, total: true, positive: true }),
      f('method', 'طريقة الدفع', 'Method', 'select', { enum: 'payment_method', required: true }),
      f('project_id', 'المشروع', 'Project', 'ref', { ref: 'projects', list: true }),
      f('booking_id', 'الحجز', 'Booking', 'ref', { ref: 'bookings' }),
      f('supplier', 'المورد / الجهة', 'Supplier'),
      f('reference', 'رقم الإيصال / المرجع', 'Receipt / reference'),
      f('notes', 'البيان', 'Description', 'textarea', { list: true }),
    ],
  },
  workers: {
    perm: 'workers', label: PERMISSIONS.workers, title: 'name', sub: ['role', 'phone'], sort: 'name',
    fields: [
      f('name', 'الاسم', 'Name', 'text', { required: true, list: true }),
      f('phone', 'الجوال', 'Phone', 'tel', { list: true }),
      f('nationality', 'الجنسية', 'Nationality'),
      f('role', 'الوظيفة', 'Role', 'text', { list: true }),
      f('employment_type', 'نوع الدوام', 'Employment type', 'select', { enum: 'employment_type' }),
      f('wage', 'الراتب / اليومية', 'Wage', 'money'),
      f('status', 'الحالة', 'Status', 'select', { enum: 'worker_status', list: true, badge: true, default: 'active' }),
      f('projects', 'المشاريع المكلف بها', 'Assigned projects'),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  tasks: {
    perm: 'tasks', label: PERMISSIONS.tasks, title: 'title', sub: ['assigned_worker', 'due_date'], sort: 'due_date',
    fields: [
      f('title', 'المهمة', 'Task', 'text', { required: true, list: true }),
      f('assigned_worker', 'المسؤول', 'Assignee', 'text', { list: true }),
      f('project', 'المشروع', 'Project'),
      f('due_date', 'تاريخ الاستحقاق', 'Due date', 'date', { list: true }),
      f('status', 'الحالة', 'Status', 'select', { enum: 'task_status', list: true, badge: true, default: 'open' }),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
};

/* ---------- Owner-editable settings ---------- */

// Settings the owners can edit from the system. Everything else stays in the sheet.
export const SETTINGS_SPEC = [
  { group: 'company', key: 'company.legal_name', ar: 'الاسم القانوني', en: 'Legal name' },
  { group: 'company', key: 'company.legal_name_en', ar: 'الاسم القانوني بالإنجليزي', en: 'Legal name (English)' },
  { group: 'company', key: 'company.unified_number', ar: 'الرقم الوطني الموحد', en: 'Unified number' },
  { group: 'company', key: 'company.partners', ar: 'أسماء الشركاء (مفصولة بفاصلة)', en: 'Partner names (comma separated)' },
  { group: 'contact', key: 'contact.phone', ar: 'الجوال وواتساب', en: 'Phone & WhatsApp' },
  { group: 'contact', key: 'contact.email', ar: 'البريد', en: 'Email' },
  { group: 'contact', key: 'contact.website', ar: 'الموقع', en: 'Website' },
  { group: 'documents', key: 'docs.default_terms_ar', ar: 'الشروط الافتراضية (عربي)', en: 'Default terms (Arabic)', type: 'textarea' },
  { group: 'documents', key: 'docs.default_terms_en', ar: 'الشروط الافتراضية (إنجليزي)', en: 'Default terms (English)', type: 'textarea' },
  { group: 'documents', key: 'docs.quote_valid_days', ar: 'صلاحية عرض السعر بالأيام (فارغ = بدون)', en: 'Quote validity in days (blank = none)', type: 'number' },
  { group: 'documents', key: 'docs.invoice_due_days', ar: 'مدة استحقاق الفاتورة بالأيام', en: 'Invoice due in (days)', type: 'number' },
  { group: 'documents', key: 'docs.show_bank', ar: 'إظهار بيانات الحساب البنكي في الفواتير', en: 'Show bank details on invoices', type: 'yes_no' },
  { group: 'documents', key: 'bank.name', ar: 'اسم البنك', en: 'Bank name' },
  { group: 'documents', key: 'bank.account_name', ar: 'اسم صاحب الحساب', en: 'Account holder' },
  { group: 'documents', key: 'bank.iban', ar: 'رقم الآيبان', en: 'IBAN' },
  { group: 'documents', key: 'docs.footer_note_ar', ar: 'ملاحظة أسفل المستند (عربي)', en: 'Document footer note (Arabic)', type: 'textarea' },
  { group: 'documents', key: 'docs.footer_note_en', ar: 'ملاحظة أسفل المستند (إنجليزي)', en: 'Document footer note (English)', type: 'textarea' },
  { group: 'messages', key: 'wa.quote_ar', ar: 'رسالة واتساب لعرض السعر (عربي)', en: 'WhatsApp — quotation (Arabic)', type: 'textarea' },
  { group: 'messages', key: 'wa.quote_en', ar: 'رسالة واتساب لعرض السعر (إنجليزي)', en: 'WhatsApp — quotation (English)', type: 'textarea' },
  { group: 'messages', key: 'wa.invoice_ar', ar: 'رسالة واتساب للفاتورة (عربي)', en: 'WhatsApp — invoice (Arabic)', type: 'textarea' },
  { group: 'messages', key: 'wa.invoice_en', ar: 'رسالة واتساب للفاتورة (إنجليزي)', en: 'WhatsApp — invoice (English)', type: 'textarea' },
  { group: 'messages', key: 'wa.receipt_ar', ar: 'رسالة واتساب لسند القبض (عربي)', en: 'WhatsApp — receipt (Arabic)', type: 'textarea' },
  { group: 'messages', key: 'wa.receipt_en', ar: 'رسالة واتساب لسند القبض (إنجليزي)', en: 'WhatsApp — receipt (English)', type: 'textarea' },
];
export const SETTINGS_GROUPS = {
  company: { ar: 'المنشأة', en: 'Business' }, contact: { ar: 'التواصل', en: 'Contact' },
  documents: { ar: 'المستندات', en: 'Documents' }, messages: { ar: 'رسائل واتساب', en: 'WhatsApp messages' },
};
// {name} {number} {total} {balance} {company} are replaced when a message is prepared.
export const DEFAULT_MESSAGES = {
  'wa.quote_ar': 'هلا {name}، يسعدنا نرسل لك عرض سعر {company} رقم {number} بقيمة {total}. حياك لأي استفسار.',
  'wa.quote_en': 'Hello {name}, please find {company} quotation {number} for {total}. Happy to answer any questions.',
  'wa.invoice_ar': 'هلا {name}، هذي فاتورة {company} رقم {number} بقيمة {total}. المتبقي: {balance}. شاكرين ثقتك.',
  'wa.invoice_en': 'Hello {name}, here is {company} invoice {number} for {total}. Balance due: {balance}. Thank you.',
  'wa.receipt_ar': 'هلا {name}، استلمنا منك {total}، وهذا سند القبض رقم {number}. شاكرين لك.',
  'wa.receipt_en': 'Hello {name}, we received {total}. This is receipt {number}. Thank you.',
};

// Lists the owners can extend or hide from the system. Codes never change once created,
// so old records keep their meaning; hidden items stay valid but are no longer offered.
export const EDITABLE_LISTS = ['service', 'expense_category', 'city', 'payment_method'];
export const HIDDEN = {};
const BASE = Object.fromEntries(EDITABLE_LISTS.map((k) => [k, { ...ENUMS[k] }]));

/** Apply owner-made list changes (settings key list.<name> = JSON [{code, ar, en, hidden}]). */
export function applyLists(settings) {
  for (const name of EDITABLE_LISTS) {
    ENUMS[name] = { ...BASE[name] };
    HIDDEN[name] = new Set();
    let custom = [];
    try { custom = JSON.parse(settings[`list.${name}`] || '[]'); } catch { custom = []; }
    for (const it of Array.isArray(custom) ? custom : []) {
      if (!it || !/^[a-z0-9_]{2,40}$/.test(it.code || '')) continue;
      if (it.ar || it.en) ENUMS[name][it.code] = { ar: it.ar || it.en, en: it.en || it.ar };
      if (it.hidden && ENUMS[name][it.code]) HIDDEN[name].add(it.code);
    }
  }
}

export const MONEY_FMT = (n, lang) =>
  `${Number(n || 0).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;

export const enumLabel = (enumName, code, lang) => ENUMS[enumName]?.[code]?.[lang] ?? code ?? '';

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

export const MONEY_FMT = (n, lang) =>
  `${Number(n || 0).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: Number(n) % 1 ? 2 : 0, maximumFractionDigits: 2 })} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;

export const enumLabel = (enumName, code, lang) => ENUMS[enumName]?.[code]?.[lang] ?? code ?? '';

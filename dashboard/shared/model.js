// Shared data model for the Clean Sense internal system (server + web).
// Stored values are language-neutral codes; labels come from here in AR/EN.
// Column keys must exist in ../../system/schema.json (the Google Sheets layout).

/** @typedef {{ar: string, en: string}} L */

export const PERMISSIONS = {
  dashboard: { ar: 'الرئيسية', en: 'Home' },
  leads: { ar: 'طلبات الموقع', en: 'Website leads' },
  bookings: { ar: 'الحجوزات', en: 'Bookings' },
  projects: { ar: 'المشاريع', en: 'Projects' },
  documents: { ar: 'الفواتير والمستندات', en: 'Invoices & documents' },
  finance: { ar: 'المالية', en: 'Finance' },
  workers: { ar: 'العمال', en: 'Workers' },
  tasks: { ar: 'المهام', en: 'Tasks' },
  users: { ar: 'المستخدمون والصلاحيات', en: 'Users & access' },
};

export const ROLES = {
  owner: { ar: 'المالك', en: 'Owner', perms: Object.keys(PERMISSIONS) },
  ops_manager: { ar: 'مدير تشغيل', en: 'Operations manager', perms: ['dashboard', 'leads', 'bookings', 'projects', 'workers', 'tasks'] },
  booking_coordinator: { ar: 'منسق حجوزات', en: 'Booking coordinator', perms: ['dashboard', 'leads', 'bookings', 'tasks'] },
  accountant: { ar: 'محاسب', en: 'Accountant', perms: ['dashboard', 'documents', 'finance'] },
  supervisor: { ar: 'مشرف', en: 'Supervisor', perms: ['dashboard', 'projects', 'tasks'] },
  employee: { ar: 'موظف', en: 'Employee', perms: ['dashboard', 'tasks'] },
};

const e = (pairs) => Object.fromEntries(pairs.map(([code, ar, en]) => [code, { ar, en }]));

export const ENUMS = {
  lead_status: e([['new', 'جديد', 'New'], ['contacted', 'تم التواصل', 'Contacted'], ['quoted', 'أُرسل عرض سعر', 'Quote sent'], ['booked', 'تحوّل لحجز', 'Booked'], ['lost', 'لم يتم', 'Lost']]),
  booking_status: e([['pending', 'بانتظار التأكيد', 'Pending'], ['confirmed', 'مؤكد', 'Confirmed'], ['in_progress', 'قيد التنفيذ', 'In progress'], ['completed', 'مكتمل', 'Completed'], ['cancelled', 'ملغي', 'Cancelled']]),
  project_status: e([['planned', 'مخطط', 'Planned'], ['active', 'قيد التنفيذ', 'Active'], ['delivered', 'تم التسليم', 'Delivered'], ['closed', 'مغلق', 'Closed']]),
  doc_type: e([['quote', 'عرض سعر', 'Quotation'], ['invoice', 'فاتورة', 'Invoice'], ['receipt', 'إيصال استلام دفعة', 'Payment receipt'], ['contract', 'عقد عمل', 'Service contract']]),
  payment_method: e([['card', 'شبكة', 'Card (POS)'], ['bank_transfer', 'تحويل بنكي', 'Bank transfer'], ['cash', 'كاش', 'Cash'], ['stc_pay', 'STC Pay', 'STC Pay'], ['other', 'أخرى', 'Other']]),
  quote_status: e([['pending', 'بانتظار الرد', 'Awaiting reply'], ['accepted', 'مقبول', 'Accepted'], ['rejected', 'مرفوض', 'Rejected']]),
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
 * Field types: text, tel, date, time, money, number, select, multiselect, textarea, url
 * list: shown in the list view; title/sub: card headline / subtitle on phones.
 */
const f = (key, ar, en, type = 'text', extra = {}) => ({ key, label: { ar, en }, type, ...extra });

export const TABLES = {
  leads: {
    perm: 'leads', icon: 'Inbox', label: PERMISSIONS.leads, title: 'customer_name', sub: ['service_code', 'city'], sort: 'created_at',
    fields: [
      f('id', 'الرقم المرجعي', 'Reference', 'text', { readonly: true, list: true }),
      f('status', 'الحالة', 'Status', 'select', { enum: 'lead_status', list: true, badge: true }),
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
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
      f('created_at', 'وقت الطلب', 'Created at', 'text', { readonly: true }),
    ],
  },
  bookings: {
    perm: 'bookings', icon: 'CalendarClock', label: PERMISSIONS.bookings, title: 'customer_name', sub: ['date', 'time'], sort: 'date',
    fields: [
      f('status', 'الحالة', 'Status', 'select', { enum: 'booking_status', list: true, badge: true, default: 'pending' }),
      f('customer_name', 'اسم العميل', 'Customer name', 'text', { required: true, list: true }),
      f('phone', 'الجوال', 'Phone', 'tel', { list: true }),
      f('city', 'المدينة', 'City', 'select', { enum: 'city', list: true }),
      f('location_url', 'رابط الموقع (قوقل ماب)', 'Location (Google Maps)', 'url'),
      f('services', 'الخدمات', 'Services', 'multiselect', { enum: 'service', list: true }),
      f('other_service', 'خدمة أخرى', 'Other service'),
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('time', 'الوقت', 'Time', 'time', { list: true }),
      f('assigned_workers', 'العمال المكلفون', 'Assigned workers'),
      f('lead_id', 'رقم طلب الموقع', 'Lead ref', 'text', { readonly: true }),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  projects: {
    perm: 'projects', icon: 'FolderKanban', label: PERMISSIONS.projects, title: 'name', sub: ['customer_name', 'delivery_date'], sort: 'start_date',
    fields: [
      f('name', 'اسم المشروع', 'Project name', 'text', { required: true, list: true }),
      f('customer_name', 'العميل', 'Customer', 'text', { list: true }),
      f('status', 'الحالة', 'Status', 'select', { enum: 'project_status', list: true, badge: true, default: 'active' }),
      f('start_date', 'تاريخ البداية', 'Start date', 'date'),
      f('delivery_date', 'تاريخ التسليم', 'Delivery date', 'date', { list: true }),
      f('team', 'الفريق المسؤول', 'Team'),
      f('contract_value', 'قيمة العقد', 'Contract value', 'money', { list: true }),
      f('paid_amount', 'الدفعات المستلمة', 'Paid', 'money', { list: true }),
      f('completed', 'المنجز', 'Completed', 'textarea'),
      f('remaining', 'المتبقي', 'Remaining', 'textarea'),
      f('missing', 'النواقص', 'Missing items', 'textarea'),
      f('warranty_notes', 'ملاحظات الضمان الذهبي', 'Golden guarantee notes', 'textarea'),
    ],
  },
  documents: {
    perm: 'documents', icon: 'FileText', label: PERMISSIONS.documents, title: 'customer_name', sub: ['doc_number', 'date'], sort: 'date', printable: true,
    fields: [
      f('doc_number', 'رقم المستند', 'Document no.', 'text', { readonly: true, list: true }),
      f('type', 'نوع المستند', 'Type', 'select', { enum: 'doc_type', required: true, list: true, badge: true, default: 'invoice' }),
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('customer_name', 'اسم العميل', 'Customer name', 'text', { required: true, list: true }),
      f('customer_phone', 'جوال العميل', 'Customer phone', 'tel'),
      f('services', 'الخدمات', 'Services', 'multiselect', { enum: 'service' }),
      f('custom_service', 'خدمة مخصصة', 'Custom service'),
      f('scope', 'نطاق العمل', 'Scope of work', 'textarea'),
      f('price', 'السعر (ر.س)', 'Price (SAR)', 'money', { required: true, list: true }),
      f('duration', 'مدة التنفيذ', 'Duration'),
      f('paid_amount', 'المبلغ المستلم', 'Amount received', 'money'),
      f('payment_method', 'طريقة الدفع', 'Payment method', 'select', { enum: 'payment_method' }),
      f('terms', 'شروط الخدمة', 'Terms', 'textarea'),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
      f('quote_status', 'حالة العرض', 'Quote status', 'select', { enum: 'quote_status', showIf: ['type', 'quote'] }),
      f('converted_from', 'محوّل من عرض', 'From quote', 'text', { readonly: true }),
      f('converted_to', 'حُوّل إلى فاتورة', 'To invoice', 'text', { readonly: true }),
      f('city', 'المدينة', 'City', 'select', { enum: 'city' }),
      f('property_type', 'نوع العقار', 'Property type'),
      f('project_name', 'اسم المشروع', 'Project name', 'text', { showIf: ['type', 'contract'] }),
      f('start_date', 'تاريخ البداية', 'Start date', 'date', { showIf: ['type', 'contract'] }),
      f('end_date', 'تاريخ النهاية', 'End date', 'date', { showIf: ['type', 'contract'] }),
      f('language', 'لغة المستند', 'Document language', 'select', { enum: 'language', default: 'ar' }),
    ],
  },
  revenue: {
    perm: 'finance', icon: 'TrendingUp', label: { ar: 'الإيرادات', en: 'Revenue' }, title: 'customer_name', sub: ['date', 'method'], sort: 'date',
    fields: [
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('customer_name', 'اسم العميل', 'Customer', 'text', { list: true }),
      f('project', 'المشروع', 'Project'),
      f('method', 'طريقة الدفع', 'Method', 'select', { enum: 'payment_method', list: true }),
      f('amount', 'المبلغ', 'Amount', 'money', { required: true, list: true, total: true }),
      f('doc_number', 'رقم المستند', 'Document no.'),
      f('source_doc_id', 'المستند المرتبط', 'Linked document', 'text', { readonly: true }),
      f('notes', 'ملاحظات', 'Notes', 'textarea'),
    ],
  },
  expenses: {
    perm: 'finance', icon: 'TrendingDown', label: { ar: 'المصروفات', en: 'Expenses' }, title: 'notes', sub: ['date', 'category'], sort: 'date',
    fields: [
      f('date', 'التاريخ', 'Date', 'date', { required: true, list: true }),
      f('category', 'التصنيف', 'Category', 'select', { enum: 'expense_category', list: true }),
      f('amount', 'المبلغ', 'Amount', 'money', { required: true, list: true, total: true }),
      f('method', 'طريقة الدفع', 'Method', 'select', { enum: 'payment_method' }),
      f('notes', 'البيان', 'Description', 'textarea', { list: true }),
    ],
  },
  workers: {
    perm: 'workers', icon: 'HardHat', label: PERMISSIONS.workers, title: 'name', sub: ['role', 'phone'], sort: 'name',
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
    perm: 'tasks', icon: 'ListChecks', label: PERMISSIONS.tasks, title: 'title', sub: ['assigned_worker', 'due_date'], sort: 'due_date',
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
  `${Number(n || 0).toLocaleString(lang === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { maximumFractionDigits: 2 })} ${lang === 'ar' ? 'ر.س' : 'SAR'}`;

export const enumLabel = (enumName, code, lang) => ENUMS[enumName]?.[code]?.[lang] ?? code ?? '';

import { createContext, useContext } from 'react';

export type Lang = 'ar' | 'en';

const STRINGS = {
  app_name: { ar: 'نظام كلين سنس', en: 'Clean Sense System' },
  login: { ar: 'تسجيل الدخول', en: 'Sign in' },
  username: { ar: 'اسم المستخدم', en: 'Username' },
  password: { ar: 'كلمة المرور', en: 'Password' },
  logout: { ar: 'خروج', en: 'Sign out' },
  invalid_credentials: { ar: 'اسم المستخدم أو كلمة المرور غير صحيحة', en: 'Wrong username or password' },
  too_many_attempts: { ar: 'محاولات كثيرة. حاول بعد 15 دقيقة', en: 'Too many attempts. Try again in 15 minutes' },
  change_password: { ar: 'تغيير كلمة المرور', en: 'Change password' },
  must_change: { ar: 'لأمان حسابك، اختر كلمة مرور جديدة قبل المتابعة.', en: 'For your security, choose a new password before continuing.' },
  current_password: { ar: 'كلمة المرور الحالية', en: 'Current password' },
  new_password: { ar: 'كلمة المرور الجديدة', en: 'New password' },
  password_rule: { ar: '8 خانات على الأقل، فيها حروف وأرقام', en: 'At least 8 characters with letters and numbers' },
  wrong_password: { ar: 'كلمة المرور الحالية غير صحيحة', en: 'Current password is wrong' },
  password_short: { ar: 'كلمة المرور قصيرة', en: 'Password is too short' },
  password_weak: { ar: 'لازم تحتوي حروف وأرقام', en: 'Use both letters and numbers' },
  save: { ar: 'حفظ', en: 'Save' },
  cancel: { ar: 'إلغاء', en: 'Cancel' },
  add: { ar: 'إضافة', en: 'Add' },
  edit: { ar: 'تعديل', en: 'Edit' },
  delete: { ar: 'حذف', en: 'Delete' },
  confirm_delete: { ar: 'متأكد من الحذف؟ السجل يبقى محفوظ في الشيت كمحذوف.', en: 'Delete this record? It stays in the sheet marked as deleted.' },
  search: { ar: 'بحث…', en: 'Search…' },
  empty: { ar: 'لا توجد سجلات بعد', en: 'No records yet' },
  loading: { ar: 'جاري التحميل…', en: 'Loading…' },
  saved: { ar: 'تم الحفظ', en: 'Saved' },
  error: { ar: 'صار خطأ، حاول مرة ثانية', en: 'Something went wrong, try again' },
  required: { ar: 'مطلوب', en: 'Required' },
  total: { ar: 'المجموع', en: 'Total' },
  all: { ar: 'الكل', en: 'All' },
  more: { ar: 'المزيد', en: 'More' },
  print: { ar: 'طباعة / PDF', en: 'Print / PDF' },
  whatsapp: { ar: 'واتساب', en: 'WhatsApp' },
  call: { ar: 'اتصال', en: 'Call' },
  convert_booking: { ar: 'تحويل إلى حجز', en: 'Convert to booking' },
  converted: { ar: 'تم إنشاء الحجز', en: 'Booking created' },
  // Home
  hello: { ar: 'هلا', en: 'Hi' },
  bookings_today: { ar: 'حجوزات اليوم', en: "Today's bookings" },
  bookings_upcoming: { ar: 'حجوزات قادمة', en: 'Upcoming bookings' },
  bookings_pending: { ar: 'بانتظار التأكيد', en: 'Awaiting confirmation' },
  leads_new: { ar: 'طلبات جديدة من الموقع', en: 'New website leads' },
  revenue_month: { ar: 'إيرادات الشهر', en: 'Revenue this month' },
  expenses_month: { ar: 'مصروفات الشهر', en: 'Expenses this month' },
  net_month: { ar: 'صافي الشهر', en: 'Net this month' },
  projects_active: { ar: 'مشاريع قيد التنفيذ', en: 'Active projects' },
  tasks_open: { ar: 'مهام مفتوحة', en: 'Open tasks' },
  today_schedule: { ar: 'جدول اليوم', en: "Today's schedule" },
  nothing_today: { ar: 'ما فيه حجوزات اليوم', en: 'No bookings today' },
  // Finance
  finance: { ar: 'المالية', en: 'Finance' },
  revenue: { ar: 'الإيرادات', en: 'Revenue' },
  expenses: { ar: 'المصروفات', en: 'Expenses' },
  month: { ar: 'الشهر', en: 'Month' },
  // Users
  users: { ar: 'المستخدمون', en: 'Users' },
  name: { ar: 'الاسم', en: 'Name' },
  role: { ar: 'الدور', en: 'Role' },
  job_title: { ar: 'المسمى الوظيفي', en: 'Job title' },
  language: { ar: 'اللغة', en: 'Language' },
  active: { ar: 'مفعّل', en: 'Active' },
  inactive: { ar: 'موقوف', en: 'Disabled' },
  activate: { ar: 'تفعيل', en: 'Enable' },
  deactivate: { ar: 'إيقاف', en: 'Disable' },
  reset_password: { ar: 'كلمة مرور مؤقتة جديدة', en: 'New temporary password' },
  temp_password: { ar: 'كلمة المرور المؤقتة (تظهر مرة وحدة، أرسلها للموظف بنفسك):', en: 'Temporary password (shown once, send it to the employee yourself):' },
  username_rule: { ar: 'حروف إنجليزية صغيرة أو أرقام، 3 خانات أو أكثر', en: 'Lowercase English letters or digits, 3+ characters' },
  username_taken: { ar: 'اسم المستخدم مستخدم', en: 'Username already taken' },
  no_login: { ar: 'بدون دخول', en: 'No login yet' },
  set_login: { ar: 'إنشاء دخول', en: 'Create login' },
  // Documents
  doc_customer: { ar: 'العميل', en: 'Customer' },
  doc_date: { ar: 'التاريخ', en: 'Date' },
  doc_amount: { ar: 'المبلغ الإجمالي', en: 'Total amount' },
  doc_paid: { ar: 'المبلغ المستلم', en: 'Amount received' },
  doc_remaining: { ar: 'المتبقي', en: 'Balance due' },
  doc_no_vat: { ar: 'المبالغ غير خاضعة لضريبة القيمة المضافة (المنشأة غير مسجلة).', en: 'Amounts are not subject to VAT (the business is not VAT-registered).' },
  doc_guarantee: { ar: 'الضمان الذهبي', en: 'Golden guarantee' },
  doc_unified: { ar: 'الرقم الوطني الموحد', en: 'Unified number' },
  back: { ar: 'رجوع', en: 'Back' },
  demo_banner: { ar: 'نسخة عرض ببيانات تجريبية — التعديلات ما تنحفظ', en: 'Demo with sample data — changes are not saved' },
  sar: { ar: 'ر.س', en: 'SAR' },
} as const;

export type Key = keyof typeof STRINGS;

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'ar', setLang: () => {} });

export function useT() {
  const { lang } = useContext(LangContext);
  return (k: Key) => STRINGS[k][lang];
}

export const pick = (l: { ar: string; en: string } | undefined, lang: Lang) => (l ? l[lang] : '');

export function applyDir(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
}

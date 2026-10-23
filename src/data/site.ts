// Single source of truth for business details. Edit here, not in components.

export const SITE = {
  url: 'https://cleansense.co',
  name: { ar: 'كلين سنس', en: 'Clean Sense' },
  slogan: { ar: 'نظافة تحسّها', en: 'Clean You Can Feel' },
  // International format without "+" (used by wa.me) and a display format.
  whatsapp: '966537717716',
  phone: '+966537717716',
  phoneDisplay: '053 771 7716',
  email: 'info@cleansense.co',
  instagram: 'https://www.instagram.com/Clean_sense',
  instagramHandle: '@Clean_sense',
  tiktok: 'https://www.tiktok.com/@Cleansense25',
  tiktokHandle: '@Cleansense25',
  // Working hours (approved): Saturday–Thursday 8 am – 10 pm; Friday on request.
  hours: { ar: 'السبت – الخميس: 8 صباحاً – 10 مساءً · الجمعة حسب الطلب', en: 'Saturday – Thursday: 8 am – 10 pm · Friday on request' },
  openingHours: { days: ['Saturday', 'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday'], opens: '08:00', closes: '22:00' },
  legalName: { ar: 'مؤسسة كلين سنس', en: 'Clean Sense Est.' },
  unifiedNumber: '7049749042',
  region: { ar: 'المنطقة الشرقية', en: 'Eastern Province' },
  // Cities currently served. Add more here and they appear everywhere.
  // primary: main service area; the others are served too.
  cities: [
    { id: 'khobar', ar: 'الخبر', en: 'Al Khobar', primary: true },
    { id: 'dammam', ar: 'الدمام', en: 'Dammam', primary: true },
    { id: 'dhahran', ar: 'الظهران', en: 'Dhahran', primary: true },
    { id: 'jubail', ar: 'الجبيل', en: 'Jubail', primary: false },
    { id: 'ras_tanura', ar: 'رأس تنورة', en: 'Ras Tanura', primary: false },
    { id: 'qatif', ar: 'القطيف', en: 'Qatif', primary: false },
  ],
  // New internal system: booking requests are also saved there as leads.
  // Set PUBLIC_LEADS_API at build time (e.g. https://<system-host>/api/public/leads); empty = WhatsApp only.
  leadsApi: (import.meta.env.PUBLIC_LEADS_API as string | undefined) ?? '',
} as const;

// Website service slug → service code in the internal system (dashboard/shared/model.js ENUMS.service).
// The exact website service name is always sent in the lead details too.
export const LEAD_SERVICE_CODES: Record<string, string> = {
  'deep-cleaning': 'deep_cleaning',
  'general-cleaning': 'villa_apartment',
  'post-construction-cleaning': 'post_construction',
  'sofa-upholstery-cleaning': 'upholstery',
  'carpet-moquette-cleaning': 'carpet',
  'kitchen-deep-cleaning': 'deep_cleaning',
  'bathroom-deep-cleaning': 'deep_cleaning',
  'glass-cleaning': 'other',
  'ac-cleaning': 'ac_cleaning',
  'water-tank-cleaning': 'other',
  'exterior-cleaning': 'facade',
  'residential-building-cleaning': 'commercial',
  'building-operation-maintenance': 'facility_ops',
};

// Headline facts shown in the trust bar. Only verifiable facts: no client counts or
// percentages until the owners approve real numbers.
export const STATS = [
  { value: '24h', ar: 'الضمان الذهبي بعد التسليم', en: 'Golden Guarantee after handover' },
  { value: '6', ar: 'مدن في الشرقية', en: 'Cities in the Eastern Province' },
  { value: '8–10', ar: 'من 8 ص إلى 10 م', en: '8 am to 10 pm' },
  { value: '0%', ar: 'بدون ضريبة مضافة', en: 'No VAT added' },
] as const;

// Estimate calculator — same numbers and formula as the previous live site.
export const PRICING = {
  base: {
    apartment: { deep: 500, 'post-construction': 800 },
    villa: { deep: 1200, 'post-construction': 1800 },
  },
  perExtraRoom: 50, // each room above 2
  perExtraBath: 75, // each bathroom above 1
  furnishedFactor: 0.2, // +20% when furnished
  addons: { sofa: 150, carpet: 200, windows: 100, outdoor: 300 },
} as const;

export type PricedService = keyof typeof PRICING.base.apartment;
export type PricedProperty = keyof typeof PRICING.base;
export type Addon = keyof typeof PRICING.addons;

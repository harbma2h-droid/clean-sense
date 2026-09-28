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
  instagram: 'https://www.instagram.com/clean_sense',
  tiktok: 'https://www.tiktok.com/@clean_sense',
  region: { ar: 'المنطقة الشرقية', en: 'Eastern Province' },
  // Cities currently served. Add more here and they appear everywhere.
  cities: [
    { id: 'khobar', ar: 'الخبر', en: 'Al Khobar' },
    { id: 'dammam', ar: 'الدمام', en: 'Dammam' },
    { id: 'jubail', ar: 'الجبيل', en: 'Jubail' },
  ],
} as const;

// Headline numbers shown in the trust bar. Keep these truthful —
// update them as the business grows.
export const STATS = [
  { value: '+500', ar: 'عميل خدمناهم', en: 'Clients served' },
  { value: '12', ar: 'خدمة متخصصة', en: 'Specialised services' },
  { value: '3', ar: 'مدن في الشرقية', en: 'Cities covered' },
  { value: '100%', ar: 'ضمان إعادة العمل', en: 'Re-clean guarantee' },
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

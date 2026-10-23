import { SITE } from '../data/site';
import { SERVICES, type Lang, type Service } from '../data/services';
import { homePath, servicePath } from '../i18n/ui';

const abs = (p: string) => new URL(p, SITE.url).href;
export const BUSINESS_ID = `${SITE.url}/#business`;

export function businessSchema(lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': ['LocalBusiness', 'HomeAndConstructionBusiness'],
    '@id': BUSINESS_ID,
    name: SITE.name[lang],
    alternateName: SITE.name[lang === 'ar' ? 'en' : 'ar'],
    slogan: SITE.slogan.en,
    url: abs(homePath(lang)),
    logo: abs('/brand/logo-512.png'),
    image: abs(lang === 'ar' ? '/og-ar.png' : '/og-en.png'),
    telephone: SITE.phone,
    email: SITE.email,
    address: { '@type': 'PostalAddress', addressRegion: SITE.region[lang], addressCountry: 'SA' },
    areaServed: SITE.cities.map((c) => ({ '@type': 'City', name: c[lang] })),
    sameAs: [SITE.instagram, SITE.tiktok],
    legalName: SITE.legalName[lang],
    openingHoursSpecification: [{ '@type': 'OpeningHoursSpecification', dayOfWeek: SITE.openingHours.days, opens: SITE.openingHours.opens, closes: SITE.openingHours.closes }],
    contactPoint: {
      '@type': 'ContactPoint',
      telephone: SITE.phone,
      contactType: 'customer service',
      availableLanguage: ['Arabic', 'English'],
    },
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: lang === 'ar' ? 'خدمات التنظيف' : 'Cleaning services',
      itemListElement: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@type': 'Service', name: s[lang].name, url: abs(servicePath(lang, s.slug)) },
      })),
    },
  };
}

export function websiteSchema(lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE.name[lang],
    url: abs(homePath(lang)),
    inLanguage: lang === 'ar' ? 'ar-SA' : 'en',
    publisher: { '@id': BUSINESS_ID },
  };
}

export function faqSchema(items: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
}

export function serviceSchema(s: Service, lang: Lang) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Service',
    name: s[lang].name,
    description: s[lang].intro,
    serviceType: s[lang].name,
    url: abs(servicePath(lang, s.slug)),
    provider: { '@id': BUSINESS_ID, '@type': 'LocalBusiness', name: SITE.name[lang], telephone: SITE.phone },
    areaServed: SITE.cities.map((c) => ({ '@type': 'City', name: c[lang] })),
  };
}

export function breadcrumbSchema(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: abs(it.path) })),
  };
}

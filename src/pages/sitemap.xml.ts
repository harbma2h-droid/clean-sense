import type { APIRoute } from 'astro';
import { SITE } from '../data/site';
import { SERVICES } from '../data/services';
import { servicePath } from '../i18n/ui';

// Hand-rolled sitemap with hreflang alternates for each AR/EN pair.
export const GET: APIRoute = () => {
  const pairs = [
    { ar: '/', en: '/en/', priority: '1.0' },
    ...SERVICES.map((s) => ({ ar: servicePath('ar', s.slug), en: servicePath('en', s.slug), priority: '0.8' })),
  ];
  const abs = (p: string) => new URL(p, SITE.url).href;
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = pairs
    .flatMap((p) =>
      (['ar', 'en'] as const).map(
        (lang) => `  <url>
    <loc>${abs(p[lang])}</loc>
    <lastmod>${lastmod}</lastmod>
    <priority>${p.priority}</priority>
    <xhtml:link rel="alternate" hreflang="ar-SA" href="${abs(p.ar)}"/>
    <xhtml:link rel="alternate" hreflang="en" href="${abs(p.en)}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(p.ar)}"/>
  </url>`,
      ),
    )
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
  return new Response(xml, { headers: { 'Content-Type': 'application/xml' } });
};

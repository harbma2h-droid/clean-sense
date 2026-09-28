# Clean Sense | كلين سنس — website

Official website for Clean Sense, professional cleaning and building services in
the Eastern Province of Saudi Arabia. **https://cleansense.co**

Static bilingual site (Arabic default at `/`, English at `/en/`) built with
[Astro](https://astro.build). Output is plain HTML/CSS with a few KB of JS, so
it runs on any static host (currently Hostinger).

## Run locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # type-check + build to dist/
npm run preview    # serve the built site
```

## Where to edit things

| What | File |
|---|---|
| Phone, WhatsApp, email, social links, cities, headline stats | `src/data/site.ts` |
| Calculator prices (same formula as the old site) | `src/data/site.ts` → `PRICING` |
| The 12 services (AR/EN names, descriptions, what's included, FAQs) | `src/data/services.ts` |
| All other page text in both languages (hero, FAQ, reviews, buttons…) | `src/i18n/ui.ts` |
| Colours, fonts, spacing | `src/styles/global.css` |
| Photos | `src/assets/images/` (auto-optimised to WebP at build) |

Adding a city in `SITE.cities` updates the hero, booking form, footer, service
pages and structured data automatically.

## Pages

- `/` and `/en/` — homepage
- `/services/<slug>/` and `/en/services/<slug>/` — one landing page per service (24 pages)
- `/sitemap.xml`, `/robots.txt`, `/404.html`

## Deploy to Hostinger

1. `npm run build`
2. In hPanel → File Manager → `public_html`, delete the old files
   (`index.html`, `assets/`, `images/`, `logo.png`, `favicon.svg`, `opengraph.jpg`).
3. Upload **the contents of `dist/`** (including the hidden `.htaccess`) into `public_html`.
4. Submit `https://cleansense.co/sitemap.xml` in Google Search Console.

To roll back, upload the contents of `legacy-live-snapshot/` instead.

## Tracking

Every WhatsApp / call button fires `whatsapp_click` / `call_click` into
`dataLayer`, `gtag` and Meta Pixel (`Contact`) **if** those are installed —
add your GA4 / GTM / Pixel snippet to `src/layouts/Base.astro` to start
measuring conversions.

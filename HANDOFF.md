# Clean Sense — handoff (state on 2026-10-23)

Branch: `claude/clean-sense-website-redesign-6fhazs`. Nothing is deployed. The live site
(cleansense.co) and the old dashboard (dashboard.cleansense.co) are untouched.

## Owner decisions (approved)
- Partners / owners: **معاذ** and **عبدالرحمن** (both `owner` role in the new system).
- Opening balances on 2026-10-23: **bank 8,000 SAR, cash box 600 SAR** (record via Treasury → reconcile).
- IBAN: entered by the owner in Settings on launch day (never committed, never in chat).
- Approved logo: Drive folder "ملف الشعار المعتمد" (vector SVGs) — copies in
  `dashboard/web/src/assets/brand/` and `public/brand/`. The old site logo is wrong; do not use it.
- Brand: navy #0B1F41, golds #EAD57D #D1AD45 #A7780D, cream #F7F3E9; Cairo (AR) + Montserrat (EN).
- Golden guarantee text is fixed (see `src/i18n/ui.ts` / settings sheet). No VAT. No invented numbers,
  prices, reviews or guarantees. Building O&M is marketed as "expanding".
- Deploy only after the owners approve. Do not change the old system's data or hosting security settings
  without explicit approval.

## Where things are
| What | Where |
|---|---|
| Website (Astro, AR/EN) | repo root `src/` — preview: https://claude.ai/artifact/WjoN9CM1DR4GoVUL4b2XRp |
| New internal system (API + React PWA) | `dashboard/` — demo: https://claude.ai/artifact/8G9FvQ6swuTuaALqP5zaQv |
| Business rules / accounting | `dashboard/shared/services.js`, `dashboard/shared/finance.js` |
| Database | Google Sheet "Clean Sense — قاعدة بيانات النظام" (id `12nDsgLx8GVAJOc_lJ_s-HiR4B8mvEmbfC_Y0KUpFKZE`) in the private Drive folder |
| Legacy backup (PINs removed) | private Drive folder, `legacy-backup-2026-10-23-no-pins.json.gz` |
| Legacy reconciliation report | https://claude.ai/artifact/SFtNfJuzv5fXLmVsCustpi — script `system/migrate/reconcile.mjs` |
| Go-live checklist | `system/README.md` |
| Progress page for the owner | https://claude.ai/artifact/Q7hEvUGcKeN3KektE3b5WW |

## Commands
```
npm ci && npm run build                     # website → dist/
cd dashboard && npm ci && npm test          # 20 API tests
npm run build                               # system web app → dashboard/web/dist
npm run build:demo                          # single-file demo → dashboard/dist-demo/index.html
STORE=sheets SPREADSHEET_ID=... GOOGLE_SERVICE_ACCOUNT_JSON=... SESSION_SECRET=... npm start
```

## Next steps
1. Hostinger (needs the owner to log in in the browser): inventory the account — domains, DNS
   (Namecheap), SSL, email, the current dashboard app, Node.js support — and report before changing anything.
2. Replit: confirm the "Asset Manager" app is not the live system; leave untouched.
3. Google service account for the Sheet (owner shares the sheet with it); set env vars on the host.
4. Connect the website booking form to `POST /api/public/leads`.
5. Credit notes for partial corrections of issued invoices.
6. Go-live (after approval): follow `system/README.md` (upgrade legacy data, opening balances,
   review 25 unverified legacy invoices, turn off OPEN_ACCESS, create users).
7. Later: close public sharing of the main Drive folder (owner postponed it).

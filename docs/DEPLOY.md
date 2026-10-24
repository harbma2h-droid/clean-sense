# Deploying the new system to Hostinger

**Status 2026-10-24:**
- Phase A is done: `https://system.cleansense.co` runs on MySQL.
- The one-time import from the Sheet passed (`IMPORT OK`, all row counts and totals match), and the owner account `moath` was created.
- **Data:**
  - The legacy upgrade ran with approval: 41 customers, 53 linked documents, 9 payments, 25 invoices marked "unverified".
  - Opening balances recorded: bank 8,000, cash 600.
  - The ledger balances.
- **Daily backups:** in `clean-sense-backups/` beside the app. The default needs no setting. One file per day, newest 30 kept.
- **Sheets view copy:**
  - The sheet "Clean Sense — عرض البيانات (نسخة للقراءة فقط)" belongs to info@cleansense.co and is shared with the service account.
  - It refreshes every 15 minutes, and owners can refresh it now with `POST /api/admin/mirror`.
  - Its ID is in `clean-sense-config/app.json`.
- **Config files:**
  - `clean-sense-config/system.env` holds secrets. The owner uploads it.
  - `clean-sense-config/app.json` holds non-secret settings, which only fill gaps.
  - hPanel's variables page is not used: new keys added there never reached the app.
- The old dashboard is untouched.
- **Phase C (website) done 2026-10-24, with the owner's approval:**
  - The previous site was saved first: an HTTP copy plus a zip of the whole `public_html`.
  - The new site was uploaded into `public_html`. Each built file was written to its path through File Browser's API, overwriting old files with the same name.
  - Checked: AR and EN pages and service pages return 200, an unknown page returns 404, and http and www redirect to `https://cleansense.co/`.
  - The booking form's API call from `cleansense.co` reached the system: test lead `CS-2610-0001` was created, then deleted.
  - `public_html/clean-sense-hostinger.zip` (an old package anyone could download) was moved out of public reach to `archive-2026-10-24/`.
  - `public_html/dashboard/` was **not** moved: it is the folder `dashboard.cleansense.co` runs from, and staff still use the old dashboard.
  - The system now sends `X-Robots-Tag: noindex, nofollow`, so search engines leave the staff system out.

Plan prepared on 2026-10-23. Each phase started only with the owner's approval.
Secrets (passwords, keys) are typed by the owner directly into Hostinger. They never go into chat, files or git.

## Principles

- **The live site and the old dashboard stay untouched** until the owners say the new system is ready.
- **One-way, checked data move:** the import runs on the server into the empty MySQL database. It runs in one transaction and compares totals; on any difference it keeps nothing and stops.
- **Easy rollback:** stop the new web app. The old dashboard and the Sheet are unchanged, so nothing has to be put back.

## Phase A — the new system at its own address (`system.cleansense.co`)

| # | Who | Step |
|---|---|---|
| A1 | Claude | Build the package (`dashboard/` code + built web UI, no tests). Tested standalone and in a full local rehearsal with a copy of the real data. |
| A2 | Claude, in hPanel | Create a new Node.js web app for `system.cleansense.co`: Node 22, upload the package zip, start command `npm start`. |
| A3 | Owner, in Namecheap | Add the DNS record that hPanel asks for, for `system`. DNS is managed at Namecheap, not at Hostinger. |
| A4 | Claude | Create a new Google Sheet for the view copy, owned by the company, shared with the service account as editor. |
| A5 | Claude + owner | Set the web app's environment variables. The table below lists them; ⚠ marks the ones the owner types. |
| A6 | — | First start. The log must show `IMPORT OK`, `Owner account created` and `store: mysql`. |
| A7 | Owner | Sign in at `https://system.cleansense.co` and choose a new password (forced). Check customers, documents and expenses against the old system. |
| A8 | Claude | Remove `IMPORT_FROM` and `OWNER_PASSWORD`, restart, and check the view copy and the first backup. |

| Variable | Value |
|---|---|
| `STORE` | `mysql` |
| `DATABASE_URL` ⚠ | `mysql://u579605167_cs_system:<password>@127.0.0.1:3306/u579605167_cs_system` |
| `SESSION_SECRET` ⚠ | 48+ random characters (password generator) |
| `OWNER_USERNAME` / `OWNER_PASSWORD` ⚠ | first sign-in only, changed at first login |
| `IMPORT_FROM` | `sheets` (first start only) |
| `SPREADSHEET_ID` | the current database Sheet (read only during import) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` ⚠ | contents of the key file |
| `MIRROR_SPREADSHEET_ID` | the new view-copy Sheet from A4 |
| `BACKUP_DIR` | a folder outside the app folder (confirmed in hPanel's file manager at A2) |
| `NODE_ENV` | `production` |

## Phase B — running both systems side by side (about 1–2 weeks)

- Staff keep using the old dashboard. The owners try the new one with the imported data, and run the legacy upgrade and opening balances (`system/README.md`).
- **Where the old data lives (checked 2026-10-24):** the old dashboard's server only handles sign-in. All business data sits in each device's browser (localStorage of `dashboard.cleansense.co`), as its own settings page says.
  - The new system holds everything in the export of 2026-10-23.
  - Anything entered later, or only on another device, exists only on that device.
- **Cut-over day:**
  1. On every device that used the old dashboard: الإعدادات → نسخة احتياطية → «تصدير نسخة احتياطية». Put the files in `D:\CleanSense-Backup`.
  2. Claude converts each file and compares it by record id with the live system.
  3. Only new or changed records are added. The new system has its own work since the import (legacy upgrade, opening balances), so it is **not** emptied and re-imported.
  4. Only after that is `dashboard.cleansense.co` redirected to the new system. Redirecting earlier would hide the browser data that still has to be exported.
  5. Staff get logins: Users → «تفعيل الدخول» (imported staff have no username yet).
- **Subscriptions (hPanel → Billing):** auto-renew is on for Google Workspace (invoice 2027-01-31) and for hosting (2027-06-22).

## Phase C — website and addresses (separate approval)

1. Download a copy of the current `cleansense.co` files (Hostinger file manager / backups).
2. Build the new website with `PUBLIC_LEADS_API=https://system.cleansense.co/api/public/leads` and upload it.
3. Check the booking form end to end, with a test request that is then deleted.
4. Optionally point `dashboard.cleansense.co` to the new system and retire the old app.

## Hostinger quirks found on 2026-10-23 (read before every deploy)

- **Entry file must be `server/start.cjs`.** Hostinger's runner `require()`s the entry, and `server/index.js` is an ES module with top-level await, which `require()` cannot load.
- **Upload the zip from `node scripts/package-system.mjs`.** Its `build` script does nothing: Hostinger runs `npm run build`, and the UI build tools are dev-only. The UI ships prebuilt.
- **Always upload the zip again** ("تحميل ملفات جديدة"). "Use previous files" and the env page's automatic redeploy fail with `package.json file not found`.
- **Secrets live in a file, not in hPanel's variables:** `clean-sense-config/system.env` in the site folder.
  - In File Manager it sits at the top level, next to `hbuilds/` and `public_html/`.
  - It is outside `public_html`, so it is never served, and it survives redeploys.
  - The app loads it first and it wins over hPanel's variables.
  - Why: hPanel kept restoring an old `DATABASE_URL` from a hidden copy, even after the value was edited, deleted or re-imported.
  - To change a secret: upload a new `system.env` over the old one, then restart or redeploy.
- On start the log shows `NOTICE settings loaded from …` and `NOTICE DB target … password_length=… password_fp=…`. This is a short fingerprint, never the password.
  - Compare it locally to find which copy of a password is used.
- **Logs:** the runtime log page shows stderr only, so milestones are printed as `NOTICE …` on stderr.
- **DNS:** add `A system → 46.202.156.107` at Namecheap. **Never** switch the nameservers as hPanel suggests: that would move email (Google Workspace) and the main site.
- **DB password:** letters and digits only (it goes inside `DATABASE_URL`), with at least one capital letter (Hostinger rule). Change it in hPanel and in `DATABASE_URL` from the same clipboard value.

## Cost

- **Nothing extra:** web app 2 of 5 and MySQL are included in the Business plan; Google Sheets API is free at this volume.

## Rollback

- **Phase A/B:** stop or delete the new web app. Nothing else changed.
- **Phase C:** re-upload the saved site files.

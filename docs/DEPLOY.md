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
- The old dashboard and the website are untouched.

Plan prepared on 2026-10-23. Nothing below has been done yet: every phase starts only with the owner's approval.
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
- **Cut-over day:**
  1. Stop entering data in the old dashboard.
  2. Export a fresh backup from it.
  3. Claude converts the backup and re-imports it into an emptied new database. Same checks: every total must match.
  4. The owners switch.

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

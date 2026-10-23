# Deploying the new system to Hostinger

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

## Cost

- **Nothing extra:** web app 2 of 5 and MySQL are included in the Business plan; Google Sheets API is free at this volume.

## Rollback

- **Phase A/B:** stop or delete the new web app. Nothing else changed.
- **Phase C:** re-upload the saved site files.

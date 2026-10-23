# Clean Sense — technical architecture and decisions

Status on 2026-10-23. This repository is public: no secrets, IP addresses or customer data here.
Infrastructure details live in `private/` on the owner's machine (git-ignored).

## Parts

| Part | Tech | Where it runs |
|---|---|---|
| Website `cleansense.co` | Astro (static), AR/EN | Hostinger Business, PHP/HTML site |
| Internal system (API + PWA) | Node 22, Express, React | Hostinger Business, Node.js web app (planned; old dashboard stays until cutover) |
| Business rules and accounting | `dashboard/shared/services.js`, `finance.js` | inside the API — one place for all rules |
| Data | `Store` (`dashboard/server/store.js`), swappable backend | today: Google Sheets or a local file |
| DNS | Namecheap (Hostinger's DNS zone is **not** in use) | — |
| Email | Google Workspace | — |

## Data flow

- **Website booking form**
  1. The form sends `POST /api/public/leads`. It is off until `PUBLIC_LEADS_API` is set at build time.
  2. WhatsApp opens right away and never waits for the API.
- **Staff**
  1. Staff use the PWA, which calls `/api/*`.
  2. Every change goes through `services.js`: validation, permissions, audit log, ledger.
- **Reading data:** reports, Power BI and Google Sheets read data. They never write money records directly.

## Decision 1 — main database: MySQL on Hostinger (approved by the owner on 2026-10-23)

**Status:** the code is implemented and tested locally on MariaDB 11.4 (same test suite as the file store). Nothing is deployed and no real data has been moved.

**Why move off Google Sheets as the main store**
- **Lost edits:** the API keeps the Sheet in memory and reloads only every 5 minutes. A hand edit in the Sheet and an app edit at the same time can overwrite each other.
- **No transactions:** an invoice and its ledger entries can't be saved as one unit.
- **Rate limits:** Google Sheets API limits are around 60 writes per minute.
- **Weak protection:** anyone with edit access to the Sheet bypasses the permissions and the audit log.

**Why MySQL on Hostinger**
- Already included in the Business plan, so **no extra cost**. The account already has one database (`u579605167_clean_sense`) for the current site.
- Daily Hostinger backups, plus our own nightly export.
- Real transactions, constraints and indexes.
- Power BI and future apps (mobile, HR, WhatsApp automation) connect to the same API, or read-only to MySQL.

**How (no rebuild)**
- Add a `mysql` backend to `Store`, next to `file` and `sheets`. The API, `services.js`, the PWA and the tests stay as they are.
- `schema.json` remains the single definition of tables and columns.

**Google Sheets stays as the easy view**
- A one-way **mirror**: the API writes a fresh copy of each table to the Sheet on a schedule and on demand, for viewing, filtering, sharing and Power BI.
- Edits happen in the dashboard, which keeps permissions, audit and accounting correct.
- If bulk editing of simple lists (services, prices) in Sheets is needed later, add a controlled "import from Sheet" action. Never a free two-way sync.

### What exists in code

| Piece | File | Notes |
|---|---|---|
| MySQL backend | `dashboard/server/mysql.js` | Creates and extends tables from `schema.json` and never drops a column.<br>Amounts are `DECIMAL(14,2)`.<br>Hidden `_row` key.<br>`utf8mb4` text. |
| Safer writes | `dashboard/server/store.js` | The cache changes only after the database write succeeds. |
| Sheets view copy | `dashboard/server/mirror.js` | `MIRROR_SPREADSHEET_ID`, refreshed every `MIRROR_MINUTES` (15 by default).<br>Owners can also refresh it now with `POST /api/admin/mirror`.<br>Password hashes and deleted rows are never copied.<br>It refuses to target the main data Sheet. |
| Daily backups | `dashboard/server/backup.js` | `BACKUP_DIR`: gzip JSON of every table, newest 30 kept.<br>This is on top of Hostinger's own daily database backup. |
| Migration and restore | `system/migrate/to-mysql.mjs` | Source: `--from-sheets` (read-only) or `--from-backup <file>`. Use `--dry-run` to only check.<br>Saves a copy of the source first.<br>Imports into empty tables in one transaction.<br>Then checks the row count and amount totals of every table. |

Tests: `cd dashboard && npm test`. With `TEST_MYSQL_URL=mysql://…/cleansense_test` the same suite runs on MySQL. That database is wiped first, so never point it at real data.

### Switching to MySQL (needs owner approval at each ⚠️ step)

1. In hPanel → Databases, the owner creates a new database and user. The password is never shared in chat.
2. ⚠️ Run the migration dry run. Text found in amount columns is fixed in the Sheet first.
3. ⚠️ Run `to-mysql.mjs --from-sheets`. The report must say *All rows and amount totals match*.
4. ⚠️ Set these on the Hostinger web app, then restart:
   - `STORE=mysql`
   - `DATABASE_URL`
   - `BACKUP_DIR`
   - `MIRROR_SPREADSHEET_ID` (a **new** Sheet shared with the service account)
5. The old Sheet stays untouched as the pre-migration record.

## Decision 2 — Google Cloud

- Project `clean-sense-system` (organization cleansense.co).
- Service account `clean-sense-server` with no project roles. It has edit access to the database Sheet only.
- Used for the Sheets backend now, and for the Sheets mirror later.
- The key creation block is lifted for this project only.

## Security baseline

- Secrets only in Hostinger environment variables: `SESSION_SECRET`, `GOOGLE_SERVICE_ACCOUNT_JSON`, and the DB password later.
- `OPEN_ACCESS` must be off in production.
- Public endpoint `/api/public/leads` is protected by:
  - CORS allow-list (cleansense.co)
  - honeypot field
  - 5 requests per 10 minutes per IP
  - idempotency key
- Soft delete everywhere, and an append-only audit log.

## Before go-live (owner approval)

1. Approve Decision 1.
2. Deploy the API as a new Hostinger web app. Keep the old dashboard untouched until cutover.
3. Run the legacy upgrade on a copy, then on the real data (`system/README.md`).
4. Set `PUBLIC_LEADS_API` and rebuild and upload the website.

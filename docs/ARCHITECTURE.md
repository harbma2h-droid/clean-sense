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

## Decision 1 — main database: MySQL on Hostinger (recommended, needs owner approval)

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

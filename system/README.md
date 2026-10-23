# Clean Sense internal system — data layer & migration

- `schema.json` — data model stored in Google Sheets (one tab per table).
  Row 1 = stable keys used by code, row 2 = AR/EN labels, data from row 3.
- `tabs.json` — tab titles and sheet IDs in the live spreadsheet.
- `migrate/legacy-to-sheets.mjs` — converts the current dashboard's
  "تصدير نسخة احتياطية" JSON into sheet rows, with a reconciliation report
  (record counts and money totals before/after). Staff PINs are never copied.
- The security hotfix for the current dashboard is kept outside this public
  repository (private Drive folder) until it is deployed.

- `migrate/to-mysql.mjs` — copies the Sheet (read-only) or a backup file into an empty MySQL
  database and checks row counts and amount totals. MySQL is the approved main store
  (see `docs/ARCHITECTURE.md`); the steps below apply to the data before it is copied.

## Go-live checklist for the new system (v2) — only after the owners approve

The new system never edits original values. These steps only add columns, tabs and rows.

1. **Back up the spreadsheet** (File → Make a copy) and keep the copy in the private folder.
2. **Start the server** with `STORE=sheets` once. Missing columns (row 1/2) and the new tabs
   `الدفعات والتحصيل | payments` and `الخزينة والشركاء | treasury` are created automatically.
3. **Run the legacy upgrade once** (owner account): links documents/bookings to customers
   (grouped by phone), sets the new status columns, copies the old revenue log and the two paid
   receipts into payments, and marks legacy invoices with an open balance as *unverified*.
   Dry run on a copy of the real data (2026-10-23): 41 customers, 53 documents linked,
   9 payments (8,715 SAR), 25 unverified invoices (32,990 SAR), originals unchanged, ledger balanced.
4. **Opening balances** as given by the owner on 2026-10-23: bank 8,000 SAR, cash box 600 SAR.
   Record them with Treasury → *Reconcile actual balance* dated 2026-10-23.
   Expected adjustments from the dry run: bank +22,873.81 (book −14,873.81), cash −190.30 (book 790.30).
   The difference is booked to *Opening balance adjustments* (equity), never to profit.
5. **Settings**: enter both partners' names, bank details (if they should appear on invoices),
   default terms and WhatsApp messages.
6. **Review unverified invoices** one by one: record the payment (with its real date and method)
   or confirm the amount is still due. Link the 7 unallocated legacy payments to their invoices.
7. Turn off `OPEN_ACCESS` and create the users (both owners as `owner`).

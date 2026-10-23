# Clean Sense internal system — data layer & migration

- `schema.json` — data model stored in Google Sheets (one tab per table).
  Row 1 = stable keys used by code, row 2 = AR/EN labels, data from row 3.
- `tabs.json` — tab titles and sheet IDs in the live spreadsheet.
- `migrate/legacy-to-sheets.mjs` — converts the current dashboard's
  "تصدير نسخة احتياطية" JSON into sheet rows, with a reconciliation report
  (record counts and money totals before/after). Staff PINs are never copied.
- The security hotfix for the current dashboard is kept outside this public
  repository (private Drive folder) until it is deployed.

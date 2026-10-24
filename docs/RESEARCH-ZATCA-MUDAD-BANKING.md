# ZATCA, Mudad/WPS and bank integration — findings and plan

Researched 2026-10-24. **Nothing here is legal or tax advice.** Each point marked ⚠ must be confirmed by the owner with ZATCA, the Ministry of Human Resources (HRSD) or the bank before anything is switched on.

## 1. ZATCA (VAT and e-invoicing)

### Where Clean Sense stands today
- **Not VAT-registered.** Every quote, invoice and receipt already prints "not subject to VAT (the business is not VAT-registered)".
  - So the system must not add VAT or call any document a "tax invoice" until registration is confirmed.
- **Revenue level:** the old system's documents total 265,840 SAR across 53 records (all years). Annual taxable revenue is the deciding figure and has not been confirmed. ⚠

### Rules that may apply
| Topic | Finding | Status |
|---|---|---|
| VAT registration | Mandatory above an annual revenue threshold; voluntary registration is possible above a lower one. Commonly cited figures: 375,000 SAR mandatory, 187,500 SAR voluntary. | ⚠ Not confirmed from zatca.gov.sa in this research. The owner or accountant confirms. |
| E-invoicing Phase 1 (generation) | Applies to **VAT-registered** taxpayers. | Applies only after registration. |
| E-invoicing Phase 2 (integration with Fatoora) | Rolled out in waves. Wave 24: VAT revenue above 375,000 SAR, deadline 30 June 2026. Wave 25 (announced July 2026): above 187,500 SAR in any year 2022–2025, deadline 1 Feb 2027. ZATCA notifies each targeted taxpayer at least six months ahead. | Only registered taxpayers who receive a ZATCA notice. ⚠ |

Sources: [KPMG — Wave 25](https://kpmg.com/us/en/taxnewsflash/news/2026/07/saudi-arabia-e-invoicing-mandatory-for-taxpayers-with-revenue-above-sar-187500.html), [VATupdate — Wave 25](https://www.vatupdate.com/2026/07/27/zatca-announces-wave-25-of-e-invoicing-threshold-halved-to-sar-187500-integration-deadline-1-february-2027/), [VATupdate — Wave 24](https://www.vatupdate.com/2026/07/09/zatca-phase-2-wave-24-integrate-by-30-june-2026/), [Qoyod — Phase 2 waves](https://www.qoyod.com/en/knowledge-base/e-invoicing/e-invoicing-phase-2-waves/).

### What the system already does well (kept)
- Sequential, never-reused numbers (INV-0001…).
- Issued invoices are locked. Corrections are void plus a reason, with every action in the audit log.
- Daily backups for record retention.

### Preparation plan, all switched **off** until registration
1. **Settings:** VAT number, a VAT on/off switch (default off) and the rate (15%).
2. **Documents:** per-line VAT, VAT totals and the buyer's VAT number (needed for B2B "tax invoices").
   - Issued documents keep their original numbers and figures.
3. **Credit and debit notes:** a corrective note linked to the original invoice, replacing "void" for issued invoices once registered.
4. **Phase 1 QR code:** TLV-encoded seller name, VAT number, timestamp, total and VAT. Turned on only with the switch.
5. **Phase 2 (Fatoora):** UBL 2.1 XML, cryptographic stamp, onboarding with a compliance CSID. This is a separate project.
   - Usually cheaper through a ZATCA-qualified provider than building it ourselves.
   - Decide only if ZATCA sends a wave notice.

## 2. Payroll, Mudad and the Wage Protection System (WPS)

### Findings
- Wage-protection files are now uploaded **only through Mudad's Compliance system**, and the upload window is 30 days (since 1 March 2025). Source: [Argaam](https://www.argaam.com/en/article/articledetail/id/1786868), [HRSD service page](https://www.hrsd.gov.sa/en/ministry-services/services/%D8%B1%D9%81%D8%B9-%D9%85%D9%84%D9%81-%D8%AD%D9%85%D8%A7%D9%8A%D8%A9-%D8%A7%D9%84%D8%A3%D8%AC%D9%88%D8%B1).
- Several banks produce the WPS file from their payroll service and can upload it to Mudad automatically. Examples: [ANB WPS API](https://developer.anb.com.sa/apis/api/WPS), [Al Rajhi payroll WPS](https://www.alrajhibank.com.sa/en/Business/Cash-Management/payroll/WPS).
- A non-official guide says every employer with one or more employees falls under WPS. ⚠ Confirm in Mudad.
- **No official public file layout was found.** The format depends on the bank or on Mudad's own template. ⚠

### Recommendation
- **No direct Mudad integration.** The official path is: salaries paid through the company's bank payroll service → the bank or the owner uploads the file to Mudad.
- The system's job is to produce **correct, auditable payroll figures** and an export in the bank's bulk-payroll template.
  - The bank's template is needed first: the owner names the bank and downloads the template from business online banking. ⚠
- The system must never be described as "Mudad compliant".

### Payroll module design (additive; needs approval before the database change)
- **`workers`** (exists): add IBAN, Iqama/ID number, basic salary, housing and transport allowances, and payment method.
  - IBAN and ID are sensitive: they are hidden from the Sheets copy, like passwords.
- **`salary_changes`** (new): worker, effective date, the new amounts and a reason. This gives the salary history.
- **`payroll_runs`** (new): month, status (draft → approved → paid), approved_by and paid_at. An approved run is locked.
- **`payroll_lines`** (new): run, worker, basic, allowances, overtime, deductions, advance recovery, net and payment reference.
- **`worker_advances`** (new): advances and debts, with recovery instalments linked to the payroll lines.
- **Accounting:**
  - Paying a run posts to "Wages" expense and to the bank or cash account through the existing journal, so profit and loss and the treasury stay correct.
  - Advances post to a receivable account, not to expense.
- **Reports:** monthly payroll register, employee statement (earned, paid, advances, balance) and the bank export file.

## 3. Bank account integration

### Findings
- SAMA's Open Banking framework went live with **account information services (AIS)** first; payment initiation comes later. Licensed AIS providers are growing (two licences in March 2026; Malaa in July 2026). Sources: [SAMA — Malaa licence](https://www.sama.gov.sa/en-US/MediaCenter/News/Pages/news-1161.aspx), [Open Banking Expo — framework](https://www.openbankingexpo.com/news/saudi-central-bank-publishes-open-banking-framework/), [Fiskil tracker](https://www.fiskil.com/open-finance-tracker/saudi-arabia).
- Read-only connection to a business account needs a contract with a licensed provider (for example Lean or Tarabut), a monthly fee and the owner's consent inside the bank's app. Prices are not public. ⚠

### Recommendation, in order
1. **Now, no cost:** bank statement import (CSV or Excel from the bank).
   - The system matches incoming transfers to open invoices by amount, date and the customer's name or reference.
   - It **suggests** matches, and the accountant confirms each one before a payment is recorded.
   - No credentials are stored.
2. **Later, if volume justifies it:** read-only AIS through a SAMA-licensed provider.
   - The statement import above gets automatic transaction feeds instead of manual uploads.
   - Needs the owner's approval of the provider, its cost and the consent.
3. **Never:** storing online-banking passwords, screen-scraping, or initiating payments from the system.

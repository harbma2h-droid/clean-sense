# Changelog

## 2026-10-24 17:13 — payroll, periods, menu (backup first, verified after)
- **Backup taken first:** `D:\CleanSense-Backup\cs_system-before-payroll-release-2026-10-24.sql` (16 tables).
- **Checked after deploy:** counts and totals unchanged (43 customers, 54 documents, 9 payments, 172 expenses, revenue 36,990, collected 8,715, cash 8,600, ledger balanced at 91,567.62).
  - The new screens and endpoints answer.
  - The Sheets copy refreshed with no error.
- **Final-review fixes:**
  - "Today" now follows Riyadh time; it used UTC, which was wrong from midnight to 3 am.
  - A partly recovered advance cannot be voided.
- **Payroll (مسير الرواتب):**
  - Monthly runs, auto-filled from active workers: salary, allowances, and days × daily rate for daily workers.
  - Overtime, bonus, deductions and advance recovery per worker.
  - Flow: approve → pay each line or all at once (cash, bank…). Undo a payment; void a run with a reason.
  - CSV export for the bank.
- **Advances and debts (السلف والمديونيات):**
  - Three kinds: an advance (cash to the worker), a charge (a cost recharged to the worker) and a repayment.
  - Monthly instalments are suggested in the next run.
  - Each worker has a statement: earned, paid, recovered, salary owed, debt.
- **Automatic accounting:**
  - Approving a run books wages (5070), recovers advances (1300 «سلف وذمم العمال») and records what is owed (2100 «رواتب مستحقة»).
  - Each payment reduces the cash box or bank.
  - Treasury, profit and loss, reports and the trial balance follow with no extra entry.
- **Period picker on the home dashboard and in reports:** this month, last month, last 3 or 6 months, this year, last year, last 12 months, or a custom range. Comparisons are with the period before, and the choice is remembered per device.
- **Three-line menu:**
  - Has «الرئيسية» at the top.
  - Scrolls when it is taller than the phone (its top items were cut off before).
- **Custom expense categories** that owners add in settings now keep their own name in reports, instead of falling under «مصاريف أخرى».
- **Workers** have new fields: allowances, ID/Iqama, bank and IBAN. IBAN and ID are never copied to the Sheets view.

## 2026-10-24 16:27 — approved navy logo on customer links (backup first, verified after)
- The customer document page shows the approved logo: gold on navy, with rounded corners.
- WhatsApp link previews use `og-logo.png`, a 600×600 image made from `logo-navy.svg`.
- Backup taken first: `D:\CleanSense-Backup\cs_system-before-logo-change-2026-10-24.sql`.
- Checked after deploy: data unchanged (43 customers, 54 documents, 9 payments, 172 expenses, revenue 36,990, ledger balanced), and the preview tags and image are served.

## 2026-10-24 16:06 — simpler customer messages (backup first, verified after)
- WhatsApp messages no longer show the document number or the system's name. `{link}` places the link inside the message.
- Customer links use `cleansense.co/d/<code>`. The main site's `.htaccess` redirects them to the system; the previous file is kept in `archive-2026-10-24/site.htaccess.before-d-links`.
- New links are 16 characters long.
- WhatsApp link previews show "كلين سنس | Clean Sense".
- Backup taken first: `D:\CleanSense-Backup\cs_system-before-message-change-2026-10-24.sql`.

## 2026-10-24 15:40 — released (backup first, verified after)
- **WhatsApp:** the customer's saved number is used automatically and goes straight to their chat, with a private document link in the message. Arabic-digit numbers are understood.
- **Customer document page:** `/d/<link>` gives a phone-friendly quote or invoice with a PDF download. The link can be reset and stops when the document is cancelled.
- **Calendar subscription:** bookings and open tasks with reminders, for Apple, Google and Outlook calendars.
- **Financial report PDF:** download or share.
- **Mobile:** fields are 16px on touch screens, so iPhone no longer zooms in.
- **Docs:** `PROJECT_STATUS.md` and `docs/RESEARCH-ZATCA-MUDAD-BANKING.md`.

## 2026-10-24
- New website published on cleansense.co; booking form connected to the system.
- Old dashboard retired: it redirects to the new system (reversible).
- "Enable sign-in" for staff imported without a username.
- Owner password reset through the private config folder (temporary password written to a file, never logged).
- Staff system sends `X-Robots-Tag: noindex`.

## 2026-10-23
- New system live on MySQL with a checked import from the Sheet, daily backups and a read-only Sheets copy.
- Financial dashboard on the home page.

# Changelog

## 2026-10-30 (2) — app phase 0 follow-up (not deployed)
- Architectural PDF (site plan, elevations and sections for types A, B and C) uploaded to the project's Drive folder. The folder now holds all the plans: 4 DWG files and 5 PDFs.
- Unit numbering follows the owner's rule on every floor.
- Report types and the sign-in page are worded in polite Saudi dialect.
- Notification wording is ready and tested (short, building first). Sending notifications comes in phase 1.
- The sign-in page was checked at iPhone (393 px) and Samsung (360 px) widths in the browser, not on real devices.
- Test environment rebuilt with the new numbering. 51 tests pass on both the file store and MySQL.

## 2026-10-30 — app phase 0: building management foundations (not deployed; test environment only)
- The owner approved the plan:
  - Stay on Hostinger.
  - The app goes on portal.cleansense.co.
  - Phone-only accounts sign in with a one-time WhatsApp link.
- New tables, added beside the existing ones; nothing changed or removed:
  - buildings, units, common areas, QR points
  - roles per building
  - report types
  - sign-in links
  - Four new columns on users: kind, customer_id, worker_id, login_version.
- New "إدارة المباني" section in the system: buildings, units and common areas. Staff need the new `buildings` permission. Owners have it automatically, and operations managers get it too.
- Type A template: one call creates a building with 26 units (001–604), 26 common areas and 3 QR points (lobby, lifts for TKE, fire systems and pumps for Rmad).
- 27 report types from the reference document, with automatic priority and time limits.
  - The "inside my unit" type leads to a paid service.
  - Bengali names are included; they still need a review.
- People per building:
  - Residents and the representative are linked to the customers table.
  - Field staff are linked to the workers table.
  - The representative approves residents.
  - Contractors' approved phone can be changed, which signs the old phone out.
- Backups: a weekly copy is kept for 12 weeks. It can also be copied to a Google Workspace shared drive (`DRIVE_BACKUP_FOLDER_ID`).
- Test environment on this PC: a separate MariaDB with fake data, plus seed and start scripts. See `system/staging/README.md`.
- Tested: 50 automated tests pass on both the file store and MySQL. The sign-in link was tried at phone size.

## 2026-10-25 (2) — website: service-page note, calculator furniture options (backup first, verified after)
- On the building service page, the "expanding" note no longer touches the title on phones. It is now a rounded box with space above it.
- Calculator:
  - "Unfurnished" switches off and clears the sofa and carpet/curtains add-ons.
  - A short hint explains that they come back when you choose "Furnished".
  - Windows and outdoor yard stay available.
- Backup taken first on the server: `/site-backup-before-2026-10-25-b`.
- Checked live:
  - The add-ons switch off and on correctly.
  - There is 20 px between the title and the note at phone width.
  - 28 pages, no broken links.

## 2026-10-25 — website cleansense.co: deep cleaning first, new look (backup first, verified after)
- Deep cleaning is featured right under the hero. Prices start at 800 SAR (apartment) and 1,500 SAR (villa), and the calculator opens on deep cleaning.
- The team photo is in the hero, and there is a new "Our team" section.
- The building service is renamed "إدارة وصيانة وتشغيل المباني" (cleaning included) and has its own block.
- There is a new navy preview image for shared links.
- The "no VAT" claim is removed.
- The Arabic logo text is no longer cut off at the bottom.
- Menu items get a gold highlight, and the menu marks the section you are in.
- HSTS has been added.
- Backup taken first on the server: `/site-backup-before-2026-10-25` (full copy of public_html).
- Checked after publishing:
  - 28 pages, no broken links.
  - New sections and prices are live.
  - The new preview image is served.
  - `/d/<code>` still redirects to the system.
  - The booking form's API accepts the site.

## 2026-10-24 18:27 — approved light look on every device (backup first, verified after)
- The system and its reports stay on the off-white background (#F7F3E9) even when the phone is in dark mode. That mode used to switch everything to navy.
- Backup taken first: `D:\CleanSense-Backup\cs_system-before-light-theme-2026-10-24.sql` (19 tables).
- Checked after deploy: data unchanged (44 customers, 55 documents, 9 payments, 172 expenses, ledger balanced).

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

# Clean Sense — project status

**Updated 2026-10-24.** Live: `cleansense.co` (website) and `system.cleansense.co` (internal system, MySQL on Hostinger). The old dashboard redirects to the new system.

## Release deployed 2026-10-24 15:40 (owner approved)
- **Backup taken first:** a full phpMyAdmin export, `D:\CleanSense-Backup\cs_system-before-release-2026-10-24.sql`, with all 16 tables. The daily backups also continue on the server.
- **Package:** `clean-sense-system-202610241208.zip`.
- **Verified after deploy:** every count and total equals the pre-deploy baseline.
  - 43 customers, 54 documents, 9 payments, 172 expenses.
  - Revenue 36,990, collected 8,715, ledger balanced at 91,567.62.
- The new features answer:
  - Customer number filled in automatically, link tokens hidden from staff screens.
  - Calendar button and report PDF.
  - Unknown document or calendar links return 404.
- The Sheets copy refreshed after the restart (340 rows).

## The release

| Area | Change | Tested |
|---|---|---|
| WhatsApp sending | The number comes from the customer's record. Saudi numbers are normalised, including Arabic digits (٠٥…). The main button opens the customer's chat directly, with no contact picking, and the message carries a private link to the document. | Automated tests, plus a phone-size check in a local copy |
| Customer document page | `system.cleansense.co/d/<link>` is a phone-first page showing a quote or invoice, with an A4 PDF download. It shows only printed fields. The link is unguessable, can be reset, and stops working when the document is cancelled. The first customer view is recorded. | Automated tests (fields, reset, cancel), PDF generated in 1.7 s |
| Calendar | "Connect calendar" on the home page subscribes iPhone, Google or Outlook to bookings and open tasks, with a reminder one hour before each booking. Edits and cancellations update the same event. | Automated tests (time zone, one event per booking, cancellation, permissions, line format) |
| Reports | The financial report exports to a branded A4 PDF and can be shared from the phone. | Generated locally |
| Mobile | Form fields are 16px on touch screens, so iPhone no longer zooms in when you tap a field. | Phone-size check of 19 system pages |

### Database changes in this release
- Additive columns only, which are added automatically on start:
  - `documents.share_token` and `documents.viewed_at`
  - `users.calendar_token`
- Nothing is removed or renamed.
- Both tokens are kept out of the Google Sheets copy.

### Rollback
- Redeploy the previous package, `clean-sense-system-202610240820.zip`.
- The new columns stay empty and do no harm.

## Mobile audit (2026-10-24, browser emulation at 375×812, **not real devices**)
- **Website:** home (AR/EN), service pages and the 404 page. No sideways scrolling, and booking-form fields are 16px or larger.
- **System:** 19 screens. No sideways scrolling; wide tables scroll inside their own box. Field size fixed (see above).
- **Not done:** testing on real iPhone and Android devices. The owner and staff should try the release on their phones before it is approved.

## Planned next (needs decisions or approval)

| Priority | Item | What is needed |
|---|---|---|
| 1 | Payroll: salaries, history, monthly register, advances and deductions, employee statement, bank export | Approve the database design in `docs/RESEARCH-ZATCA-MUDAD-BANKING.md` §2, and name the payroll bank |
| 2 | Bank statement import with suggested invoice matches | Owner sends one sample statement export (CSV or Excel) |
| 3 | PDF for customer statements and the employee statement | Comes with item 1 |
| 4 | VAT-ready fields, credit notes, Phase 1 QR (switched off) | Confirm annual taxable revenue and VAT status with the accountant |
| 5 | Read-only Open Banking | Only if volume justifies a paid licensed provider |

## Limits stated honestly
- **Mudad:** no official public file layout. The system will export the bank's payroll template; the bank or the owner uploads to Mudad. It will not be called "Mudad compliant".
- **ZATCA:** the business is not VAT-registered, so no VAT is charged and no document is called a tax invoice.
- **Calendar apps:** Todoist and Microsoft To Do cannot subscribe to calendar feeds. TickTick can, and Google refreshes subscriptions only every few hours.
- **Push notifications:** the calendar reminders cover bookings today. Web push to the installed app needs extra work and only works on iPhone for apps added to the Home Screen; it is not built.

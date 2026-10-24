# Changelog

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

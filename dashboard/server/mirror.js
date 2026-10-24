// One-way copy of the database into a Google Sheet, for viewing, filtering, sharing and Power BI.
// The Sheet is overwritten on every push, so edits made there are not kept: changes go
// through the dashboard (permissions, audit log, accounting). Password hashes, link tokens
// (customer document links, calendar feeds) and workers' IBAN / ID numbers are never copied.

import { SheetsBackend } from './sheets.js';
import { SCHEMA } from './store.js';

const HIDDEN = new Set(['password_hash', 'share_token', 'calendar_token', 'iban', 'id_number']);
const INFO_TAB = 'معلومات النسخة | info';

export class SheetsMirror {
  /** @param {{ spreadsheetId: string, credentials?: object, call?: Function, mainSpreadsheetId?: string }} opts */
  constructor({ spreadsheetId, credentials, call, mainSpreadsheetId }) {
    if (!spreadsheetId) throw new Error('mirror: spreadsheetId is required');
    if (mainSpreadsheetId && spreadsheetId === mainSpreadsheetId) throw new Error('mirror: refusing to overwrite the main data spreadsheet');
    const api = call ? null : new SheetsBackend({ spreadsheetId, credentials });
    this.call = call || ((path, init) => api.call(path, init));
    this.last = { at: '', ok: null, error: '', rows: 0 };
    this.running = null;
  }

  /** Values for one tab: row 1 keys, row 2 labels, then the live (not deleted) rows. */
  static tabValues(table, rows) {
    const cols = SCHEMA[table].cols.filter((c) => !HIDDEN.has(c[0]));
    return [
      cols.map((c) => c[0]),
      cols.map((c) => `${c[1]} / ${c[2]}`),
      ...rows.map((r) => cols.map((c) => (r[c[0]] === undefined || r[c[0]] === null ? '' : r[c[0]]))),
    ];
  }

  push(store) {
    // One push at a time; a second request while one runs gets the same result.
    this.running ||= this.doPush(store).finally(() => { this.running = null; });
    return this.running;
  }

  async doPush(store) {
    try {
      const meta = await this.call('?fields=sheets.properties.title');
      const have = new Set(meta.sheets.map((s) => s.properties.title));
      const titles = Object.fromEntries(Object.keys(SCHEMA).map((t) => [t, `${SCHEMA[t].ar} | ${t}`]));
      const wanted = [INFO_TAB, ...Object.values(titles)];
      const missing = wanted.filter((t) => !have.has(t));
      if (missing.length) {
        await this.call(':batchUpdate', {
          method: 'POST',
          body: JSON.stringify({ requests: missing.map((title) => ({ addSheet: { properties: { title, gridProperties: { frozenRowCount: 2 } } } })) }),
        });
      }
      const at = new Date().toISOString();
      let rows = 0;
      const data = [
        { range: `'${INFO_TAB}'!A1`, values: [['نسخة للعرض فقط — تتحدّث تلقائيًا من النظام. التعديل من لوحة الإدارة.'], ['Read-only copy, refreshed automatically. Edit in the dashboard.'], ['آخر تحديث / Last refresh (UTC)', at]] },
      ];
      for (const [t, title] of Object.entries(titles)) {
        const list = store.list(t);
        rows += list.length;
        data.push({ range: `'${title}'!A1`, values: SheetsMirror.tabValues(t, list) });
      }
      await this.call('/values:batchClear', { method: 'POST', body: JSON.stringify({ ranges: wanted.map((t) => `'${t}'`) }) });
      await this.call('/values:batchUpdate', { method: 'POST', body: JSON.stringify({ valueInputOption: 'RAW', data }) });
      this.last = { at, ok: true, error: '', rows };
    } catch (e) {
      this.last = { at: new Date().toISOString(), ok: false, error: String(e.message || e).slice(0, 300), rows: 0 };
    }
    return this.last;
  }
}

// Google Sheets backend using a service account (no Google SDK needed).
// Layout per tab: row 1 = column keys, row 2 = labels, data from row 3.
// Columns are matched by the key in row 1, so reordering columns in the sheet is safe.

import { createSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(here, '..', 'shared', 'schema.json'), 'utf8')).tables;
const API = 'https://sheets.googleapis.com/v4/spreadsheets';

const b64url = (s) => Buffer.from(s).toString('base64url');
const colName = (n) => {
  let s = '';
  for (n += 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

export class SheetsBackend {
  constructor({ spreadsheetId, credentials }) {
    this.id = spreadsheetId;
    this.creds = credentials; // { client_email, private_key }
    this.token = null;
    this.tokenExp = 0;
    this.tabs = {}; // table -> { title, headers: [], rowNums: [] }
  }

  async auth() {
    if (this.token && Date.now() < this.tokenExp - 60_000) return this.token;
    const now = Math.floor(Date.now() / 1000);
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
      iss: this.creds.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }));
    const sig = createSign('RSA-SHA256').update(`${head}.${claim}`).sign(this.creds.private_key, 'base64url');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${claim}.${sig}` }),
    });
    if (!res.ok) throw new Error(`Google auth failed: ${res.status} ${await res.text()}`);
    const j = await res.json();
    this.token = j.access_token;
    this.tokenExp = Date.now() + j.expires_in * 1000;
    return this.token;
  }

  async call(path, init = {}) {
    const res = await fetch(`${API}/${this.id}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${await this.auth()}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
    });
    if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async loadAll() {
    const meta = await this.call('?fields=sheets.properties.title');
    for (const s of meta.sheets) {
      const m = s.properties.title.match(/\|\s*([a-z_]+)\s*$/);
      if (m && SCHEMA[m[1]]) this.tabs[m[1]] = { title: s.properties.title, headers: [], rowNums: [] };
    }
    const missing = Object.keys(SCHEMA).filter((t) => !this.tabs[t]);
    if (missing.length) throw new Error(`Spreadsheet is missing tabs: ${missing.join(', ')}`);

    const tables = Object.keys(this.tabs);
    const ranges = tables.map((t) => `ranges=${encodeURIComponent(`'${this.tabs[t].title}'!A1:ZZ`)}`).join('&');
    const data = await this.call(`/values:batchGet?${ranges}&valueRenderOption=UNFORMATTED_VALUE`);
    const out = {};
    for (const [i, t] of tables.entries()) {
      const values = data.valueRanges[i].values || [];
      const tab = this.tabs[t];
      tab.headers = (values[0] || []).map(String);
      await this.ensureHeaders(t);
      out[t] = [];
      tab.rowNums = [];
      values.slice(2).forEach((row, k) => {
        if (!row.some((v) => v !== '' && v !== null && v !== undefined)) return;
        const obj = {};
        tab.headers.forEach((h, c) => { if (h) obj[h] = row[c] ?? ''; });
        out[t].push(obj);
        tab.rowNums.push(k + 3);
      });
    }
    return out;
  }

  /** Add any schema column that is missing from row 1 (new fields in later versions). */
  async ensureHeaders(table) {
    const tab = this.tabs[table];
    const missing = SCHEMA[table].cols.filter((c) => !tab.headers.includes(c[0]));
    if (!missing.length) return;
    const start = tab.headers.length;
    const range = `'${tab.title}'!${colName(start)}1:${colName(start + missing.length - 1)}2`;
    await this.call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [missing.map((c) => c[0]), missing.map((c) => `${c[1]} / ${c[2]}`)] }),
    });
    tab.headers.push(...missing.map((c) => c[0]));
  }

  rowValues(table, obj) {
    return this.tabs[table].headers.map((h) => (obj[h] === undefined ? '' : obj[h]));
  }

  async insert(table, obj) {
    const tab = this.tabs[table];
    // RAW: user text is never interpreted as a formula.
    const res = await this.call(
      `/values/${encodeURIComponent(`'${tab.title}'!A3`)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
      { method: 'POST', body: JSON.stringify({ values: [this.rowValues(table, obj)] }) },
    );
    const m = res.updates.updatedRange.match(/!A(\d+)/);
    tab.rowNums.push(Number(m[1]));
  }

  async update(table, obj, idx) {
    const tab = this.tabs[table];
    const r = tab.rowNums[idx];
    const range = `'${tab.title}'!A${r}:${colName(tab.headers.length - 1)}${r}`;
    await this.call(`/values/${encodeURIComponent(range)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [this.rowValues(table, obj)] }),
    });
  }

  async persist() {}
}

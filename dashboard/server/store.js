// Data store: an in-memory table cache backed by a JSON file (dev/tests), MySQL
// (production, see docs/ARCHITECTURE.md) or Google Sheets. All writes go through
// one queue, so two staff saving at the same moment never overwrite each other.

import { readFileSync, writeFileSync, existsSync, renameSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SheetsBackend } from './sheets.js';
import { MysqlBackend } from './mysql.js';

const here = dirname(fileURLToPath(import.meta.url));
export const SCHEMA = JSON.parse(readFileSync(join(here, '..', 'shared', 'schema.json'), 'utf8')).tables;
export const columnsOf = (table) => SCHEMA[table].cols.map((c) => c[0]);

class FileBackend {
  constructor(file) {
    this.file = file;
  }
  async loadAll() {
    if (!existsSync(this.file)) return {};
    return JSON.parse(readFileSync(this.file, 'utf8'));
  }
  async persist(tables) {
    mkdirSync(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(tables, null, 1));
    renameSync(tmp, this.file);
  }
  // Row-level hooks are no-ops: the whole file is rewritten atomically.
  async insert() {}
  async update() {}
}

export class Store {
  /** @param {{ kind: 'file', file: string } | { kind: 'mysql', url: string } | { kind: 'sheets', spreadsheetId: string, credentials: object }} opts */
  constructor(opts) {
    this.backend =
      opts.kind === 'sheets' ? new SheetsBackend(opts) : opts.kind === 'mysql' ? new MysqlBackend(opts) : new FileBackend(opts.file);
    this.kind = opts.kind;
    this.tables = {};
    this.queue = Promise.resolve();
  }

  async init() {
    const loaded = await this.backend.loadAll();
    for (const t of Object.keys(SCHEMA)) this.tables[t] = loaded[t] ?? [];
  }

  /** Serialise every write. */
  run(fn) {
    const p = this.queue.then(fn);
    this.queue = p.catch(() => {});
    return p;
  }

  list(table, { includeDeleted = false } = {}) {
    const rows = this.tables[table] ?? [];
    return includeDeleted ? rows : rows.filter((r) => !r.deleted_at);
  }

  get(table, id) {
    return (this.tables[table] ?? []).find((r) => String(r.id) === String(id));
  }

  clean(table, data) {
    const cols = columnsOf(table);
    const out = {};
    for (const c of cols) if (data[c] !== undefined) out[c] = data[c] === null ? '' : data[c];
    return out;
  }

  insert(table, data) {
    return this.run(async () => {
      const row = this.clean(table, data);
      // Write to the backend first: if it fails, the cache stays as it was.
      await this.backend.insert(table, row, this.tables[table].length);
      this.tables[table].push(row);
      if (this.kind === 'file') await this.backend.persist(this.tables);
      return row;
    });
  }

  patch(table, id, data) {
    return this.run(async () => {
      const idx = this.tables[table].findIndex((r) => String(r.id) === String(id));
      if (idx < 0) return null;
      const next = { ...this.tables[table][idx], ...this.clean(table, data) };
      await this.backend.update(table, next, idx);
      this.tables[table][idx] = next;
      if (this.kind === 'file') await this.backend.persist(this.tables);
      return next;
    });
  }

  /** Key/value helpers for the settings tab. */
  setting(key) {
    return this.tables.settings?.find((r) => r.key === key)?.value ?? '';
  }
  async setSetting(key, value) {
    const idx = this.tables.settings.findIndex((r) => r.key === key);
    if (idx < 0) return this.insert('settings', { key, value });
    return this.run(async () => {
      const next = { ...this.tables.settings[idx], value };
      await this.backend.update('settings', next, idx);
      this.tables.settings[idx] = next;
      if (this.kind === 'file') await this.backend.persist(this.tables);
    });
  }
}

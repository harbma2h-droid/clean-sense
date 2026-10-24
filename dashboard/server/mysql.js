// MySQL / MariaDB backend (Hostinger includes MySQL). Same contract as the Sheets backend:
// loadAll() fills the in-memory cache, insert()/update() write one row.
// Tables and columns come from shared/schema.json and are created or extended on start-up;
// existing columns and rows are never dropped. Every table gets a hidden `_row` key,
// so tables without a unique id (settings, audit_log, ...) work the same way.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(here, '..', 'shared', 'schema.json'), 'utf8')).tables;

// Amounts are stored as DECIMAL so reports and Power BI see real numbers.
export const NUMERIC = new Set([
  'amount', 'price', 'paid_amount', 'subtotal', 'discount', 'total', 'wage',
  'estimate_min', 'estimate_max', 'contract_value', 'budget_cost',
  'book_balance', 'actual_balance', 'price_min', 'price_max',
  'allowances', 'basic', 'overtime', 'bonus', 'deductions', 'advance_recovery', 'installment', 'days',
]);
const LONG = new Set(['items', 'json', 'details', 'scope', 'terms', 'notes', 'permissions', 'value', 'password_hash']);

const q = (name) => `\`${String(name).replace(/`/g, '``')}\``;
const colType = (c) => (NUMERIC.has(c) ? 'DECIMAL(14,2) NULL' : c === 'id' ? 'VARCHAR(64) NULL' : LONG.has(c) ? 'MEDIUMTEXT NULL' : 'TEXT NULL');

export class MysqlBackend {
  constructor({ url }) {
    this.pool = mysql.createPool({ uri: url, charset: 'utf8mb4', decimalNumbers: true, dateStrings: true, connectionLimit: 5, timezone: 'Z' });
    this.rowIds = {}; // table -> [_row, ...] in the same order as the cache
  }

  async ensureTables() {
    for (const [table, def] of Object.entries(SCHEMA)) {
      const cols = def.cols.map((c) => c[0]);
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS ${q(table)} (_row BIGINT AUTO_INCREMENT PRIMARY KEY, ${cols.map((c) => `${q(c)} ${colType(c)}`).join(', ')}` +
          `${cols.includes('id') ? ', UNIQUE KEY uq_id (id)' : ''}) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
      );
      const [have] = await this.pool.query(`SHOW COLUMNS FROM ${q(table)}`);
      const names = new Set(have.map((r) => r.Field));
      for (const c of cols.filter((c) => !names.has(c))) await this.pool.query(`ALTER TABLE ${q(table)} ADD COLUMN ${q(c)} ${colType(c)}`);
    }
  }

  async loadAll() {
    await this.ensureTables();
    const out = {};
    for (const table of Object.keys(SCHEMA)) {
      const cols = SCHEMA[table].cols.map((c) => c[0]);
      const [rows] = await this.pool.query(`SELECT * FROM ${q(table)} ORDER BY _row`);
      this.rowIds[table] = rows.map((r) => r._row);
      out[table] = rows.map((r) => {
        const obj = {};
        for (const c of cols) obj[c] = r[c] ?? '';
        return obj;
      });
    }
    return out;
  }

  toDb(table, obj) {
    const cols = SCHEMA[table].cols.map((c) => c[0]).filter((c) => obj[c] !== undefined);
    const vals = cols.map((c) => {
      const v = obj[c];
      if (NUMERIC.has(c)) {
        if (v === '' || v === null) return null;
        const n = Number(v);
        if (!Number.isFinite(n)) throw new Error(`${table}.${c}: not a number (${String(v).slice(0, 40)})`);
        return n;
      }
      return v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
    return { cols, vals };
  }

  async insert(table, obj) {
    const { cols, vals } = this.toDb(table, obj);
    const [res] = await this.pool.query(
      cols.length ? `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})` : `INSERT INTO ${q(table)} () VALUES ()`,
      vals,
    );
    (this.rowIds[table] ||= []).push(res.insertId);
  }

  async update(table, obj, idx) {
    const { cols, vals } = this.toDb(table, obj);
    if (!cols.length) return;
    await this.pool.query(`UPDATE ${q(table)} SET ${cols.map((c) => `${q(c)} = ?`).join(', ')} WHERE _row = ?`, [...vals, this.rowIds[table][idx]]);
  }

  /** Bulk load into EMPTY tables in one transaction: all rows land, or none do. */
  async importTables(tables) {
    await this.ensureTables();
    const conn = await this.pool.getConnection();
    try {
      for (const t of Object.keys(tables)) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM ${q(t)}`);
        if (n > 0) throw new Error(`target table ${t} is not empty (${n} rows): refusing to import`);
      }
      await conn.beginTransaction();
      for (const [t, rows] of Object.entries(tables)) {
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200).map((r) => this.toDb(t, r));
          const cols = SCHEMA[t].cols.map((c) => c[0]);
          const values = chunk.map(({ cols: have, vals }) => cols.map((c) => (have.includes(c) ? vals[have.indexOf(c)] : null)));
          await conn.query(`INSERT INTO ${q(t)} (${cols.map(q).join(', ')}) VALUES ?`, [values]);
        }
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback().catch(() => {});
      throw e;
    } finally {
      conn.release();
    }
  }

  async persist() {}

  async close() {
    await this.pool.end();
  }
}

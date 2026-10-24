import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../store.js';
import { writeBackup, readBackup, hasBackupToday } from '../backup.js';
import { summary, problems } from '../../../system/migrate/to-mysql.mjs';

async function sampleStore() {
  const store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-')), 'db.json') });
  await store.init();
  await store.insert('customers', { id: 'C1', name: 'عميل "اختبار"; DROP TABLE x', phone: '0551234567', notes: 'سطر\nسطر ثاني' });
  await store.insert('customers', { id: 'C2', name: 'محذوف', phone: '0550000000', deleted_at: '2026-10-01T00:00:00Z' });
  await store.insert('payments', { id: 'P1', amount: 1234.5, date: '2026-10-20', method: 'cash', status: 'posted' });
  await store.insert('payments', { id: 'P2', amount: '', date: '2026-10-21', method: 'bank_transfer', status: 'void' });
  await store.insert('settings', { key: 'company.name', value: 'Clean Sense' });
  await store.insert('audit_log', { at: '2026-10-23T10:00:00Z', user: 'owner', action: 'login', entity: '', entity_id: '', details: '' });
  return store;
}

test('backup: written gzip file reads back identical, deleted rows included', async () => {
  const store = await sampleStore();
  const dir = mkdtempSync(join(tmpdir(), 'cs-bk-'));
  assert.equal(hasBackupToday(dir), false);
  const file = writeBackup(store, dir, 2);
  assert.equal(hasBackupToday(dir), true, 'restarts later today will not write another one');
  const data = readBackup(file);
  assert.equal(data.tables.customers.length, 2);
  assert.deepEqual(data.tables.payments, store.list('payments', { includeDeleted: true }));
});

test('migration checks: totals per table and text in amount columns is reported', async () => {
  const store = await sampleStore();
  const s = summary(store.tables);
  assert.equal(s.payments.rows, 2);
  assert.equal(s.payments.sums.amount, 1234.5);
  assert.deepEqual(problems(store.tables), []);
  assert.equal(problems({ payments: [{ id: 'X', amount: '1,200 ريال' }] }).length, 1);
});

test('migration into MySQL: everything copied in one transaction, totals match, refuses a non-empty target', { skip: !process.env.TEST_MYSQL_URL && 'set TEST_MYSQL_URL' }, async () => {
  const mysql = (await import('mysql2/promise')).default;
  const { MysqlBackend } = await import('../mysql.js');
  const base = new URL(process.env.TEST_MYSQL_URL);
  const url = new URL(base); url.pathname = '/cleansense_test_migrate';
  const c = await mysql.createConnection({ host: base.hostname, port: Number(base.port || 3306), user: decodeURIComponent(base.username), password: decodeURIComponent(base.password) });
  await c.query('DROP DATABASE IF EXISTS cleansense_test_migrate');
  await c.query('CREATE DATABASE cleansense_test_migrate CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
  await c.end();

  const store = await sampleStore();
  const target = new MysqlBackend({ url: url.toString() });
  try {
    await target.importTables(store.tables);
    const loaded = await target.loadAll();
    assert.deepEqual(summary(loaded), summary(store.tables));
    assert.deepEqual(loaded.customers, store.tables.customers.map((r) => ({ ...Object.fromEntries(Object.keys(loaded.customers[0]).map((k) => [k, ''])), ...r })));
    await assert.rejects(target.importTables(store.tables), /not empty/);
  } finally {
    await target.close();
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store, SCHEMA } from '../store.js';
import { SheetsMirror } from '../mirror.js';

test('mirror: never targets the main spreadsheet', () => {
  assert.throws(() => new SheetsMirror({ spreadsheetId: 'S1', mainSpreadsheetId: 'S1', call: async () => ({}) }), /refusing/);
});

test('mirror: creates missing tabs, writes live rows only, never copies password hashes', async () => {
  const store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-')), 'db.json') });
  await store.init();
  await store.insert('users', { id: 'U1', name: 'Owner', username: 'owner', role: 'owner', password_hash: 'SECRET-HASH' });
  await store.insert('customers', { id: 'C1', name: 'سارة', phone: '0551234567' });
  await store.insert('customers', { id: 'C2', name: 'محذوف', phone: '0550000000', deleted_at: '2026-10-01' });

  const calls = [];
  const call = async (path, init) => {
    calls.push({ path, body: init?.body ? JSON.parse(init.body) : null });
    return path.startsWith('?') ? { sheets: [{ properties: { title: `${SCHEMA.customers.ar} | customers` } }] } : {};
  };
  const m = new SheetsMirror({ spreadsheetId: 'MIRROR', mainSpreadsheetId: 'MAIN', call });
  const r = await m.push(store);
  assert.equal(r.ok, true, r.error);

  const added = calls.find((c) => c.path === ':batchUpdate').body.requests.map((x) => x.addSheet.properties.title);
  assert.ok(added.some((t) => t.endsWith('| leads')), 'missing tabs added');
  assert.ok(!added.some((t) => t.endsWith('| customers')), 'existing tab not re-added');

  const write = calls.find((c) => c.path === '/values:batchUpdate').body;
  assert.equal(write.valueInputOption, 'RAW');
  const tab = (name) => write.data.find((d) => d.range.includes(`| ${name}'`)).values;
  assert.deepEqual(tab('customers').slice(2).map((row) => row[1]), ['سارة'], 'deleted rows left out');
  assert.ok(!JSON.stringify(tab('users')).includes('SECRET-HASH'));
  assert.ok(!tab('users')[0].includes('password_hash'));
  assert.ok(calls.findIndex((c) => c.path === '/values:batchClear') < calls.findIndex((c) => c.path === '/values:batchUpdate'));
});

test('mirror: a Google error is reported, not thrown', async () => {
  const store = new Store({ kind: 'file', file: join(mkdtempSync(join(tmpdir(), 'cs-')), 'db.json') });
  await store.init();
  const m = new SheetsMirror({ spreadsheetId: 'MIRROR', call: async () => { throw new Error('Sheets API 403'); } });
  const r = await m.push(store);
  assert.equal(r.ok, false);
  assert.match(r.error, /403/);
});

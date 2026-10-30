// Weekly backups and their off-site copy to Google Drive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { isoWeek, keepWeekly } from '../backup.js';
import { uploadToDrive } from '../drive.js';

test('iso week labels', () => {
  assert.equal(isoWeek(new Date('2026-10-30T10:00:00Z')), '2026-W44');
  assert.equal(isoWeek(new Date('2026-01-01T10:00:00Z')), '2026-W01');
  assert.equal(isoWeek(new Date('2027-01-01T10:00:00Z')), '2026-W53');
});

test('weekly copy: once per week, newest 12 kept', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-w-'));
  const daily = join(dir, 'cleansense-day.json.gz');
  writeFileSync(daily, gzipSync('{"format":"clean-sense-backup"}'));
  const first = keepWeekly(dir, daily, 12, new Date('2026-10-26T08:00:00Z'));
  assert.ok(first.endsWith('cleansense-week-2026-W44.json.gz'));
  assert.deepEqual(readFileSync(first), readFileSync(daily));
  assert.equal(keepWeekly(dir, daily, 12, new Date('2026-10-30T08:00:00Z')), '', 'same week: nothing new');
  for (let i = 1; i <= 14; i++) keepWeekly(dir, daily, 12, new Date(Date.UTC(2026, 10, 2 + 7 * i)));
  const files = readdirSync(join(dir, 'weekly')).sort();
  assert.equal(files.length, 12);
  assert.ok(!files.includes('cleansense-week-2026-W44.json.gz'), 'the oldest weeks are removed');
});

test('drive upload: shared-drive folder, file scope, file content sent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'cs-d-'));
  const file = join(dir, 'cleansense-week-2026-W44.json.gz');
  writeFileSync(file, Buffer.from([1, 2, 3, 250]));
  let seen;
  const out = await uploadToDrive({
    credentials: {}, folderId: 'FOLDER1', file,
    tokenImpl: async (_c, scope) => { assert.equal(scope, 'https://www.googleapis.com/auth/drive.file'); return { access_token: 'T' }; },
    fetchImpl: async (url, init) => { seen = { url, init }; return { ok: true, json: async () => ({ id: 'F1', name: 'x', size: '4' }) }; },
  });
  assert.equal(out.id, 'F1');
  assert.ok(seen.url.includes('supportsAllDrives=true'));
  assert.equal(seen.init.headers.Authorization, 'Bearer T');
  const body = seen.init.body.toString('latin1');
  assert.ok(body.includes('"parents":["FOLDER1"]') && body.includes('cleansense-week-2026-W44.json.gz'));
  assert.ok(seen.init.body.includes(Buffer.from([1, 2, 3, 250])));
  await assert.rejects(uploadToDrive({ credentials: {}, folderId: '', file }), /folderId/);
  await assert.rejects(uploadToDrive({ credentials: {}, folderId: 'F', file, tokenImpl: async () => ({ access_token: 'T' }), fetchImpl: async () => ({ ok: false, status: 403, text: async () => 'no' }) }), /403/);
});

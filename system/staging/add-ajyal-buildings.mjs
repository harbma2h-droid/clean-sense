// Adds the 12 Ajyal buildings (AJ-01 … AJ-12) to a TEST environment, each with its own units,
// common areas and QR points. Buildings that already exist are skipped. Same safety rule as
// seed.mjs: the database name must contain "staging" or "test".
//
//   STAGING_DB_URL=mysql://…/cleansense_staging node system/staging/add-ajyal-buildings.mjs

import { Store } from '../../dashboard/server/store.js';
import { PERMISSIONS } from '../../dashboard/shared/model.js';
import { createSiteFromTemplate, AJYAL_TYPES } from '../../dashboard/shared/buildings.js';

const url = process.env.STAGING_DB_URL;
if (!url) throw new Error('Set STAGING_DB_URL');
const db = new URL(url).pathname.slice(1);
if (!/staging|test/i.test(db)) throw new Error(`Refusing "${db}": the database name must contain "staging" or "test"`);

const store = new Store({ kind: 'mysql', url });
await store.init();
const owner = store.list('users').find((u) => u.role === 'owner');
const ctx = {
  store, user: owner, perms: Object.keys(PERMISSIONS),
  audit: (action, entity, id, details = '') => store.insert('audit_log', { at: new Date().toISOString(), user: 'seed', action, entity, entity_id: id, details: typeof details === 'string' ? details : JSON.stringify(details) }),
};
const have = new Set(store.list('sites').map((s) => s.code));
let added = 0;
for (const [no, type] of Object.entries(AJYAL_TYPES)) {
  const code = `AJ-${String(no).padStart(2, '0')}`;
  if (have.has(code)) continue;
  await createSiteFromTemplate(ctx, { code, name: `عمارة ${no} - سكن أجيال`, name_en: `Building ${no} - Ajyal`, building_type: type, district: 'سكن أجيال', city: 'dhahran', notes: 'بيئة تجريبية' });
  added += 1;
}
console.log(`Added ${added} buildings; ${store.list('sites').length} in total, ${store.list('units').length} units.`);
await store.backend.close?.();

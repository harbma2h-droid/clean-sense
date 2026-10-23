// Builds the Hostinger upload for the internal system: server + shared code + the already-built
// web UI, with a package.json whose "build" does nothing (Hostinger runs `npm run build`, and the
// UI build tools are dev-only). Output: private/deploy/clean-sense-system-<stamp>.zip (git-ignored).
//
//   cd dashboard && npm run build && cd .. && node scripts/package-system.mjs

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dash = join(root, 'dashboard');
if (!existsSync(join(dash, 'web', 'dist', 'index.html'))) throw new Error('Build the web UI first: cd dashboard && npm run build');

const stage = mkdtempSync(join(tmpdir(), 'cs-pkg-'));
const pkg = JSON.parse(readFileSync(join(dash, 'package.json'), 'utf8'));
writeFileSync(join(stage, 'package.json'), JSON.stringify({
  name: pkg.name, private: true, type: 'module', version: pkg.version,
  engines: { node: '>=20' },
  // Hostinger entry file: server/start.cjs (its runner require()s the entry; see that file).
  scripts: { start: 'node server/start.cjs', build: 'node -e "console.log(\'web UI is prebuilt\')"' },
  dependencies: pkg.dependencies,
}, null, 2));
cpSync(join(dash, 'shared'), join(stage, 'shared'), { recursive: true });
mkdirSync(join(stage, 'server'));
for (const f of readdirSync(join(dash, 'server'))) if (/\.c?js$/.test(f)) cpSync(join(dash, 'server', f), join(stage, 'server', f));
cpSync(join(dash, 'web', 'dist'), join(stage, 'web', 'dist'), { recursive: true });

const out = join(root, 'private', 'deploy');
mkdirSync(out, { recursive: true });
const zip = join(out, `clean-sense-system-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}.zip`);
execFileSync('tar', ['-a', '-c', '-f', zip, '-C', stage, '.']);
console.log(zip);

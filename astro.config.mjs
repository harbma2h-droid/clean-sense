// @ts-check
import { defineConfig } from 'astro/config';

// PREVIEW=1 builds a self-contained copy (CSS/JS inlined) for the claude.ai preview link.
const preview = process.env.PREVIEW === '1';

export default defineConfig({
  site: 'https://cleansense.co',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: preview ? 'always' : 'auto' },
  vite: preview ? { build: { assetsInlineLimit: 9000 } } : {},
  compressHTML: true,
});

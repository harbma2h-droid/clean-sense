// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://cleansense.co',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto' },
  compressHTML: true,
});

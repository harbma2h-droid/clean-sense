import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

const demo = process.env.VITE_DEMO === '1';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  // The demo build is one self-contained HTML file for the preview link.
  plugins: [react(), ...(demo ? [viteSingleFile()] : [])],
  resolve: { alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) } },
  server: { proxy: { '/api': 'http://localhost:3000' } },
  build: { outDir: 'dist', emptyOutDir: true },
});

import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  resolve: { alias: [{ find: /.*\/lib\/firebase$/, replacement: fileURLToPath(new URL('./firebase.ts', import.meta.url)) }] },
  esbuild: { jsx: 'automatic' },
});

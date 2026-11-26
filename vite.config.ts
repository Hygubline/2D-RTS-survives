import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: { port: 5199, strictPort: true, allowedHosts: ['.trycloudflare.com'] },
  build: { target: 'es2022', outDir: 'dist', assetsInlineLimit: 0 },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  resolve: {
    alias: {
      // The frontend imports the engine as '@engine'. Later the backend uses the same folder.
      '@engine': fileURLToPath(new URL('./engine/index.js', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    host: true, // lets you open the app on your phone over the same Wi-Fi
    fs: { allow: [here] },
    // Orders, tracking and staff go to the PrintHub server (printhub/server, port 5181).
    proxy: {
      '/api': { target: 'http://localhost:5181', changeOrigin: false },
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
});

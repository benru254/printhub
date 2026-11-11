import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const here = fileURLToPath(new URL('.', import.meta.url));

// OFFLINE. When the app is built, this writes sw.js (the service worker) with the list of
// every file of the app. The phone keeps those files, so the app opens with no internet.
// A new build gets a new version name, and phones swap to it the next time they are online.
function offlineApp() {
  return {
    name: 'printhub-offline',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const version = createHash('sha1').update(files.join('|')).digest('hex').slice(0, 10);
      const extra = ['./', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png'];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync(new URL('./frontend/sw.template.js', import.meta.url), 'utf8')
          .replace('__VERSION__', version)
          .replace("'__FILES__'", JSON.stringify([...extra, ...files])),
      });
    },
  };
}

export default defineConfig({
  root: 'frontend',
  plugins: [react(), offlineApp()],
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

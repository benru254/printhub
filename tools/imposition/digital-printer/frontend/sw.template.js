// PrintHub service worker (made by vite.config.js at build time: do not edit dist/sw.js).
// - The app's own files are kept on the phone, so the app opens with no internet.
// - Anything under /api (orders, prices, staff) ALWAYS goes to the server and is never kept.
const VERSION = 'printhub-__VERSION__';
const FILES = '__FILES__';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n.startsWith('printhub-') && n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;

  // Opening the app: try the internet first (to get updates), fall back to the kept copy.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match('./', { cacheName: VERSION })));
    return;
  }
  // The app's files: the kept copy first (instant), the internet if it is not there.
  event.respondWith(caches.match(req, { cacheName: VERSION }).then((hit) => hit || fetch(req)));
});

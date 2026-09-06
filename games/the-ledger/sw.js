/* Offline shell: the game is static, so cache it and serve from cache first. */
const CACHE = 'the-ledger-v2';
const ASSETS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/sim.js',
  './js/campaign.js',
  './js/ops.js',
  './js/store.js',
  './js/ui/kit.js',
  './js/ui/map.js',
  './js/ui/run.js',
  './js/ui/opsui.js',
  './js/ui/bonusshop.js',
  './js/bonusshop/core.js',
  './js/bonusshop/shell.js',
  './js/payments.config.js',
  './js/payments/catalog.js',
  './js/payments/client/licence.js',
  './js/payments/client/entitlements.js',
  './js/payments/client/paywall.js',
  './manifest.webmanifest',
  './icons/icon.svg',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) =>
      hit ||
      fetch(event.request).then((res) => {
        if (res.ok && new URL(event.request.url).origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
        }
        return res;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

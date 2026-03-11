const CACHE_NAME = 'routemaster-v1';
const ASSETS_CACHE = 'routemaster-assets-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== CACHE_NAME && key !== ASSETS_CACHE)
            .map(key => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Strategy: Cache First for assets (JS, CSS, Images)
  if (request.destination === 'script' || request.destination === 'style' || request.destination === 'image' || url.pathname.includes('/assets/')) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) return cachedResponse;
        return fetch(request).then((networkResponse) => {
          if (networkResponse.status === 200) {
            const cacheCopy = networkResponse.clone();
            caches.open(ASSETS_CACHE).then(cache => cache.put(request, cacheCopy));
          }
          return networkResponse;
        });
      })
    );
  } else {
    // Strategy: Network First for everything else
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
  }
});

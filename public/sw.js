const CACHE = 'revolucionarios-shell-v6';
const CORE = ['/logo-web.png', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (event.request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const response = await fetch(event.request);
        // Clone before returning/consuming the body; await persistence for offline refresh.
        if (response.ok) await (await caches.open(CACHE)).put('/index.html', response.clone());
        return response;
      } catch { return await caches.match('/index.html') || Response.error(); }
    })());
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE), cached = await cache.match(event.request);
    const network = fetch(event.request).then(async (response) => {
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    });
    if (cached) {
      event.waitUntil(network.then(() => undefined).catch(() => undefined));
      return cached;
    }
    return network;
  })());
});

const CACHE='bluesales-vk-direct-v24.5.1';
const ASSETS=['/','/index.html','/styles.css?v=24.5.1','/api.js?v=24.5.0','/app.js?v=24.5.1','/manifest.webmanifest','/icon.svg'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async()=>{
    const cache = await caches.open(CACHE);
    for (const asset of ASSETS) {
      try { await cache.add(asset); } catch {}
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // CRITICAL: never intercept VK/userapi or any other external origin.
  // The old v20.1 worker intercepted them and could resolve to undefined,
  // which produced: "Failed to convert value to Response".
  if (url.origin !== self.location.origin) return;

  // API is always network-only; media proxy has its own cache headers.
  if (url.pathname.startsWith('/api/')) return;

  event.respondWith((async()=>{
    try {
      const response = await fetch(req);
      if (response && response.ok) {
        const cache = await caches.open(CACHE);
        cache.put(req, response.clone()).catch(()=>{});
      }
      return response;
    } catch {
      const cached = await caches.match(req);
      if (cached) return cached;
      if (req.mode === 'navigate') {
        const shell = await caches.match('/index.html');
        if (shell) return shell;
      }
      return new Response('', { status: 504, statusText: 'Offline' });
    }
  })());
});

/* Only public assets and the generic, unpersonalized offline shell are cached.
   API responses, authenticated HTML, RSC payloads, photos and user data never enter CacheStorage. */
const VERSION = 'alys-field-shell-v1';
const PUBLIC_ASSETS = ['/offline', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png'];
async function warmOfflineShell() {
  const cache = await caches.open(VERSION);
  const response = await fetch('/offline', { cache: 'reload', credentials: 'omit' });
  if (!response.ok || response.redirected) throw new Error('Offline shell could not be installed');
  const html = await response.clone().text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)="([^"?#]*\/_next\/static\/[^"?#]+)(?:\?[^\"]*)?"/g)].map(match => match[1]))];
  // A new shell replaces the previous one only after all of its public chunks are available.
  await Promise.all([...PUBLIC_ASSETS.filter(path => path !== '/offline'), ...assets].map(async path => {
    const asset = await fetch(path, { cache: 'reload', credentials: 'omit' });
    if (!asset.ok) throw new Error('Offline asset unavailable');
    await cache.put(path, asset);
  }));
  await cache.put('/offline', response);
}
self.addEventListener('install', event => {
  event.waitUntil(warmOfflineShell().then(() => self.skipWaiting()));
});
self.addEventListener('message', event => {
  // Warm a current public shell after a deploy even if the worker's own source did not change.
  if (event.data?.type === 'WARM_OFFLINE_SHELL') event.waitUntil(warmOfflineShell().catch(() => {}));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => (key.startsWith('alys-field-shell-') || key === 'alys-pools-demo-v1') && key !== VERSION).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || request.headers.has('RSC')) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const fallback = await (await caches.open(VERSION)).match('/offline');
      return fallback || new Response('Offline shell is not installed. Reconnect and open ALYS once.', {status:503,headers:{'Content-Type':'text/plain'}});
    }));
    return;
  }
  const publicAsset = url.pathname.startsWith('/_next/static/') || PUBLIC_ASSETS.includes(url.pathname);
  if (publicAsset) event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    const stored = await cache.match(url.pathname);
    if (stored) return stored;
    const response = await fetch(request);
    if (response.ok) await cache.put(url.pathname, response.clone());
    return response;
  })());
});

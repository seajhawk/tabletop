/* Galactic Defense / Tabletop Defense service worker template.
 * scripts/generate-sw.mjs fills the placeholders below and writes dist/ga-sw.js after `vite build`.
 * Supports both root (`/`) and subpath (e.g. `/TTDefense/`) deployments. */
const GA_VERSION = '__GA_VERSION__';
const GA_BASE = '__GA_BASE__';
const GA_PRECACHE = __GA_PRECACHE__;

// Caches are namespaced by deployment base so sibling apps on one origin (/, /tabletop/, /TTDefense/)
// never prune each other. ':' is escaped inside the encoded base, making the terminator unambiguous.
// The new family also survives legacy workers' broad 'ga-app-' pruning. Old caches are read-only
// fallback for exact current-scope URLs, never deleted or modified here.
const LEGACY_CACHE = /^ga-app-[0-9a-f]{16}$/;
const CACHE_PREFIX = 'ga-scope-app:' + encodeURIComponent(GA_BASE) + ':';
const CACHE_NAME = CACHE_PREFIX + GA_VERSION;
const SHELL = GA_BASE + 'index.html';
const BASE_NO_SLASH = GA_BASE.length > 1 ? GA_BASE.slice(0, -1) : GA_BASE;
const PRECACHE_SET = new Set(GA_PRECACHE);

function usable(res) {
  return !!res && res.ok && res.type !== 'opaque' && res.type !== 'error';
}

self.addEventListener('install', event => {
  // Fetch everything first, then write in one go: a failed install leaves no partial cache and
  // the previous version keeps serving. No skipWaiting here: the page must ask for activation.
  // Each body is fully drained before the next fetch starts: holding many unread response streams
  // open stalls the browser's per-origin connections and the install never finishes.
  event.waitUntil((async () => {
    const fetched = [];
    for (const url of GA_PRECACHE) {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!usable(res)) throw new Error('Precache failed: ' + url + ' (' + res.status + ')');
      // Keep native response metadata (including URL/encoding) instead of rebuilding a decoded response.
      const staged = res.clone();
      await res.arrayBuffer();
      fetched.push([url, staged]);
    }
    const cache = await caches.open(CACHE_NAME);
    try {
      for (const [url, res] of fetched) await cache.put(url, res);
    } catch (err) {
      await caches.delete(CACHE_NAME);
      throw err;
    }
  })());
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'GA_SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await self.clients.claim();
    // Older tabs may still request their hashed assets from an older app cache, so only prune our
    // own previous caches when no other window is open. Unrelated caches are never touched.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.length > 1) return;
    const names = await caches.keys();
    await Promise.all(names
      .filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME)
      .map(n => caches.delete(n)));
  })());
});

async function matchOwnCaches(pathname) {
  const current = await caches.open(CACHE_NAME);
  const hit = await current.match(pathname);
  if (hit) return hit;
  const all = await caches.keys();
  // Same-scope older versions first, then legacy ownerless caches. Lookup is by exact pathname, so a
  // legacy cache can only answer for URLs this scope owns (sibling paths carry a different prefix).
  const ordered = [
    ...all.filter(n => n.startsWith(CACHE_PREFIX) && n !== CACHE_NAME),
    ...all.filter(n => LEGACY_CACHE.test(n)),
  ];
  for (const n of ordered) {
    const old = await (await caches.open(n)).match(pathname);
    if (old) return old;
  }
  return null;
}

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;

  if (req.mode === 'navigate') {
    if (path !== GA_BASE && path !== BASE_NO_SLASH && path !== SHELL) return;
    event.respondWith((async () => {
      const shell = await (await caches.open(CACHE_NAME)).match(SHELL);
      return shell || fetch(req);
    })());
    return;
  }
  if (PRECACHE_SET.has(path) && path !== GA_BASE + 'ga-sw.js') {
    event.respondWith((async () => (await matchOwnCaches(path)) || fetch(req))());
  } else if (path.startsWith(GA_BASE + 'assets/')) {
    // Hashed asset from an older open tab: serve from an older app cache when we still have it.
    event.respondWith((async () => (await matchOwnCaches(path)) || fetch(req))());
  }
});

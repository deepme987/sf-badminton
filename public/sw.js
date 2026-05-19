/* eslint-disable no-restricted-globals */
/**
 * SF-Badminton service worker.
 *
 * Strategy summary:
 *   - App shell ("/", manifest, icons): precached on install, cache-first
 *     for static assets, network-first for navigations with a shell
 *     fallback when offline.
 *   - Hashed Next build chunks under /_next/static/*: stale-while-revalidate
 *     in a separate "static" cache. Safe because Next's filenames are
 *     content-hashed — the URL itself changes on every meaningful update.
 *   - Dynamic endpoints (/api/*, /og/sessions/*, /opengraph-image): bypass
 *     the worker entirely. The fetch handler returns early so the network
 *     handles them with no SW interference.
 *
 * Cache eviction: every deploy that wants to invalidate prior caches must
 * bump CACHE_VERSION below. On activate, we delete any cache whose name
 * doesn't start with this version prefix.
 *
 * Why hand-rolled (no next-pwa / Workbox):
 *   - Zero new deps (the project ships React 19 + Next 15 + Drizzle + zod;
 *     adding workbox-window pulls ~30 kB of helper code we don't need).
 *   - We control exactly what's cached. The list is short.
 *   - Easier to audit and fingerprint regressions against.
 */

const CACHE_VERSION = 'sfb-v1';
const SHELL_CACHE = `${CACHE_VERSION}-shell`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;

// App shell precache. Keep this list intentionally small — these are the
// resources we need to render the offline fallback ("you're offline, try
// again when you have signal") and the installable icon set.
const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon-512.png',
  '/icon-maskable.svg',
  // Note: /apple-icon, /icon, and /favicon.ico are routed through Next's
  // app-router icon convention and served from /apple-icon, /icon, /favicon.ico
  // respectively (no .png in the URL). They're rarely fetched by the browser
  // after install, so we let the static-cache path handle them on demand.
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic — if any URL fails, none are cached. We don't want
      // a half-baked shell, so we accept the failure and let the next
      // install attempt try again.
      try {
        await cache.addAll(SHELL_URLS);
      } catch (err) {
        // Swallow: a missing precache URL must not block worker install.
        // The runtime fetch handler will still serve cached responses for
        // anything that does land in the cache opportunistically.
        // eslint-disable-next-line no-console
        console.warn('[sw] shell precache failed', err);
      }
      // Activate immediately so the new worker takes over without waiting
      // for the next page load.
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => !n.startsWith(CACHE_VERSION))
          .map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

/**
 * Decide whether a request should bypass the worker entirely.
 *
 * Dynamic data must never be served from cache — staleness here means
 * wrong roster, wrong waitlist position, wrong cost split.
 */
function shouldBypass(url) {
  if (url.pathname.startsWith('/api/')) return true;
  if (url.pathname.startsWith('/og/sessions/')) return true;
  if (url.pathname === '/opengraph-image') return true;
  return false;
}

/**
 * Static assets: hashed Next chunks under /_next/static and the icon set.
 * Safe to cache forever because Next's pipeline content-hashes filenames.
 */
function isStaticAsset(url) {
  if (url.pathname.startsWith('/_next/static/')) return true;
  if (url.pathname === '/icon-512.png') return true;
  if (url.pathname === '/icon-maskable.svg') return true;
  if (url.pathname === '/manifest.webmanifest') return true;
  return false;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Cross-origin requests (fonts, analytics, etc.) are not our concern.
  if (url.origin !== self.location.origin) return;

  // Dynamic endpoints bypass the worker entirely.
  if (shouldBypass(url)) return;

  // Static hashed assets: stale-while-revalidate.
  if (isStaticAsset(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Navigations: network-first with shell fallback when offline.
  if (req.mode === 'navigate') {
    event.respondWith(networkFirstWithShellFallback(req));
    return;
  }

  // Everything else: cache-first against the shell cache, fall back to net.
  event.respondWith(cacheFirst(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(req);
  const networkPromise = fetch(req)
    .then((res) => {
      // Only cache successful, basic responses (skip opaque CDN responses).
      if (res && res.ok && res.type === 'basic') {
        cache.put(req, res.clone()).catch(() => {
          // ignore quota errors — best-effort cache.
        });
      }
      return res;
    })
    .catch(() => cached);
  return cached ?? networkPromise;
}

async function networkFirstWithShellFallback(req) {
  try {
    const fresh = await fetch(req);
    return fresh;
  } catch {
    // Offline — fall back to the cached app shell so the user sees a
    // chrome instead of the browser's error page.
    const cache = await caches.open(SHELL_CACHE);
    const shell = await cache.match('/');
    if (shell) return shell;
    // Last-ditch: synthesize a minimal offline response. Don't try to be
    // clever; Next will rehydrate when the user comes back online.
    return new Response('Offline', {
      status: 503,
      statusText: 'Offline',
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    return await fetch(req);
  } catch {
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

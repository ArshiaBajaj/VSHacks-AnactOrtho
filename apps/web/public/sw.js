/**
 * Anact Ortho service worker.
 *
 * Scope: makes repeat visits resilient, not a "zero network" guarantee. On
 * the very first visit everything is fetched from the network as normal;
 * from the second visit on, the app shell and the (large) pose model/wasm
 * CDN assets are served from cache so the SPA boots and the CV pipeline
 * comes up even with a flaky or absent connection.
 *
 * Strategy:
 *  - Navigation requests (SPA routes): network-first, falling back to the
 *    cached shell so client-side routing still works offline.
 *  - App JS/CSS/modules: network-first (never trap stale Vite/HMR bundles).
 *  - Pose CDN + static images/fonts: cache-first.
 */

const CACHE_VERSION = "anact-ortho-v2-film-coach";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/favicon.svg",
  "/logo.png",
];

const POSE_CDN_HOSTS = ["cdn.jsdelivr.net", "storage.googleapis.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isPoseCdnRequest(url) {
  return POSE_CDN_HOSTS.includes(url.hostname);
}

/** Vite / HMR / source modules — never cache-first or film UI freezes on old code. */
function isAppCodeRequest(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  if (p.startsWith("/src/") || p.startsWith("/@") || p.startsWith("/node_modules/")) {
    return true;
  }
  if (/\.(jsx?|tsx?|mjs|cjs|css)(\?|$)/i.test(p)) return true;
  if (url.searchParams.has("t") || url.searchParams.has("import")) return true;
  return false;
}

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  return /\.(png|jpe?g|gif|webp|svg|ico|woff2?|ttf|mp3|wav|webm|mp4)(\?|$)/i.test(
    url.pathname,
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    return cached ?? cache.match("/index.html");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_VERSION);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh && (fresh.ok || fresh.type === "opaque")) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

/** Always hit network for app code; do not write Vite modules into cache. */
async function networkOnly(request) {
  return fetch(request);
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  if (isAppCodeRequest(url)) {
    event.respondWith(networkOnly(request));
    return;
  }

  if (isPoseCdnRequest(url) || isStaticAsset(url)) {
    event.respondWith(cacheFirst(request));
  }
});

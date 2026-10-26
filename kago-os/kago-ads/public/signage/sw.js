// SIG-03: only Signage shell, build assets and approved static media are cached.
const CACHE = "kago-signage-shell-v2";
const isStatic = (p) => p.startsWith("/_next/static/") || p.startsWith("/ads-static/_next/static/");
const isShell = (p) => ["/signage", "/signage/", "/signage/play"].includes(p);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((k) => (k === "kago-signage-v1" || k.startsWith("kago-signage-shell-")) && k !== CACHE).map((k) => caches.delete(k)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache" || !Array.isArray(event.data.urls)) return;
  const urls = event.data.urls.filter((value) => {
    if (typeof value !== "string") return false;
    try {
      const url = new URL(value);
      return url.origin === self.location.origin && (isStatic(url.pathname) || isShell(url.pathname));
    } catch { return false; }
  });
  event.waitUntil(caches.open(CACHE).then((cache) => Promise.all(urls.map((url) => cache.add(url).catch(() => {})))));
});

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone()).catch(() => {});
  return res;
};

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) await cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch (error) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw error;
  }
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/ad-assets/")) event.respondWith(cacheFirst(req));
  else if (isStatic(url.pathname) || (req.mode === "navigate" && isShell(url.pathname))) event.respondWith(networkFirst(req));
});

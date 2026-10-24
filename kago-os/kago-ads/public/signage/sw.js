// KAGO/Signage の Service Worker（SIG-03）。範囲は /signage/ の下だけ（Ads の画面には効かない）
// - 広告素材（/ad-assets/）：保存したものを先に使う（通信が切れても表示を続ける）
// - 画面とその部品（/_next/static/）：通信を先に試し、だめなら保存したものを使う（切断中の再読み込みに備える）
// 広告を出してよいかの判断（期限・停止）は画面側が行う。ここでは素材を保存するだけ
const CACHE = "kago-signage-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kago-signage-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "precache") return;
  const urls = (event.data.urls || []).filter((u) => new URL(u).origin === self.location.origin);
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(urls.map((u) => c.add(u).catch(() => {})))));
});

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

const networkFirst = async (request) => {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw e;
  }
};

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || req.headers.has("range")) return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/ad-assets/")) event.respondWith(cacheFirst(req));
  else if (req.mode === "navigate" || url.pathname.startsWith("/_next/static/")) event.respondWith(networkFirst(req));
});

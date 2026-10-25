/* Only the public, fictional, self-contained snapshot is cached. Never Auth/API pages. */
const PAGE=new URL("index.html",self.registration.scope).href;
self.addEventListener("install",event=>event.waitUntil(caches.open(CACHE).then(c=>c.add(PAGE)).then(()=>self.skipWaiting())));
self.addEventListener("activate",event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith(PREFIX)&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener("fetch",event=>{
 const u=new URL(event.request.url);
 if(event.request.method!=="GET"||u.origin!==self.location.origin||u.pathname!==new URL(PAGE).pathname)return;
 event.respondWith(fetch(event.request).then(async r=>{if(r.ok){const c=await caches.open(CACHE);await c.put(PAGE,r.clone());}return r;}).catch(async()=>{const r=await caches.match(PAGE);if(!r)return Response.error();const headers=new Headers(r.headers);headers.delete("content-length");return new Response((await r.text()).replace("<body ","<body data-offline=\"1\" "),{status:r.status,headers});}));
});

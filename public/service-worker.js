const CACHE = "loyalty-wallet-v2";

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE).then((cache) =>
      cache.addAll([
        "/",
        "/manifest.json",
        "/service-worker.js",
        "/icons/icon-192.png",
        "/icons/icon-512.png"
      ])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request))
  );
});

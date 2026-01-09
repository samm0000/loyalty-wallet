const CACHE = "loyalty-wallet-v1";

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

self.addEventListener("activate", () => {
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((res) => res || fetch(e.request))
  );
});

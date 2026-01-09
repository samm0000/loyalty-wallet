const CACHE_NAME = "lw-v1";
const CORE = ["/", "/manifest.json"];

// Install
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});

// Activate
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: ONLY handle navigation requests (HTML). Let assets pass through.
self.addEventListener("fetch", (event) => {
  const req = event.request;

  // Only for page navigation
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match("/");
        return cached || new Response("Offline", { status: 200 });
      })
    );
  }
});

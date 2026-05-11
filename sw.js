const CACHE_NAME = "balhadj-farm-shell-20260511-production-readiness";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./index.html?v=20260511-production-readiness",
  "./styles/app.css?v=20260511-production-readiness",
  "./js/app.js?v=20260511-production-readiness",
  "./manifest.webmanifest?v=20260511-production-readiness",
  "./vendor/chart.umd.min.js?v=20260511-production-readiness",
  "./assets/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;
  if (requestUrl.pathname.endsWith("/js/runtime-config.js") || requestUrl.pathname.endsWith("js/runtime-config.js")) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html?v=20260511-production-readiness"));

      return cached || networkFetch;
    }),
  );
});

// Quant Plus service worker. It caches the application shell and static assets
// so the terminal opens offline and can show the last verified state saved by
// the app. It never intercepts API calls or non-GET requests, so no trading,
// account or market data is ever served from this cache.
const VERSION = "qp-shell-v1";
const STATIC = /\.(?:js|css|woff2?|svg|png|ico|webmanifest)$/;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

function remember(request, response) {
  if (response.ok) {
    const copy = response.clone();
    caches.open(VERSION).then((cache) => cache.put(request, copy));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => remember(request, response))
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit || caches.match("/app/dashboard"))
            .then(
              (hit) =>
                hit ||
                new Response("Quant Plus is offline and this page has not been opened before.", {
                  status: 503,
                  headers: { "Content-Type": "text/plain; charset=utf-8" },
                }),
            ),
        ),
    );
    return;
  }
  if (STATIC.test(url.pathname)) {
    event.respondWith(
      caches
        .match(request)
        .then((hit) => hit || fetch(request).then((response) => remember(request, response))),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/app/alerts";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => "focus" in w);
      return open ? open.focus() : self.clients.openWindow(target);
    }),
  );
});

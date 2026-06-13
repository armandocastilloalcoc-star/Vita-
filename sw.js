/* Vita service worker v2 — red primero para el código (siempre lo último),
   caché solo como respaldo offline. Nunca toca /api ni /mcp. */
const VERSION = "vita-v2";
const PRECACHE = [
  "/", "/index.html", "/app.js", "/vita-cloud.js",
  "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png",
  "https://unpkg.com/react@18/umd/react.production.min.js",
  "https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then((c) =>
    Promise.allSettled(PRECACHE.map((u) => c.add(new Request(u, { mode: "no-cors" }))))
  ));
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/mcp")) return;

  // Mismo origen (HTML, app.js, vita-cloud.js, iconos): RED PRIMERO.
  if (url.origin === location.origin) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((r) => r || caches.match("/index.html")))
    );
    return;
  }

  // CDN externos (React): stale-while-revalidate.
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

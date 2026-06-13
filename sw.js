/* Vita service worker — seguro y auto-actualizable.
   - Nunca intercepta /api ni /mcp (siempre red).
   - Navegación/HTML: red primero, cae a caché solo si offline.
   - Estáticos same-origin y libs CDN: stale-while-revalidate.
   - Versiona el caché; limpia los viejos al activar. */
const VERSION = "vita-v1";
const PRECACHE = [
  "/", "/index.html", "/vita-cloud.js", "/app.js",
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
  // Nunca tocar el backend ni datos dinámicos.
  if (url.pathname.startsWith("/api") || url.pathname.startsWith("/mcp")) return;

  // Navegación / HTML: red primero (para recibir actualizaciones), caché si offline.
  if (req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html")) {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put("/index.html", copy)).catch(() => {});
        return res;
      }).catch(() => caches.match("/index.html").then((r) => r || caches.match("/")))
    );
    return;
  }

  // Resto de GET: stale-while-revalidate.
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

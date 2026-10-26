// Service worker de Soft_Inmo: permite instalar la app y muestra un aviso cuando no hay conexión.
// No guarda datos de la empresa: todo lo que pasa por /api va siempre a la red.
const CACHE = "softinmo-v1";
const OFFLINE = "/sin-conexion";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, "/icon-192.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).pathname.startsWith("/api/")) return;
  // Solo las navegaciones tienen respaldo: sin red se muestra la página de aviso.
  if (req.mode === "navigate") event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
});

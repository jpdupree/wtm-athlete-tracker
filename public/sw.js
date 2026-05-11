// Service worker for WTM Tracker.
//   - Pre-caches the app shell on install (top-level routes + brand assets)
//   - Network-first for /api/* (live data wins online, cache rescues offline)
//     and only caches 2xx responses so we don't lock in errors/redirects
//   - Cache-first for everything else (HTML, JS, CSS, icons, logos)
//
// Bump CACHE when the SHELL list or the caching strategy changes — the
// activate handler deletes any older caches so the new shell wins.

const CACHE = "wtm-v2";
const SHELL = [
  "/",
  "/add",
  "/map",
  "/pace",
  "/manifest.webmanifest",
  "/icon.svg",
  "/logo-light.png",
  "/logo-dark.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          // Only cache real successes so a transient 5xx doesn't poison
          // the offline fallback for the next 15s+ of polling.
          if (res.ok && res.status === 200) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() =>
          caches.match(e.request).then(
            (r) =>
              r ??
              new Response(JSON.stringify({ error: "offline" }), {
                status: 503,
                headers: { "content-type": "application/json" },
              }),
          ),
        ),
    );
    return;
  }

  e.respondWith(
    caches.match(e.request).then(
      (cached) =>
        cached ??
        fetch(e.request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        }),
    ),
  );
});

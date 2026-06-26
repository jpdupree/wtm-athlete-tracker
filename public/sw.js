// Service worker for WTM Tracker.
//
//   - Pre-caches the app shell on install (top-level routes + brand assets)
//   - /api/*  : network-first, cache only 2xx (live data wins; cache
//               rescues offline)
//   - /a/<bib>: cache-first with background refresh; self-contained
//               offline fallback when a bib was never warmed
//   - navigations (HTML): NETWORK-FIRST, cache fallback. A new deploy
//               wins immediately instead of being pinned to stale HTML
//               that may reference purged JS chunks.
//   - everything else (Next chunks, CSS, icons, course GeoJSON):
//               cache-first with a SAFE network fallback that NEVER
//               resolves respondWith() to `undefined` — doing so makes
//               the browser treat the request as a hard network error,
//               which previously bricked lazy-loaded chunks (e.g. the
//               course map) until the user manually cleared site data.
//
// Bump CACHE on any deploy that changes this file or the SHELL list; the
// activate handler purges older caches so the new version wins.

const CACHE = "wtm-v29";

const OFFLINE_ATHLETE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Athlete not cached · WTM Tracker</title><style>:root{color-scheme:dark}html,body{background:#0a0a0a;color:#f5f5f4;margin:0;font-family:-apple-system,system-ui,sans-serif}main{max-width:28rem;margin:0 auto;padding:1.5rem 1rem;line-height:1.4}.back{display:inline-flex;align-items:center;gap:.25rem;color:#a3a3a3;text-decoration:none;font-size:.7rem;letter-spacing:.1em;text-transform:uppercase}.back .arrow{color:#ff6b14}.callout{margin-top:1.25rem;padding:.75rem 1rem;border:1px solid #ff6b14;background:rgba(255,107,20,.18);border-radius:.5rem}.callout h1{margin:0 0 .5rem;font-size:1rem}.callout p{margin:.25rem 0;font-size:.8rem;opacity:.85}.actions{margin-top:1rem}.btn{display:inline-block;padding:.6rem 1rem;border:1px solid rgba(255,255,255,.4);border-radius:.4rem;text-decoration:none;color:#f5f5f4;font-size:.8rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em}</style></head><body><main><a class="back" href="/"><span class="arrow">←</span> Home</a><div class="callout"><h1>Athlete not cached</h1><p>This athlete's data hasn't been loaded for offline use yet.</p><p>Open this page once while you have a connection — then it'll work offline too.</p></div><div class="actions"><a class="btn" href="/">Back to followed list</a></div></main></body></html>`;

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

function cachePut(request, response) {
  if (response && response.ok) {
    const copy = response.clone();
    caches.open(CACHE).then((c) => c.put(request, copy));
  }
}

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin) return;

  // ---- /api/* : network-first ----
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(e.request);
          if (res.status === 200) cachePut(e.request, res);
          return res;
        } catch {
          const cached = await caches.match(e.request);
          return (
            cached ??
            new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "content-type": "application/json" },
            })
          );
        }
      })(),
    );
    return;
  }

  // ---- /a/<bib> : cache-first + background refresh + offline fallback ----
  if (url.pathname.startsWith("/a/")) {
    e.respondWith(
      (async () => {
        const cached = await caches.match(e.request);
        if (cached) {
          fetch(e.request).then((res) => cachePut(e.request, res)).catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(e.request);
          cachePut(e.request, res);
          return res;
        } catch {
          return new Response(OFFLINE_ATHLETE_HTML, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      })(),
    );
    return;
  }

  // ---- navigations (HTML) : network-first so deploys land immediately ----
  if (e.request.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const res = await fetch(e.request);
          cachePut(e.request, res);
          return res;
        } catch {
          const cached = await caches.match(e.request);
          return cached ?? (await caches.match("/")) ?? Response.error();
        }
      })(),
    );
    return;
  }

  // ---- static assets (Next chunks, CSS, icons, GeoJSON) : cache-first,
  //      SAFE network fallback (never resolves to undefined) ----
  e.respondWith(
    (async () => {
      const cached = await caches.match(e.request);
      if (cached) {
        // Refresh non-hashed assets (e.g. the course GeoJSON) in the
        // background; failures are harmless.
        fetch(e.request).then((res) => cachePut(e.request, res)).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(e.request);
        cachePut(e.request, res);
        return res;
      } catch {
        return Response.error();
      }
    })(),
  );
});

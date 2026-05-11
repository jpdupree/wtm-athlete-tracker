// Service worker for WTM Tracker.
//   - Pre-caches the app shell on install (top-level routes + brand assets)
//   - Network-first for /api/* (live data wins online, cache rescues
//     offline) and only caches 2xx responses so we don't lock in
//     errors/redirects
//   - Stale-while-revalidate for HTML pages and everything else: serve
//     the cached response immediately for snappy loads, and refresh in
//     the background so the NEXT visit gets the latest deploy. Avoids
//     the previous trap where users were stuck on whatever HTML was in
//     the cache until I manually bumped the version on every deploy.
//
// Bump CACHE when the SHELL list itself changes — the activate handler
// deletes older caches so the new shell wins for clients that already
// have an older version.

const CACHE = "wtm-v6";

// Offline fallback HTML for an athlete page that hasn't been warmed into
// the cache. Self-contained — inlines its own styles so it doesn't depend
// on any Next.js chunks (which won't have loaded either).
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

  // Athlete detail pages — /a/<bib> — are dynamic so they can't be in
  // the pre-cached shell. Cache-first when possible; on a miss, try the
  // network; if THAT also fails (offline + never visited this bib),
  // return a small self-contained "not cached" HTML rather than another
  // athlete's HTML — falling back to a different bib's cached response
  // caused the wrong athlete to load with the requested URL in the bar.
  if (url.pathname.startsWith("/a/")) {
    e.respondWith(
      caches.match(e.request).then(async (cached) => {
        if (cached) {
          // Stale-while-revalidate: refresh in the background so the next
          // online hit gets fresh HTML (after a redeploy).
          fetch(e.request)
            .then((res) => {
              if (res.ok) {
                const copy = res.clone();
                caches.open(CACHE).then((c) => c.put(e.request, copy));
              }
            })
            .catch(() => {});
          return cached;
        }
        try {
          const res = await fetch(e.request);
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        } catch {
          return new Response(OFFLINE_ATHLETE_HTML, {
            status: 200,
            headers: { "content-type": "text/html; charset=utf-8" },
          });
        }
      }),
    );
    return;
  }

  // Stale-while-revalidate for shell pages, JS chunks, CSS, icons, etc.
  // Serve the cached copy immediately if we have one (fast / works
  // offline), but ALSO fire a network fetch in the background and
  // replace the cache so the next visit sees the new content. This
  // means a deploy with no SHELL changes propagates in one extra page
  // load instead of requiring a manual CACHE bump.
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const networkPromise = fetch(e.request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(e.request, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached ?? networkPromise;
    }),
  );
});

# WTM Athlete Tracker

Next.js 15 PWA for following athletes at World's Toughest Mudder 2026.

- **Race start**: 2026-06-27 12:00 BST (`2026-06-27T11:00Z`)
- **Last lap can start until**: 2026-06-28 12:00 BST
- **Latest possible finish**: 2026-06-28 13:30 BST (start + 25.5h)
- **Lap distance**: 5 miles

All user data (followed athletes, fuel logs, manual laps, notes) lives in
IndexedDB on the device — no auth, no server-side storage of user data.

## Dev

```bash
npm install
npm run dev   # http://localhost:3000
```

The proxy at `/api/results/[slice]` (`overall | men | women | teams`) serves
the live RaceResult feed when `RACE_FEED_*` env vars are set, otherwise serves
`mocks/raceresult-348237.json` so the UI works offline. Responses are cached
server-side for 15s via Vercel KV; an in-memory `Map` fallback runs when
`KV_REST_API_*` are unset, so dev needs zero secrets.

## Routes

| Path | What |
|---|---|
| `/` | Followed-athletes list, links to add / map / external sites |
| `/add` | Search start list by name or bib; manual fallback for off-roster athletes |
| `/a/[bib]` | Athlete detail: live status, countdowns, goal miles, finish prediction, lap cards |
| `/map` | Predicted progress per athlete (real Leaflet map lands once GPX arrives) |
| `/api/results/[slice]` | Cached, normalized RaceResult proxy |

## Architecture

- **Server proxy** (`src/lib/raceFeed.ts`): fetches each slice URL, normalizes
  fields (string→number, h:mm:ss→sec, TOD→ISO assuming venue is BST), derives
  `gender` from which slice URL was hit, caches in KV with a 15s freshness
  window.
- **`FeedProvider`** hoists `useFeed("overall")` into context so the polling
  loop runs once per session, not once per consumer.
- **`LapSyncProvider`** runs app-wide. Every API poll, for every followed bib,
  it calls `syncBibLaps` to write per-lap rows into Dexie. The latest lap is
  timestamped with `lastSeenAt`; older laps preserve any manually-entered
  timestamps; manual rows are upgraded to `source:'api'` once API confirms.
- **Dexie** (`src/lib/db.ts`): tables `followed`, `laps`, `fuel`, `notes`,
  `meta`. Fuel and notes are keyed by `[bib+lapNumber]` so they survive
  reconciliation overwrites of the lap row.
- **Service worker** (`public/sw.js`): pre-caches the app shell, network-first
  for `/api/*` (cache rescues offline), cache-first for everything else.

## Race-day env vars (Vercel)

```
RACE_FEED_OVERALL=https://api.raceresult.com/<event>/<key>?...overall
RACE_FEED_MEN=...
RACE_FEED_WOMEN=...
RACE_FEED_TEAMS=...
KV_REST_API_URL=...
KV_REST_API_TOKEN=...
```

## Pre-race punch list

Things still TODO before the 2026 race that I couldn't do from the planning
context. Listed in roughly the order they need to happen.

1. **Fill in the three external link URLs in `src/app/page.tsx`** — RaceResult
   public results page, theocrreport.com event page, OCR Report YouTube
   channel. Currently `href="#"` placeholders because I shouldn't guess URLs.
2. **Get the four RaceResult feed URLs** from the event organisers and set
   `RACE_FEED_{OVERALL,MEN,WOMEN,TEAMS}` in Vercel (and `.env.local` for dev
   testing against live data).
3. **Migrate `@vercel/kv` → `@upstash/redis`.** `@vercel/kv` v3 is deprecated.
   Functionally equivalent swap in `src/lib/kv.ts` (~10 lines). Then install
   the Upstash Redis integration from the Vercel marketplace and pull its
   env vars (`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`).
4. **Confirm RaceResult `LastSeenTOD` timezone.** The normalizer assumes BST
   (UTC+1) at the venue. The 2024 mock was a US race in EST so its mock
   timestamps render ~6h offset; that's harmless for dev but verify against
   the live 2026 feed early — if they publish UTC, drop the `h - 1` shift in
   `parseTodToISO` (`src/lib/raceFeed.ts`).
5. **Real PWA icons.** `public/icon.svg` is a stand-in. Generate 192/512 PNG
   variants (e.g. with `pwa-asset-generator`) and add them to the manifest;
   not all platforms are happy with SVG-only manifests.
6. **GPX from Tough Mudder.** Once received, replace the `/map` progress-bar
   view with a real Leaflet (or MapLibre) map. The `predictPosition` helper
   already returns `fraction ∈ [0,1]`, so marker placement is just
   `course.coordinateAt(fraction)`.
7. **Service worker dress rehearsal.** SW only registers in
   `NODE_ENV=production` and needs HTTPS to actually run. Test on a real
   device after the Vercel deploy: install to Home Screen, kill network,
   confirm the app shell still loads and last-known feed renders.
8. **Edge-case sanity check on lap reconciliation.** If officials ever
   *decrease* a bib's lap count (unlikely but possible), `syncBibLaps`
   leaves stale "ahead" rows in Dexie. If you see this in dress rehearsal,
   add a cleanup pass that deletes `db.laps where bib=X and lapNumber>currentLaps`.

## Build order recap (shipped)

1. ✅ Scaffold + Vercel + KV cache + one proxy
2. ✅ All 4 proxies + polling hook + start-list view
3. ✅ Add-athlete flow + Dexie wired up
4. ✅ Athlete detail page (countdowns, goal, prediction, lap+pit cards)
5. ✅ Manual lap entry + API reconciliation
6. ✅ Course view + PWA polish (manifest, icon, SW)
7. ✅ Pit timing UI + this README; map upgrade pending GPX

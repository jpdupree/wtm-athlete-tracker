# WTM Athlete Tracker

Next.js 15 PWA-in-progress for following athletes at World's Toughest Mudder 2026 (race start: 2026-06-27 12:00 BST).

## Dev

```bash
npm install
npm run dev
```

Then visit http://localhost:3000.

The proxy at `/api/results/[slice]` (`slice` ∈ `overall | men | women | teams`) serves the live RaceResult feed when `RACE_FEED_*` env vars are set, otherwise serves `mocks/raceresult-348237.json` so the UI works offline. Responses are cached server-side for 15s via Vercel KV; when `KV_REST_API_*` are unset, an in-memory `Map` is used instead.

Copy `.env.example` to `.env.local` and fill in URLs to test against live data.

## Race constants

See `src/lib/race.ts`:

| Constant | Value |
|---|---|
| `RACE_START` | 2026-06-27T11:00Z (12:00 BST) |
| `LAST_LAP_START_CUTOFF` | 2026-06-28T11:00Z (start + 24h) |
| `RACE_END` | 2026-06-28T12:30Z (start + 25.5h) |
| `LAP_MILES` | 5 |

## Build order

1. **Week 1 (now)** — scaffold, KV cache, one proxy end-to-end.
2. Week 2 — all 4 proxies, polling hook, start-list view.
3. Week 3 — add-athlete flow, Dexie wired up.
4. Week 4 — athlete detail page.
5. Week 5 — manual lap entry + reconciliation.
6. Week 6 — map + PWA polish.
7. Week 7 — dress rehearsal.

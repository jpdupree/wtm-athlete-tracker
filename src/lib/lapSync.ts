import { db, type Lap } from "./db";
import type { Athlete, Passing } from "./types";

export const lapId = (bib: number, lapNumber: number): string =>
  `${bib}:${lapNumber}`;

// Synthesize per-lap rows from the latest API snapshot of an athlete row.
// The API only tells us lap COUNT and the most recent crossing time, so:
//  - we can timestamp the latest lap with lastSeenAt;
//  - older laps stay with whatever timestamps the user has already entered manually;
//  - manual rows are upgraded to source='api' once the API confirms that lap.
export async function syncBibLaps(row: Athlete): Promise<void> {
  if (row.laps <= 0) return;
  const ts = row.lastSeenAt ?? new Date().toISOString();
  for (let n = 1; n <= row.laps; n++) {
    const id = lapId(row.bib, n);
    const prior = await db.laps.get(id);
    if (prior?.source === "api" && !prior.provisional) continue;
    const next: Lap = {
      id,
      bib: row.bib,
      lapNumber: n,
      lapStartedAt: prior?.lapStartedAt ?? null,
      lapCompletedAt: n === row.laps ? ts : (prior?.lapCompletedAt ?? null),
      pitStartedAt: prior?.pitStartedAt ?? null,
      pitCompletedAt: prior?.pitCompletedAt ?? null,
      source: "api",
      provisional: false,
    };
    await db.laps.put(next);
  }
}

// Full per-lap history from the passings feed. Unlike syncBibLaps which only
// stamps the latest lap, this stamps every lap that has a passing — fixing
// cold-load gaps for older laps. When the passing carries pitSec/lapSec, we
// also stamp the pit + lap windows so StatsGrid / LapStrip can show pit times.
export async function syncBibLapsFromPassings(
  bib: number,
  passings: Passing[],
): Promise<void> {
  if (passings.length === 0) return;

  // Read all priors in ONE bulk call, then accumulate the writes that
  // actually differ and flush in ONE bulkPut. Previous per-lap get/put
  // pairs created N*2 IndexedDB transactions per athlete, which compounded
  // across followed athletes was enough to starve other writes (e.g.
  // saving a goal would hang behind a passings sync on slower devices).
  const ids = passings.map((p) => lapId(bib, p.lapNumber));
  const priors = await db.laps.bulkGet(ids);
  const writes: Lap[] = [];

  for (let i = 0; i < passings.length; i++) {
    const p = passings[i];
    const id = ids[i];
    const prior = priors[i];

    // Compute window timestamps from durations when we have them.
    // For lap N: completedAt is the end; lapStartedAt = completedAt - lapSec;
    // pitCompletedAt = lapStartedAt; pitStartedAt = pitCompletedAt - pitSec.
    let lapStartedAt = prior?.lapStartedAt ?? null;
    let pitStartedAt = prior?.pitStartedAt ?? null;
    let pitCompletedAt = prior?.pitCompletedAt ?? null;
    if (p.lapSec != null) {
      const endMs = new Date(p.completedAt).getTime();
      const lapStartMs = endMs - p.lapSec * 1000;
      lapStartedAt = new Date(lapStartMs).toISOString();
      if (p.pitSec != null && p.pitSec > 0) {
        pitCompletedAt = lapStartedAt;
        pitStartedAt = new Date(lapStartMs - p.pitSec * 1000).toISOString();
      } else if (p.pitSec === 0) {
        // Explicit "no pit before this lap" (e.g. lap 1). Clear stale data.
        pitStartedAt = null;
        pitCompletedAt = null;
      }
    }

    if (
      prior?.source === "api" &&
      !prior.provisional &&
      prior.lapCompletedAt === p.completedAt &&
      prior.lapStartedAt === lapStartedAt &&
      prior.pitStartedAt === pitStartedAt &&
      prior.pitCompletedAt === pitCompletedAt
    ) {
      continue;
    }

    writes.push({
      id,
      bib,
      lapNumber: p.lapNumber,
      lapStartedAt,
      lapCompletedAt: p.completedAt,
      pitStartedAt,
      pitCompletedAt,
      source: "api",
      provisional: false,
    });
  }

  if (writes.length > 0) {
    await db.laps.bulkPut(writes);
  }
}

export async function markLapManual(bib: number, lapNumber: number): Promise<void> {
  const id = lapId(bib, lapNumber);
  const prior = await db.laps.get(id);
  if (prior?.source === "api") return; // never overwrite confirmed API row
  const next: Lap = {
    id,
    bib,
    lapNumber,
    lapStartedAt: prior?.lapStartedAt ?? null,
    lapCompletedAt: new Date().toISOString(),
    pitStartedAt: prior?.pitStartedAt ?? null,
    pitCompletedAt: prior?.pitCompletedAt ?? null,
    source: "manual",
    provisional: true,
  };
  await db.laps.put(next);
}

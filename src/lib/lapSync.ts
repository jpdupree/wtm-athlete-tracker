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
  // An empty response is treated as "probably transient" — keep what we
  // have rather than nuke confirmed history on a flaky poll. Real
  // truncations (sim window shifts, retracted timing data) only fire when
  // the API returns SOME laps but fewer than we have locally.
  if (passings.length === 0) return;

  // Read everything we currently have for this bib once, then compute
  // both the writes (rows whose timestamps changed) and the deletes
  // (api-sourced rows the new passings no longer include) in memory, and
  // flush both in a single rw transaction.
  const existing = await db.laps.where("bib").equals(bib).toArray();
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const validIds = new Set(passings.map((p) => lapId(bib, p.lapNumber)));

  const writes: Lap[] = [];
  for (const p of passings) {
    const id = lapId(bib, p.lapNumber);
    const prior = existingById.get(id);

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

  // Prune api-source rows the new passings no longer include. Manual rows
  // are left alone — those belong to the user, not the feed.
  const toDelete = existing
    .filter((l) => l.source === "api" && !validIds.has(l.id))
    .map((l) => l.id);

  if (writes.length === 0 && toDelete.length === 0) return;

  await db.transaction("rw", db.laps, async () => {
    if (writes.length > 0) await db.laps.bulkPut(writes);
    if (toDelete.length > 0) await db.laps.bulkDelete(toDelete);
  });
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

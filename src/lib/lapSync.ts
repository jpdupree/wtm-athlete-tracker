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
// stamps the latest lap, this stamps every lap that has a passing.
//
// Storage convention (changed in this revision): the pit FOLLOWING a lap
// is stored on that lap's row. So "pit 1" — the rest between lap 1 and lap
// 2 — lives on lap 1's record. The Passing for lap K carries the pit
// duration BEFORE lap K (the wire-format from RaceResult); we shift that
// pit onto lap K-1's row at sync time.
export async function syncBibLapsFromPassings(
  bib: number,
  passings: Passing[],
): Promise<void> {
  // An empty response is treated as "probably transient" — keep what we
  // have rather than nuke confirmed history on a flaky poll. Real
  // truncations (sim window shifts, retracted timing data) only fire when
  // the API returns SOME laps but fewer than we have locally.
  if (passings.length === 0) return;

  const sorted = [...passings].sort((a, b) => a.lapNumber - b.lapNumber);

  // Read everything we currently have for this bib once, then compute
  // both the writes (rows whose timestamps changed) and the deletes
  // (api-sourced rows the new passings no longer include) in memory, and
  // flush both in a single rw transaction.
  const existing = await db.laps.where("bib").equals(bib).toArray();
  const existingById = new Map(existing.map((r) => [r.id, r]));
  const validIds = new Set(sorted.map((p) => lapId(bib, p.lapNumber)));

  const writes: Lap[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const next = sorted[i + 1]; // for the pit AFTER this lap
    const id = lapId(bib, p.lapNumber);
    const prior = existingById.get(id);

    // Lap window: end is p.completedAt; start = end - lapSec.
    let lapStartedAt = prior?.lapStartedAt ?? null;
    if (p.lapSec != null) {
      const endMs = new Date(p.completedAt).getTime();
      lapStartedAt = new Date(endMs - p.lapSec * 1000).toISOString();
    }

    // Pit window: the pit AFTER this lap. Its DURATION comes from the
    // *next* passing's pitSec (the API reports each pit as "before lap
    // K+1"); we anchor pitStartedAt to this lap's completedAt and add
    // that duration to get pitCompletedAt.
    let pitStartedAt = prior?.pitStartedAt ?? null;
    let pitCompletedAt = prior?.pitCompletedAt ?? null;
    if (next) {
      if (next.pitSec != null && next.pitSec > 0) {
        pitStartedAt = p.completedAt;
        const pitEndMs = new Date(p.completedAt).getTime() + next.pitSec * 1000;
        pitCompletedAt = new Date(pitEndMs).toISOString();
      } else if (next.pitSec === 0) {
        pitStartedAt = null;
        pitCompletedAt = null;
      }
    } else {
      // Last known lap — no pit AFTER yet (athlete is mid-pit or still
      // out). Clear any stale pit values we previously wrote here.
      pitStartedAt = null;
      pitCompletedAt = null;
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

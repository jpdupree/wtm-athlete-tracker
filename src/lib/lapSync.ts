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
// cold-load gaps for older laps.
export async function syncBibLapsFromPassings(
  bib: number,
  passings: Passing[],
): Promise<void> {
  for (const p of passings) {
    const id = lapId(bib, p.lapNumber);
    const prior = await db.laps.get(id);
    if (
      prior?.source === "api" &&
      !prior.provisional &&
      prior.lapCompletedAt === p.completedAt
    ) {
      continue;
    }
    const next: Lap = {
      id,
      bib,
      lapNumber: p.lapNumber,
      lapStartedAt: prior?.lapStartedAt ?? null,
      lapCompletedAt: p.completedAt,
      pitStartedAt: prior?.pitStartedAt ?? null,
      pitCompletedAt: prior?.pitCompletedAt ?? null,
      source: "api",
      provisional: false,
    };
    await db.laps.put(next);
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

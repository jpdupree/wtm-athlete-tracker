import { RACE_END, RACE_START } from "./race";
import type { Athlete } from "./types";

export type Position = {
  state: "pre-race" | "racing" | "ended" | "no-data";
  currentLap: number;
  fraction: number;
  avgLapSec: number | null;
  etaMsToLapEnd: number | null;
};

// Predict where an athlete is in their current in-progress lap.
//   fraction = (now - lastLapCompletedAt) / avgLapSec, clamped 0..1
// Without a per-athlete avg, we can't guess fraction; the UI shows "—".
export function predictPosition(opts: {
  row: Athlete | null;
  now: number;
  lastLapCompletedAtMs: number | null;
}): Position {
  if (opts.now < RACE_START.getTime()) {
    return {
      state: "pre-race",
      currentLap: 0,
      fraction: 0,
      avgLapSec: null,
      etaMsToLapEnd: null,
    };
  }
  if (opts.now > RACE_END.getTime()) {
    return {
      state: "ended",
      currentLap: opts.row?.laps ?? 0,
      fraction: 1,
      avgLapSec: null,
      etaMsToLapEnd: null,
    };
  }
  if (!opts.row) {
    return {
      state: "no-data",
      currentLap: 1,
      fraction: 0,
      avgLapSec: null,
      etaMsToLapEnd: null,
    };
  }

  const laps = opts.row.laps;
  const totalSec = opts.row.totalSec ?? 0;
  const avgLapSec = laps > 0 && totalSec > 0 ? totalSec / laps : null;
  const lapStartMs = opts.lastLapCompletedAtMs ?? RACE_START.getTime();
  const elapsedSec = (opts.now - lapStartMs) / 1000;
  const fraction = avgLapSec
    ? Math.max(0, Math.min(1, elapsedSec / avgLapSec))
    : 0;
  const etaMsToLapEnd = avgLapSec
    ? Math.max(0, avgLapSec * 1000 - (opts.now - lapStartMs))
    : null;

  return {
    state: "racing",
    currentLap: laps + 1,
    fraction,
    avgLapSec,
    etaMsToLapEnd,
  };
}

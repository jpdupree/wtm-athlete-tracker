import { LAP_MILES, RACE_END, RACE_START } from "./race";

// Median lap-to-lap wall-clock ratios (pit + run) computed from
// test/fixtures/lap_details_individual.csv across all 603 individual + team
// member entrants in WTM 2025 Belvoir. Index k = the K→K+1 transition.
//   k=0 → lap1 → lap2 (median 1.349 — partly the first pit being inserted)
//   k=8 → lap9 → lap10 (median ~1.0; settled into pace)
//   k>14 → small sample (n<32) — clipped to 1.0 to avoid late-race noise.
// For athletes deeper than this table goes, fade stays at neutral.
const FADE_RATIOS: number[] = [
  1.349, 1.267, 1.146, 1.136, 1.145,
  1.117, 1.094, 1.059, 1.002, 1.054,
  0.993, 0.986, 1.010, 1.013, 0.988,
];

// Cumulative slowdown going from `fromLap` pace to lap K pace, based on
// historical medians. Returns 1.0 when K <= fromLap or when off-table.
export function fadeFactor(fromLap: number, toLap: number): number {
  if (toLap <= fromLap) return 1;
  let f = 1;
  for (let k = fromLap; k < toLap; k++) {
    const idx = k - 1; // FADE_RATIOS[0] is the 1→2 transition
    if (idx < 0) continue;
    f *= idx < FADE_RATIOS.length ? FADE_RATIOS[idx] : 1;
  }
  return f;
}

export type Prediction = {
  goalLaps: number;
  remainingLaps: number;
  // Pace used to extrapolate the remaining laps. When lapSecs is supplied,
  // this is the trailing-window average; otherwise it falls back to
  // totalSec / laps (the cumulative average).
  avgLapSec: number;
  // Number of laps the trailing avg covers (0 = cumulative avg).
  trailingSamples: number;
  predictedFinish: Date;
  marginMs: number;
  withinRaceWindow: boolean;
};

const DEFAULT_TRAIL = 3;

export function predict(opts: {
  totalSec: number;
  laps: number;
  goalMiles: number | null;
  // Optional per-lap wall-clock-per-lap durations in seconds (pit + running),
  // ordered by lap number. When supplied, the prediction extrapolates the
  // remaining laps at the trailing average so a fading athlete's projection
  // doesn't keep getting more optimistic than their recent pace.
  lapSecs?: number[];
  trail?: number;
}): Prediction | null {
  if (opts.goalMiles == null || opts.laps <= 0 || opts.totalSec <= 0) return null;

  const goalLaps = Math.ceil(opts.goalMiles / LAP_MILES);
  const remaining = Math.max(0, goalLaps - opts.laps);

  const trail = Math.max(1, opts.trail ?? DEFAULT_TRAIL);
  let avg: number;
  let trailingSamples = 0;
  if (opts.lapSecs && opts.lapSecs.length > 0) {
    const recent = opts.lapSecs.slice(-trail);
    avg = recent.reduce((s, x) => s + x, 0) / recent.length;
    trailingSamples = recent.length;
  } else {
    avg = opts.totalSec / opts.laps;
  }

  // Past elapsed time (totalSec) is what it is — only extrapolate the
  // remaining laps. Each remaining lap is scaled by its historical fade
  // factor relative to the athlete's current pace, so an early-race
  // projection accounts for the well-known initial slowdown (mostly the
  // first pit settling in) instead of flat-extrapolating fresh-legs pace.
  let projectedRemainingSec = 0;
  for (let k = opts.laps + 1; k <= goalLaps; k++) {
    projectedRemainingSec += avg * fadeFactor(opts.laps, k);
  }
  const finishSec = opts.totalSec + projectedRemainingSec;
  const finishMs = RACE_START.getTime() + finishSec * 1000;

  return {
    goalLaps,
    remainingLaps: remaining,
    avgLapSec: avg,
    trailingSamples,
    predictedFinish: new Date(finishMs),
    marginMs: RACE_END.getTime() - finishMs,
    withinRaceWindow: finishMs <= RACE_END.getTime(),
  };
}

export type PaceStatus = "green" | "amber" | "red";

// Comfortable buffer over the race-end cutoff. Tight finishes flip amber.
export const PACE_BUFFER_MS = 30 * 60 * 1000;

// Classify a (totalSec, laps) snapshot relative to the goal: would the
// athlete hit goal-miles before race end, and with how much margin?
//   green: on pace with >= 30min margin (or already at goal)
//   amber: on pace but margin < 30min
//   red:   projected to miss race-end
// Returns null when we can't predict (no goal, no laps, no time).
export function paceStatus(opts: {
  totalSec: number;
  laps: number;
  goalMiles: number | null;
  lapSecs?: number[];
  trail?: number;
}): PaceStatus | null {
  const p = predict(opts);
  if (!p) return null;
  if (p.remainingLaps <= 0) return "green"; // already at/past goal
  if (p.marginMs < 0) return "red";
  if (p.marginMs < PACE_BUFFER_MS) return "amber";
  return "green";
}

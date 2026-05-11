import { LAP_MILES, RACE_END, RACE_START } from "./race";

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
  // remaining laps at the trailing/current pace.
  const finishSec = opts.totalSec + remaining * avg;
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

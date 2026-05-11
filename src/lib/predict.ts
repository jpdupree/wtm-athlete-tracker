import { LAP_MILES, RACE_END, RACE_START } from "./race";

export type Prediction = {
  goalLaps: number;
  remainingLaps: number;
  avgLapSec: number;
  predictedFinish: Date;
  marginMs: number;
  withinRaceWindow: boolean;
};

export function predict(opts: {
  totalSec: number;
  laps: number;
  goalMiles: number | null;
}): Prediction | null {
  if (opts.goalMiles == null || opts.laps <= 0 || opts.totalSec <= 0) return null;
  const avg = opts.totalSec / opts.laps;
  const goalLaps = Math.ceil(opts.goalMiles / LAP_MILES);
  const remaining = Math.max(0, goalLaps - opts.laps);
  const finishMs = RACE_START.getTime() + avg * goalLaps * 1000;
  return {
    goalLaps,
    remainingLaps: remaining,
    avgLapSec: avg,
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
}): PaceStatus | null {
  const p = predict(opts);
  if (!p) return null;
  if (p.remainingLaps <= 0) return "green"; // already at/past goal
  if (p.marginMs < 0) return "red";
  if (p.marginMs < PACE_BUFFER_MS) return "amber";
  return "green";
}

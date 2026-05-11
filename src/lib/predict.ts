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

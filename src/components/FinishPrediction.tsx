"use client";

import { fmtSec, fmtVenueClock } from "@/lib/format";
import { predict } from "@/lib/predict";

export function FinishPrediction({
  totalSec,
  laps,
  goalMiles,
}: {
  totalSec: number;
  laps: number;
  goalMiles: number | null;
}) {
  const p = predict({ totalSec, laps, goalMiles });
  if (!p) {
    return (
      <div className="rounded-lg border border-dashed border-current/20 px-4 py-3 text-sm opacity-70">
        {goalMiles == null
          ? "Set a goal to see a finish prediction."
          : "Need at least one completed lap before predicting."}
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-current/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wide opacity-60">Predicted finish (current pace)</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">
        {fmtVenueClock(p.predictedFinish)}
      </p>
      <p className="text-xs opacity-70">
        {p.remainingLaps} laps to go · avg {fmtSec(Math.round(p.avgLapSec))}/lap{" "}
        {p.withinRaceWindow ? (
          <span className="text-green-500">· within race window</span>
        ) : (
          <span className="text-red-500">· past race end</span>
        )}
      </p>
    </div>
  );
}

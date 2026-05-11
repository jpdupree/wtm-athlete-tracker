"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtCountdown, fmtSec, fmtVenueClock } from "@/lib/format";
import { predict } from "@/lib/predict";
import { RACE_START } from "@/lib/race";

export function FinishPrediction({
  bib,
  totalSec,
  laps,
  goalMiles,
}: {
  bib: number;
  totalSec: number;
  laps: number;
  goalMiles: number | null;
}) {
  const lapRows = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );

  // Wall-clock per lap (pit + running) derived from lapCompletedAt deltas.
  // Trailing avg of these is more honest about fading pace than totalSec/laps.
  const lapDurations: number[] = [];
  let prevEndMs = RACE_START.getTime();
  for (const l of lapRows ?? []) {
    if (!l.lapCompletedAt) continue;
    const endMs = new Date(l.lapCompletedAt).getTime();
    lapDurations.push((endMs - prevEndMs) / 1000);
    prevEndMs = endMs;
  }

  const p = predict({
    totalSec,
    laps,
    goalMiles,
    lapSecs: lapDurations.length > 0 ? lapDurations : undefined,
  });

  if (!p) {
    return (
      <div className="rounded-lg border border-dashed border-current/20 px-4 py-3 text-sm opacity-70">
        {goalMiles == null
          ? "Set a goal to see whether they can hit it before the race ends."
          : "Need at least one completed lap before predicting."}
      </div>
    );
  }

  if (p.remainingLaps <= 0) {
    return (
      <div className="rounded-lg border border-green-600/40 bg-green-600/10 px-4 py-3">
        <p className="text-xs uppercase tracking-wide opacity-60">Goal status</p>
        <p className="mt-1 text-lg font-semibold">Goal reached.</p>
        <p className="text-xs opacity-70">
          {p.goalLaps} laps logged · avg {fmtSec(Math.round(p.avgLapSec))}/lap.
        </p>
      </div>
    );
  }

  const onPace = p.marginMs >= 0;
  const paceLabel =
    p.trailingSamples > 0
      ? `last ${p.trailingSamples} laps`
      : "all laps";

  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        onPace
          ? "border-green-600/40 bg-green-600/10"
          : "border-red-500/40 bg-red-500/10"
      }`}
    >
      <p className="text-xs uppercase tracking-wide opacity-60">
        Goal at current pace
      </p>
      <p className="mt-1 text-lg font-semibold">
        {onPace ? "On pace to hit goal" : "Won't hit goal"}
      </p>
      <p className="text-xs opacity-80 tabular-nums">
        {onPace
          ? `Finishes ~${fmtVenueClock(p.predictedFinish)} · ${fmtCountdown(p.marginMs)} to spare`
          : `Would finish ~${fmtVenueClock(p.predictedFinish)} · ${fmtCountdown(-p.marginMs)} past race end`}
      </p>
      <p className="text-[11px] opacity-60 tabular-nums">
        {p.remainingLaps} laps to go · {fmtSec(Math.round(p.avgLapSec))}/lap ({paceLabel})
      </p>
    </div>
  );
}

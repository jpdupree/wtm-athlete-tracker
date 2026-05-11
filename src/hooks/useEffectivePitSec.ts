"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { recommendPitSec } from "@/lib/predict";
import { RACE_START } from "@/lib/race";

export type EffectivePitSec = {
  // Number of seconds per pit, or null when no goal / no laps yet / race
  // window has closed.
  sec: number | null;
  // Whether this came from the user-set override or the auto recommendation.
  // null when sec is null.
  source: "override" | "recommended" | null;
};

// Single source of truth for "what should a pit be?" — used by both the
// goal section header (display) and the pit-color logic (LapStrip,
// LapCard). When the followed athlete has a goalPitSec override set, that
// wins; otherwise we compute the recommendation from current state.
export function useEffectivePitSec(bib: number): EffectivePitSec {
  const followed = useLiveQuery(() => db.followed.get(bib), [bib]);
  const laps = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );

  if (!followed) return { sec: null, source: null };

  // User override wins.
  if (followed.goalPitSec != null && followed.goalPitSec > 0) {
    return { sec: followed.goalPitSec, source: "override" };
  }

  if (followed.goalMiles == null || !laps) {
    return { sec: null, source: null };
  }

  // Derive lap-run-only durations from the lap rows. Wall-clock per lap
  // is end-to-end; subtract pit duration to get running portion.
  const completed = laps.filter(
    (l): l is typeof l & { lapCompletedAt: string } => !!l.lapCompletedAt,
  );
  if (completed.length === 0) return { sec: null, source: null };

  const lapRunSecs: number[] = [];
  let prevEndMs = RACE_START.getTime();
  for (const l of completed) {
    const endMs = new Date(l.lapCompletedAt).getTime();
    const wallClockSec = (endMs - prevEndMs) / 1000;
    let pitSec = 0;
    if (l.pitStartedAt && l.pitCompletedAt) {
      pitSec =
        (new Date(l.pitCompletedAt).getTime() - new Date(l.pitStartedAt).getTime()) /
        1000;
    }
    lapRunSecs.push(Math.max(0, wallClockSec - pitSec));
    prevEndMs = endMs;
  }
  const totalSec = (prevEndMs - RACE_START.getTime()) / 1000;

  const rec = recommendPitSec({
    goalMiles: followed.goalMiles,
    laps: completed.length,
    totalSec,
    lapRunSecs,
  });

  return { sec: rec, source: rec != null ? "recommended" : null };
}

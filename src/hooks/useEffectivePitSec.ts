"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { recommendPitSec } from "@/lib/predict";
import { RACE_START } from "@/lib/race";

export type EffectivePitSec = {
  // Effective per-pit target: user override if set, otherwise the auto
  // recommendation. null when no goal / no laps yet / race window closed.
  sec: number | null;
  // The auto recommendation only, regardless of whether an override is set.
  // Useful for places that should color against the *math*, not the user's
  // personal goal — e.g. per-lap pit cards.
  autoSec: number | null;
  // Whether `sec` came from the user-set override or the auto recommendation.
  source: "override" | "recommended" | null;
};

// Single source of truth for "what should a pit be?" — used by both the
// goal section header (display) and the pit-color logic (LapStrip,
// LapCard). Returns BOTH the effective value (override > auto) and the raw
// auto recommendation so consumers can choose which one to color against.
export function useEffectivePitSec(bib: number): EffectivePitSec {
  const followed = useLiveQuery(() => db.followed.get(bib), [bib]);
  const laps = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );

  if (!followed) return { sec: null, autoSec: null, source: null };
  if (followed.goalMiles == null || !laps) {
    const override = followed.goalPitSec != null && followed.goalPitSec > 0
      ? followed.goalPitSec
      : null;
    return {
      sec: override,
      autoSec: null,
      source: override != null ? "override" : null,
    };
  }

  // Derive lap-run-only durations from the lap rows. Wall-clock per lap
  // is end-to-end; subtract pit duration to get running portion.
  const completed = laps.filter(
    (l): l is typeof l & { lapCompletedAt: string } => !!l.lapCompletedAt,
  );

  let autoSec: number | null = null;
  if (completed.length > 0) {
    // Run-only seconds per lap: use this lap's own start→end window.
    // (lap.pitStartedAt / pitCompletedAt now describe the pit AFTER this
    // lap, so they're not the right subtraction for this lap's run.)
    const lapRunSecs: number[] = [];
    let lastEndMs = RACE_START.getTime();
    for (const l of completed) {
      const endMs = new Date(l.lapCompletedAt).getTime();
      if (l.lapStartedAt) {
        const startMs = new Date(l.lapStartedAt).getTime();
        lapRunSecs.push(Math.max(0, (endMs - startMs) / 1000));
      }
      lastEndMs = endMs;
    }
    const totalSec = (lastEndMs - RACE_START.getTime()) / 1000;
    if (lapRunSecs.length > 0) {
      autoSec = recommendPitSec({
        goalMiles: followed.goalMiles,
        laps: completed.length,
        totalSec,
        lapRunSecs,
      });
    }
  }

  // User override wins for the effective value, but autoSec is always
  // exposed independently so per-card displays can color against it.
  if (followed.goalPitSec != null && followed.goalPitSec > 0) {
    return { sec: followed.goalPitSec, autoSec, source: "override" };
  }

  return {
    sec: autoSec,
    autoSec,
    source: autoSec != null ? "recommended" : null,
  };
}

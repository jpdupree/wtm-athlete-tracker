"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { recommendPitSec } from "@/lib/predict";
import { RACE_START } from "@/lib/race";

export type EffectivePitSec = {
  // Effective per-pit target — user override if set, otherwise the latest
  // auto recommendation. null when no goal / no laps yet / race window
  // closed. Used by the Goal-section headline display.
  sec: number | null;
  // The auto recommendation snapshot AT THE END OF THE LATEST LAP only.
  // Useful for "what's my budget right now" style readouts.
  autoSec: number | null;
  // Per-lap rolling target. targets.get(N) is the per-pit budget that was
  // in effect at the end of lap N — i.e. the budget the pit FOLLOWING lap
  // N should be judged against. When the math goes non-positive (athlete
  // already past the goal-pace point), we sticky-keep the last positive
  // value so pits later in the race still get colored against a meaningful
  // benchmark instead of all flipping red.
  //
  // Override mode (sec from goalPitSec) bypasses this map — see callers.
  targets: Map<number, number>;
  source: "override" | "recommended" | null;
};

const EMPTY_TARGETS: Map<number, number> = new Map();

export function useEffectivePitSec(bib: number): EffectivePitSec {
  const followed = useLiveQuery(() => db.followed.get(bib), [bib]);
  const laps = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );

  if (!followed) {
    return { sec: null, autoSec: null, targets: EMPTY_TARGETS, source: null };
  }
  if (followed.goalMiles == null || !laps) {
    const override =
      followed.goalPitSec != null && followed.goalPitSec > 0
        ? followed.goalPitSec
        : null;
    return {
      sec: override,
      autoSec: null,
      targets: EMPTY_TARGETS,
      source: override != null ? "override" : null,
    };
  }

  const completed = laps.filter(
    (l): l is typeof l & { lapCompletedAt: string } => !!l.lapCompletedAt,
  );

  const targets = new Map<number, number>();
  let autoSec: number | null = null;
  if (completed.length > 0) {
    // Walk each completed lap, snapshotting the recommendation at that
    // point in the race. Run-only seconds come from the lap's own
    // lapStartedAt → lapCompletedAt window.
    const lapRunSecs: number[] = [];
    let lastPositive: number | null = null;
    for (let i = 0; i < completed.length; i++) {
      const l = completed[i];
      const endMs = new Date(l.lapCompletedAt).getTime();
      if (l.lapStartedAt) {
        const startMs = new Date(l.lapStartedAt).getTime();
        lapRunSecs.push(Math.max(0, (endMs - startMs) / 1000));
      }
      // Need at least one run sample to project from.
      if (lapRunSecs.length === 0) continue;
      const totalSecHere = (endMs - RACE_START.getTime()) / 1000;
      const rec = recommendPitSec({
        goalMiles: followed.goalMiles,
        laps: i + 1,
        totalSec: totalSecHere,
        lapRunSecs: lapRunSecs.slice(),
      });
      if (rec != null && rec > 0) {
        targets.set(l.lapNumber, rec);
        lastPositive = rec;
      } else if (lastPositive != null) {
        // Math says "behind" from here on — keep coloring against the
        // last sustainable budget so the user can see whether a given
        // pit was a deviation from that benchmark or in line with it.
        targets.set(l.lapNumber, lastPositive);
      }
    }
    // autoSec for the headline is the recommendation AT the latest lap,
    // not the sticky version — the headline should reflect actual state.
    if (completed.length > 0) {
      const last = completed[completed.length - 1];
      const lastEndMs = new Date(last.lapCompletedAt).getTime();
      const totalSec = (lastEndMs - RACE_START.getTime()) / 1000;
      autoSec = recommendPitSec({
        goalMiles: followed.goalMiles,
        laps: completed.length,
        totalSec,
        lapRunSecs,
      });
    }
  }

  if (followed.goalPitSec != null && followed.goalPitSec > 0) {
    return {
      sec: followed.goalPitSec,
      autoSec,
      targets,
      source: "override",
    };
  }

  return {
    sec: autoSec,
    autoSec,
    targets,
    source: autoSec != null ? "recommended" : null,
  };
}

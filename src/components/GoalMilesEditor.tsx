"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtSec } from "@/lib/format";
import { pitStatus, pitStatusClass, sumPitSec } from "@/lib/intake";
import { LAP_MILES } from "@/lib/race";
import { useEffectivePitSec } from "@/hooks/useEffectivePitSec";

// Accepts MM:SS ("5:30") or decimal minutes ("5", "5.5", "0.5", ".75").
// Returns total seconds rounded to the nearest second, or null on empty / bad.
function parsePitInput(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;

  // MM:SS form
  const mmss = trimmed.match(/^(\d+):(\d{1,2})$/);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
    return mins * 60 + secs;
  }

  // Decimal-minute form: "5", "5.5", ".5"
  if (/^\d*\.?\d+$/.test(trimmed)) {
    const mins = parseFloat(trimmed);
    if (!Number.isFinite(mins) || mins < 0) return null;
    return Math.round(mins * 60);
  }

  return null;
}

export function GoalMilesEditor({
  bib,
  goalMiles,
  goalPitSec,
}: {
  bib: number;
  goalMiles: number | null;
  goalPitSec: number | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [milesDraft, setMilesDraft] = useState(goalMiles?.toString() ?? "");
  const [pitDraft, setPitDraft] = useState(
    goalPitSec != null ? fmtSec(goalPitSec) : "",
  );

  const lapRows = useLiveQuery(() => db.laps.where("bib").equals(bib).toArray(), [bib]);
  const pitCount = (lapRows ?? []).filter(
    (l) => l.pitStartedAt && l.pitCompletedAt,
  ).length;
  const avgPitSec = pitCount > 0 ? sumPitSec(lapRows ?? []) / pitCount : null;

  // The "effective" pit budget — user override if set, otherwise auto-
  // recommendation derived from goal + current state. Used both for
  // display and for coloring avgPitSec.
  const effective = useEffectivePitSec(bib);

  if (!editing) {
    const targetSec = effective.sec;
    // When the math returns a non-positive value the athlete is past
    // pace for the goal — their projected run alone exceeds the time
    // remaining. We still call pitStatus so the avg pit color reflects
    // that (every pit then reads red), and we surface "behind" in the
    // copy instead of a dash.
    const budgetExhausted = targetSec != null && targetSec <= 0;
    const pitColorStatus =
      targetSec != null && avgPitSec != null
        ? pitStatus(avgPitSec, targetSec)
        : "none";
    const pitColor = pitColorStatus === "none" ? "" : pitStatusClass(pitColorStatus);
    const targetLabel =
      effective.source === "override"
        ? "Pit goal"
        : effective.source === "recommended"
          ? "Pit budget"
          : "Pit";
    const targetSuffix =
      effective.source === "recommended" ? (
        <span className="opacity-60">
          {budgetExhausted ? " (auto · behind)" : " (auto)"}
        </span>
      ) : effective.source === "override" ? (
        <span className="opacity-60"> (set)</span>
      ) : null;
    return (
      <button
        onClick={() => {
          setMilesDraft(goalMiles?.toString() ?? "");
          setPitDraft(goalPitSec != null ? fmtSec(goalPitSec) : "");
          setEditing(true);
        }}
        className="rounded-lg border border-current/20 px-4 py-3 text-left w-full space-y-1"
      >
        <p className="text-xs uppercase tracking-wide opacity-60">Goal</p>
        <p className="text-lg font-semibold">
          {goalMiles != null
            ? `${goalMiles} mi · ${Math.ceil(goalMiles / LAP_MILES)} laps`
            : "Tap to set"}
        </p>
        {(targetSec != null || avgPitSec != null) && (
          <p className="text-xs opacity-80 tabular-nums">
            {targetLabel}:{" "}
            <span className="font-medium">
              {targetSec != null
                ? targetSec > 0
                  ? fmtSec(Math.round(targetSec))
                  : "0:00"
                : "—"}
            </span>
            {targetSuffix}
            {avgPitSec != null && (
              <>
                {" · "}avg{" "}
                <span className={`font-medium ${pitColor}`}>
                  {fmtSec(Math.round(avgPitSec))}
                </span>
                {pitColorStatus !== "none" && pitCount > 0 && (
                  <span className={`ml-1 ${pitColor}`}>
                    {pitColorStatus === "green"
                      ? "✓"
                      : pitColorStatus === "amber"
                        ? "≈"
                        : "✗"}
                  </span>
                )}
              </>
            )}
          </p>
        )}
      </button>
    );
  }

  // Editor: show the auto-recommendation as input placeholder so the user
  // can see what they'd get by leaving the field blank.
  const recPlaceholder =
    effective.source === "recommended" && effective.sec != null && effective.sec > 0
      ? `auto: ${fmtSec(Math.round(effective.sec))}`
      : "leave blank for auto";

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const miles = milesDraft.trim() ? parseInt(milesDraft, 10) : null;
        const pit = pitDraft.trim() ? parsePitInput(pitDraft) : null;
        try {
          await db.followed.update(bib, {
            goalMiles: miles != null && Number.isFinite(miles) ? miles : null,
            goalPitSec: pit, // null clears the override and falls back to auto
          });
        } finally {
          setEditing(false);
        }
      }}
      className="rounded-lg border border-current/40 px-4 py-3 space-y-3"
    >
      <div className="space-y-1">
        <label className="block text-xs uppercase tracking-wide opacity-60">
          Goal miles
        </label>
        <input
          autoFocus
          inputMode="numeric"
          value={milesDraft}
          onChange={(e) => setMilesDraft(e.target.value)}
          placeholder="e.g. 50"
          className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-lg"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-xs uppercase tracking-wide opacity-60">
          Pit goal override (MM:SS or minutes)
        </label>
        <input
          inputMode="decimal"
          value={pitDraft}
          onChange={(e) => setPitDraft(e.target.value)}
          placeholder={recPlaceholder}
          className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-lg tabular-nums"
        />
        <p className="text-[11px] opacity-60 leading-snug">
          Leave blank to use the recommended budget — auto-computed from
          your goal and current pace. Set a value here to lock in a
          personal target instead.
        </p>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="rounded-md border border-current/40 px-3 py-1 text-xs font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="rounded-md px-3 py-1 text-xs opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtSec } from "@/lib/format";
import { pitStatus, pitStatusClass, sumPitSec } from "@/lib/intake";
import { LAP_MILES } from "@/lib/race";

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

  if (!editing) {
    const pitColorStatus =
      goalPitSec != null && avgPitSec != null
        ? pitStatus(avgPitSec, goalPitSec)
        : "none";
    const pitColor = pitColorStatus === "none" ? "" : pitStatusClass(pitColorStatus);
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
        {(goalPitSec != null || avgPitSec != null) && (
          <p className="text-xs opacity-80 tabular-nums">
            Pit goal:{" "}
            <span className="font-medium">
              {goalPitSec != null ? fmtSec(goalPitSec) : "—"}
            </span>
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

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const miles = milesDraft.trim() ? parseInt(milesDraft, 10) : null;
        const pit = pitDraft.trim() ? parsePitInput(pitDraft) : null;
        // Always close the form; if the write fails (e.g. IDB blocked
        // mid-poll), we still want the user out of the editing state and
        // can surface the error elsewhere rather than leaving them stuck.
        try {
          await db.followed.update(bib, {
            goalMiles: miles != null && Number.isFinite(miles) ? miles : null,
            goalPitSec: pit,
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
          Goal pit time per stop (MM:SS or minutes)
        </label>
        <input
          inputMode="decimal"
          value={pitDraft}
          onChange={(e) => setPitDraft(e.target.value)}
          placeholder="e.g. 5:00 or 4.5"
          className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-lg tabular-nums"
        />
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

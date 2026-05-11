"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtSec } from "@/lib/format";
import { sumPitSec } from "@/lib/intake";
import { LAP_MILES } from "@/lib/race";

// Accepts "5", "5:30", "05:30" — returns total seconds, or null on empty / bad.
function parsePitInput(s: string): number | null {
  const trimmed = s.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/^(\d+)(?::(\d{1,2}))?$/);
  if (!m) return null;
  const mins = parseInt(m[1], 10);
  const secs = m[2] != null ? parseInt(m[2], 10) : 0;
  if (!Number.isFinite(mins) || !Number.isFinite(secs) || secs >= 60) return null;
  return mins * 60 + secs;
}

function pitStatusColor(avgSec: number, goalSec: number): string {
  if (avgSec <= goalSec) return "text-green-500";
  if (avgSec <= goalSec * 1.25) return "text-amber-500";
  return "text-red-500";
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
    const pitColor =
      goalPitSec != null && avgPitSec != null
        ? pitStatusColor(avgPitSec, goalPitSec)
        : "";
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
                {goalPitSec != null && pitCount > 0 && (
                  <span className={`ml-1 ${pitColor}`}>
                    {avgPitSec <= goalPitSec
                      ? "✓"
                      : avgPitSec <= goalPitSec * 1.25
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
        await db.followed.update(bib, {
          goalMiles: miles != null && Number.isFinite(miles) ? miles : null,
          goalPitSec: pit,
        });
        setEditing(false);
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
          Goal pit time per stop (MM:SS)
        </label>
        <input
          inputMode="numeric"
          value={pitDraft}
          onChange={(e) => setPitDraft(e.target.value)}
          placeholder="e.g. 5:00"
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

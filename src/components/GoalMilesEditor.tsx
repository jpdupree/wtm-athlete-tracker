"use client";

import { useState } from "react";
import { db } from "@/lib/db";
import { LAP_MILES } from "@/lib/race";

export function GoalMilesEditor({
  bib,
  goalMiles,
}: {
  bib: number;
  goalMiles: number | null;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goalMiles?.toString() ?? "");

  if (!editing) {
    return (
      <button
        onClick={() => {
          setDraft(goalMiles?.toString() ?? "");
          setEditing(true);
        }}
        className="rounded-lg border border-current/20 px-4 py-3 text-left w-full"
      >
        <p className="text-xs uppercase tracking-wide opacity-60">Goal</p>
        <p className="mt-1 text-lg font-semibold">
          {goalMiles != null
            ? `${goalMiles} mi · ${Math.ceil(goalMiles / LAP_MILES)} laps`
            : "Tap to set"}
        </p>
      </button>
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const n = draft.trim() ? parseInt(draft, 10) : null;
        await db.followed.update(bib, {
          goalMiles: n != null && Number.isFinite(n) ? n : null,
        });
        setEditing(false);
      }}
      className="rounded-lg border border-current/40 px-4 py-3 space-y-2"
    >
      <p className="text-xs uppercase tracking-wide opacity-60">Goal miles</p>
      <input
        autoFocus
        inputMode="numeric"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="e.g. 50"
        className="w-full rounded-md border border-current/20 bg-transparent px-2 py-1 text-lg"
      />
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

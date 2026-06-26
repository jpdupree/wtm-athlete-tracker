"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useSelectedYear } from "@/hooks/useSelectedYear";
import type { Athlete, FeedResponse } from "@/lib/types";

// Fallback only — used when the row itself carries no gender (the overall
// live slice doesn't). Scoped to the selected year so it matches the right
// event's slices.
async function resolveGender(bib: number, year: number): Promise<"M" | "F" | null> {
  try {
    const [men, women] = await Promise.all([
      fetch(`/api/results/men?year=${year}`).then((r) => r.json() as Promise<FeedResponse>),
      fetch(`/api/results/women?year=${year}`).then((r) => r.json() as Promise<FeedResponse>),
    ]);
    if (men.rows.some((r) => r.bib === bib)) return "M";
    if (women.rows.some((r) => r.bib === bib)) return "F";
  } catch {
    /* swallow — best-effort */
  }
  return null;
}

export function FollowButton({ row }: { row: Athlete }) {
  const [year] = useSelectedYear();
  const existing = useLiveQuery(() => db.followed.get(row.bib), [row.bib]);
  // Only count as "following" if the record is for the current year. A
  // record for a different year (same bib, different athlete) reads as
  // not-following — the follow click will overwrite.
  const followed = existing && existing.year === year ? existing : undefined;
  const [busy, setBusy] = useState(false);

  if (followed) {
    return (
      <span className="ml-3 shrink-0 rounded-md border border-green-600/40 bg-green-600/10 px-3 py-1 text-xs">
        Following
      </span>
    );
  }

  return (
    <button
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const isTeam = row.category === "Team";
          // The seed and the men/women slices already carry gender; only
          // fall back to a slice lookup when the row has none (overall live).
          const gender = isTeam
            ? null
            : row.gender ?? (await resolveGender(row.bib, year));
          // put() upserts — if a record exists for this bib in a different
          // year, this replaces it. Acceptable: each bib follows one year.
          await db.followed.put({
            bib: row.bib,
            year,
            name: row.name,
            gender,
            team: isTeam ? row.category : null,
            goalMiles: null,
            addedAt: new Date().toISOString(),
          });
        } finally {
          setBusy(false);
        }
      }}
      className="ml-3 shrink-0 rounded-md border border-current/40 px-3 py-1 text-xs font-medium disabled:opacity-50"
    >
      {busy ? "…" : "Follow"}
    </button>
  );
}

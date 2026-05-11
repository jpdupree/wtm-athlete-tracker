"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Athlete, FeedResponse } from "@/lib/types";

async function resolveGender(bib: number): Promise<"M" | "F" | null> {
  try {
    const [men, women] = await Promise.all([
      fetch("/api/results/men").then((r) => r.json() as Promise<FeedResponse>),
      fetch("/api/results/women").then((r) => r.json() as Promise<FeedResponse>),
    ]);
    if (men.rows.some((r) => r.bib === bib)) return "M";
    if (women.rows.some((r) => r.bib === bib)) return "F";
  } catch {
    /* swallow — best-effort */
  }
  return null;
}

export function FollowButton({ row }: { row: Athlete }) {
  const followed = useLiveQuery(() => db.followed.get(row.bib), [row.bib]);
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
          const gender = isTeam ? null : await resolveGender(row.bib);
          await db.followed.add({
            bib: row.bib,
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

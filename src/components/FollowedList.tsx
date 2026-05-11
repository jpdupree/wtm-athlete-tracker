"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FollowedAthlete } from "@/lib/db";
import { useOverallFeed } from "@/components/FeedProvider";
import { predict } from "@/lib/predict";
import { LAP_MILES } from "@/lib/race";
import type { Athlete } from "@/lib/types";

type SortKey = "added" | "rank" | "margin";
const SORT_STORAGE = "wtm-followed-sort-v1";

const SORTS: Array<{ key: SortKey; label: string; hint: string }> = [
  { key: "added", label: "Added", hint: "in the order you added them" },
  { key: "rank", label: "Rank", hint: "by current overall rank" },
  { key: "margin", label: "Behind", hint: "most behind goal first" },
];

export function FollowedList() {
  const rawFollowed = useLiveQuery(
    () => db.followed.orderBy("addedAt").toArray(),
    [],
  );
  const { data } = useOverallFeed();

  const [sortKey, setSortKey] = useState<SortKey>("added");
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SORT_STORAGE);
      if (stored === "rank" || stored === "margin" || stored === "added") {
        setSortKey(stored);
      }
    } catch {
      /* private mode */
    }
  }, []);
  const pickSort = (k: SortKey) => {
    setSortKey(k);
    try {
      window.localStorage.setItem(SORT_STORAGE, k);
    } catch {
      /* */
    }
  };

  if (rawFollowed === undefined) {
    return <p className="text-sm opacity-50">Loading…</p>;
  }

  if (rawFollowed.length === 0) {
    return (
      <section className="rounded-lg border border-current/20 p-6 text-center space-y-3">
        <p className="text-sm">No athletes followed yet.</p>
        <Link
          href="/add"
          className="inline-flex items-center justify-center rounded-md border border-current/40 px-4 py-2 text-sm font-medium"
        >
          Add athlete
        </Link>
      </section>
    );
  }

  const followed = [...rawFollowed].sort((a, b) => {
    const aRow = data?.rows.find((r) => r.bib === a.bib) ?? null;
    const bRow = data?.rows.find((r) => r.bib === b.bib) ?? null;
    if (sortKey === "rank") {
      // Athletes without a row sink to the bottom; otherwise lower rank
      // number (= better placement) comes first.
      const ar = aRow && aRow.overallRank > 0 ? aRow.overallRank : Infinity;
      const br = bRow && bRow.overallRank > 0 ? bRow.overallRank : Infinity;
      return ar - br;
    }
    if (sortKey === "margin") {
      // "Most behind goal first" — biggest negative margin first. Athletes
      // already at/past goal (positive margin) go after; no-goal athletes
      // sink to bottom.
      const am = marginMs(a, aRow);
      const bm = marginMs(b, bRow);
      if (am === null && bm === null) return 0;
      if (am === null) return 1;
      if (bm === null) return -1;
      return am - bm; // smaller (more negative) first
    }
    // "added" — keep the underlying addedAt order
    return 0;
  });

  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1 px-1">
        <span className="text-[10px] uppercase tracking-[0.18em] opacity-50">
          Sort
        </span>
        {SORTS.map((s) => {
          const active = s.key === sortKey;
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => pickSort(s.key)}
              title={s.hint}
              aria-pressed={active}
              className="rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider transition-colors"
              style={
                active
                  ? {
                      border: "1px solid var(--wtm-accent)",
                      color: "var(--wtm-accent)",
                      background: "var(--wtm-accent-dim)",
                    }
                  : {
                      border: "1px solid var(--wtm-border)",
                      opacity: 0.7,
                    }
              }
            >
              {s.label}
            </button>
          );
        })}
      </div>
      <ul className="divide-y divide-current/10 rounded-lg border border-current/20">
        {followed.map((a) => (
          <Row key={a.bib} athlete={a} apiRow={data?.rows.find((r) => r.bib === a.bib) ?? null} />
        ))}
      </ul>
      <Link
        href="/add"
        className="block rounded-md border border-current/30 px-4 py-2 text-center text-sm font-medium"
      >
        Add another athlete
      </Link>
    </section>
  );
}

// Margin-to-race-end in ms, or null when there's no goal or no data.
function marginMs(a: FollowedAthlete, row: Athlete | null): number | null {
  if (a.goalMiles == null) return null;
  if (!row || row.laps <= 0) return null;
  if (row.laps * LAP_MILES >= a.goalMiles) return Number.POSITIVE_INFINITY;
  const p = predict({
    totalSec: row.totalSec ?? 0,
    laps: row.laps,
    goalMiles: a.goalMiles,
  });
  return p?.marginMs ?? null;
}

function Row({ athlete, apiRow }: { athlete: FollowedAthlete; apiRow: Athlete | null }) {
  const verdict = computeVerdict(athlete, apiRow);
  return (
    <li className="flex items-center justify-between px-4 py-3">
      <Link href={`/a/${athlete.bib}`} className="min-w-0 flex-1 pr-3">
        <p className="truncate text-sm font-medium">{athlete.name}</p>
        <p className="truncate text-xs opacity-60">
          #{athlete.bib}
          {athlete.gender && ` · ${athlete.gender}`}
          {apiRow && ` · lap ${apiRow.laps} · ${apiRow.distanceMiles} mi`}
          {!apiRow && " · pre-race"}
          {athlete.goalMiles != null && ` · goal ${athlete.goalMiles}mi`}
        </p>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <Verdict verdict={verdict} />
        <button
          onClick={() => {
            if (confirm(`Remove ${athlete.name} from followed?`)) {
              void db.followed.delete(athlete.bib);
            }
          }}
          aria-label={`Remove ${athlete.name}`}
          className="rounded-md border border-current/20 px-2 py-1 text-xs opacity-60 hover:opacity-100"
        >
          ×
        </button>
      </div>
    </li>
  );
}

type V = "on-pace" | "behind" | "reached" | "no-goal" | "no-data";

function computeVerdict(a: FollowedAthlete, row: Athlete | null): V {
  if (a.goalMiles == null) return "no-goal";
  if (!row || row.laps <= 0) return "no-data";
  if (row.laps * LAP_MILES >= a.goalMiles) return "reached";
  const p = predict({ totalSec: row.totalSec ?? 0, laps: row.laps, goalMiles: a.goalMiles });
  if (!p) return "no-data";
  return p.marginMs >= 0 ? "on-pace" : "behind";
}

function Verdict({ verdict }: { verdict: V }) {
  if (verdict === "no-goal" || verdict === "no-data") {
    return <span className="text-[10px] uppercase tracking-wide opacity-40">—</span>;
  }
  const styles: Record<Exclude<V, "no-goal" | "no-data">, string> = {
    "on-pace": "border-green-600/50 bg-green-500/10 text-green-800 dark:text-green-300",
    behind: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-300",
    reached: "border-green-700/50 bg-green-600/15 text-green-900 dark:text-green-200",
  };
  const text: Record<Exclude<V, "no-goal" | "no-data">, string> = {
    "on-pace": "On pace",
    behind: "Behind",
    reached: "Goal hit",
  };
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide ${styles[verdict]}`}>
      {text[verdict]}
    </span>
  );
}

"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FollowedAthlete } from "@/lib/db";
import { useOverallFeed } from "@/components/FeedProvider";
import { predict } from "@/lib/predict";
import { LAP_MILES } from "@/lib/race";
import type { Athlete } from "@/lib/types";

export function FollowedList() {
  const followed = useLiveQuery(
    () => db.followed.orderBy("addedAt").toArray(),
    [],
  );
  const { data } = useOverallFeed();

  if (followed === undefined) {
    return <p className="text-sm opacity-50">Loading…</p>;
  }

  if (followed.length === 0) {
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

  return (
    <section className="space-y-3">
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

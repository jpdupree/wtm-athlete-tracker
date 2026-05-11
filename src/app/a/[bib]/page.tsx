"use client";

import Link from "next/link";
import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useAthleteRow } from "@/hooks/useAthleteRow";
import { fmtAge, fmtSec } from "@/lib/format";
import { Countdowns } from "@/components/Countdowns";
import { GoalMilesEditor } from "@/components/GoalMilesEditor";
import { FinishPrediction } from "@/components/FinishPrediction";
import { LapCard } from "@/components/LapCard";

export default function AthleteDetailPage({
  params,
}: {
  params: Promise<{ bib: string }>;
}) {
  const { bib: bibParam } = use(params);
  const bib = parseInt(bibParam, 10);
  const followed = useLiveQuery(() => db.followed.get(bib), [bib]);
  const { row, loading, error, ageMs } = useAthleteRow(bib);

  if (followed === undefined) {
    return <p className="p-6 text-sm opacity-50">Loading…</p>;
  }

  if (!followed) {
    return (
      <main className="mx-auto max-w-md px-4 py-6 space-y-3">
        <Link href="/" className="text-sm opacity-70">← Home</Link>
        <p className="text-sm">Bib #{bib} is not followed.</p>
        <Link
          href="/add"
          className="inline-flex items-center justify-center rounded-md border border-current/40 px-4 py-2 text-sm font-medium"
        >
          Add athlete
        </Link>
      </main>
    );
  }

  const apiLaps = row?.laps ?? 0;
  // Render cards for completed laps + the in-progress one (so crew can pre-stage entries).
  const lapNumbers: number[] = [];
  for (let n = apiLaps + 1; n >= 1; n--) lapNumbers.push(n);

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Link href="/" className="text-sm opacity-70">← Home</Link>

      <header>
        <h1 className="text-2xl font-bold">{followed.name}</h1>
        <p className="text-sm opacity-60">
          #{followed.bib}
          {(followed.gender ?? row?.gender) && ` · ${followed.gender ?? row?.gender}`}
          {followed.team && ` · ${followed.team}`}
          {row && ` · ${row.nation}`}
        </p>
      </header>

      <Countdowns />

      <section className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-current/20 px-4 py-3">
          <p className="text-xs uppercase tracking-wide opacity-60">Live</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">
            {row ? `${row.laps} laps · ${row.distanceMiles} mi` : loading ? "…" : "no data"}
          </p>
          <p className="text-xs opacity-60">
            {row?.lastSeenLabel ?? "—"}
            {row && ` · last lap ${fmtSec(row.lastLapSec)}`}
          </p>
        </div>
        <GoalMilesEditor bib={bib} goalMiles={followed.goalMiles} />
      </section>

      <FinishPrediction
        totalSec={row?.totalSec ?? 0}
        laps={row?.laps ?? 0}
        goalMiles={followed.goalMiles}
      />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
            Laps &amp; pits
          </h2>
          <span className="text-xs opacity-50">
            {row ? `feed updated ${fmtAge(ageMs)}` : ""}
          </span>
        </div>
        {error && (
          <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm">
            {error.message}
          </p>
        )}
        {lapNumbers.length === 0 ? (
          <p className="rounded-lg border border-dashed border-current/20 p-6 text-center text-sm opacity-60">
            No laps yet. Cards appear once the race starts.
          </p>
        ) : (
          <div className="space-y-2">
            {lapNumbers.map((n) => (
              <LapCard
                key={n}
                bib={bib}
                lapNumber={n}
                inProgress={n === apiLaps + 1}
              />
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

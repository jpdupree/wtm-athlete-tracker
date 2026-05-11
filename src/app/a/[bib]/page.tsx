"use client";

import Link from "next/link";
import { use } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useAthleteRow } from "@/hooks/useAthleteRow";
import { fmtAge } from "@/lib/format";
import { Countdowns } from "@/components/Countdowns";
import { GoalMilesEditor } from "@/components/GoalMilesEditor";
import { FinishPrediction } from "@/components/FinishPrediction";
import { PaceChart } from "@/components/PaceChart";
import { IntakeBars } from "@/components/IntakeBars";
import { IntakeTargetsEditor } from "@/components/IntakeTargetsEditor";
import { StatsGrid } from "@/components/StatsGrid";
import { LapStrip } from "@/components/LapStrip";
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
          {row && (row.overallRank > 0 || row.genderRank > 0) && (
            <>
              {" "}· <span className="tabular-nums">#{row.overallRank} overall</span>
              {row.genderRank > 0 && <> · <span className="tabular-nums">#{row.genderRank} {followed.gender ?? row.gender ?? "gender"}</span></>}
              {row.ageGroupRank != null && <> · <span className="tabular-nums">#{row.ageGroupRank} AG</span></>}
            </>
          )}
        </p>
      </header>

      <Countdowns />

      <GoalMilesEditor
        bib={bib}
        goalMiles={followed.goalMiles}
        goalPitSec={followed.goalPitSec ?? null}
      />

      <FinishPrediction
        bib={bib}
        totalSec={row?.totalSec ?? 0}
        laps={row?.laps ?? 0}
        goalMiles={followed.goalMiles}
      />

      <IntakeBars
        bib={bib}
        totalSec={row?.totalSec ?? 0}
        targets={{
          calPerHr: followed.targetCalPerHr,
          fluidMlPerHr: followed.targetFluidMlPerHr,
          sodiumMgPerHr: followed.targetSodiumMgPerHr,
        }}
      />
      <IntakeTargetsEditor athlete={followed} />

      <PaceChart
        bib={bib}
        totalSec={row?.totalSec ?? 0}
        laps={row?.laps ?? 0}
        goalMiles={followed.goalMiles}
      />

      <StatsGrid
        bib={bib}
        totalSec={row?.totalSec ?? 0}
        laps={row?.laps ?? 0}
        lastLapSec={row?.lastLapSec ?? null}
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

        <LapStrip bib={bib} lapCount={apiLaps} />

        {error && (
          <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm">
            {error.message}
          </p>
        )}
        {!loading && !row && (
          <p className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm">
            No feed row found for bib #{bib}. They may not be racing yet, or the bib may not be in the slice.
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

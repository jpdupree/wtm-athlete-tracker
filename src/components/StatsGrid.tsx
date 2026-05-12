"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtSec } from "@/lib/format";
import { sumPitSec } from "@/lib/intake";
import { LAP_MILES } from "@/lib/race";

export function StatsGrid({
  bib,
  totalSec,
  laps,
  lastLapSec,
}: {
  bib: number;
  totalSec: number;
  laps: number;
  lastLapSec: number | null;
}) {
  const lapRows = useLiveQuery(() => db.laps.where("bib").equals(bib).toArray(), [bib]);

  // totalSec is the official scoreboard TotalTime — what RaceResult
  // shows. Its semantics differ year-to-year (some years are moving-
  // only, others are wall-clock-including-pits), so we just display
  // the official value rather than trying to derive a separate
  // wall-clock number that may or may not match.
  const pitSec = sumPitSec(lapRows ?? []);
  const pitCount = (lapRows ?? []).filter(
    (l) => l.pitStartedAt && l.pitCompletedAt,
  ).length;
  const avgPitSec = pitCount > 0 ? pitSec / pitCount : null;
  const movingSec = Math.max(0, totalSec - pitSec);
  const avgLapSec = laps > 0 && movingSec > 0 ? movingSec / laps : null;
  const distance = laps * LAP_MILES;

  return (
    <section className="grid grid-cols-2 gap-2">
      <Tile
        label="Laps"
        main={laps > 0 ? `${laps} · ${distance} mi` : "—"}
        sub={lastLapSec != null ? `last lap ${fmtSec(lastLapSec)}` : ""}
      />
      <Tile
        label="Total time"
        main={totalSec > 0 ? fmtSec(totalSec) : "—"}
        sub="official"
      />
      <Tile
        label="Avg lap"
        main={avgLapSec ? fmtSec(Math.round(avgLapSec)) : "—"}
        sub="moving (excl. pits)"
      />
      <Tile
        label="Pit time"
        main={pitCount > 0 ? fmtSec(pitSec) : "—"}
        sub={
          avgPitSec
            ? `${pitCount} pit${pitCount === 1 ? "" : "s"} · avg ${fmtSec(Math.round(avgPitSec))}`
            : "no pits logged"
        }
      />
    </section>
  );
}

function Tile({ label, main, sub }: { label: string; main: string; sub: string }) {
  return (
    <div className="rounded-lg border border-current/20 px-4 py-3">
      <p className="text-xs uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-1 text-lg font-semibold tabular-nums">{main}</p>
      {sub && <p className="text-xs opacity-60 truncate">{sub}</p>}
    </div>
  );
}

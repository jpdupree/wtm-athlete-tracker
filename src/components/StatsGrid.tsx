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

  const pitSec = sumPitSec(lapRows ?? []);
  const courseSec = Math.max(0, totalSec - pitSec);
  const pitCount = (lapRows ?? []).filter(
    (l) => l.pitStartedAt && l.pitCompletedAt,
  ).length;
  const avgPitSec = pitCount > 0 ? pitSec / pitCount : null;
  const avgLapSec = laps > 0 && courseSec > 0 ? courseSec / laps : null;
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
        main={fmtSec(totalSec) ?? "—"}
        sub="clock since start"
      />
      <Tile
        label="Course time"
        main={courseSec > 0 ? fmtSec(courseSec) : "—"}
        sub={avgLapSec ? `avg lap ${fmtSec(Math.round(avgLapSec))}` : ""}
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

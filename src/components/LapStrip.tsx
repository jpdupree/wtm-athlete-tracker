"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { fmtSec } from "@/lib/format";
import { pitStatus, pitStatusClass } from "@/lib/intake";
import { RACE_START } from "@/lib/race";
import { useEffectivePitSec } from "@/hooks/useEffectivePitSec";

export function LapStrip({ bib, lapCount }: { bib: number; lapCount: number }) {
  const lapRows = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );
  // Single source of truth for the pit threshold — user override OR the
  // auto-recommendation. Color each past pit relative to the *current*
  // budget so the strip tells the crew at a glance which pits, if
  // repeated, would still be sustainable for the goal.
  const effectivePit = useEffectivePitSec(bib);
  const targetPitSec = effectivePit.sec ?? null;

  if (lapCount === 0) return null;

  const byNumber = new Map<number, { completedAt: string | null; pitSec: number | null }>();
  for (const l of lapRows ?? []) {
    let pitSec: number | null = null;
    if (l.pitStartedAt && l.pitCompletedAt) {
      pitSec = (new Date(l.pitCompletedAt).getTime() - new Date(l.pitStartedAt).getTime()) / 1000;
    }
    byNumber.set(l.lapNumber, { completedAt: l.lapCompletedAt, pitSec });
  }

  const items: Array<{ n: number; durationSec: number | null; pitSec: number | null }> = [];
  let prevEnd = RACE_START.toISOString();
  for (let n = 1; n <= lapCount; n++) {
    const entry = byNumber.get(n);
    const end = entry?.completedAt ?? null;
    const dur =
      end && prevEnd
        ? Math.round(
            (new Date(end).getTime() - new Date(prevEnd).getTime()) / 1000,
          )
        : null;
    items.push({ n, durationSec: dur, pitSec: entry?.pitSec ?? null });
    if (end) prevEnd = end;
  }

  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <ul className="flex gap-2 min-w-min pb-1">
        {items.map((it) => (
          <li key={it.n} className="shrink-0">
            <a
              href={`#lap-${it.n}`}
              className="block rounded-md border border-current/20 px-2 py-1 text-center"
            >
              <p className="text-[10px] uppercase tracking-wide opacity-70">L{it.n}</p>
              <p className="text-xs tabular-nums">
                {it.durationSec ? fmtSec(it.durationSec) : "—"}
              </p>
              {it.pitSec != null && (
                <p
                  className={`text-[10px] tabular-nums ${pitStatusClass(
                    pitStatus(it.pitSec, targetPitSec),
                  )}`}
                >
                  pit {fmtSec(Math.round(it.pitSec))}
                </p>
              )}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

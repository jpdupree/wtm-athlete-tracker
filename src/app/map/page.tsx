"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useOverallFeed } from "@/components/FeedProvider";
import { useNow } from "@/hooks/useNow";
import { useSelectedYear } from "@/hooks/useSelectedYear";
import { predictPosition } from "@/lib/position";
import { fmtCountdown, fmtSec } from "@/lib/format";
import type { MapAthlete } from "@/components/CourseMap";

// Leaflet touches `window`, so the map is client-only.
const CourseMap = dynamic(
  () => import("@/components/CourseMap").then((m) => m.CourseMap),
  { ssr: false, loading: () => <MapSkeleton /> },
);

const PALETTE = [
  "#e8772e", "#3b82f6", "#22c55e", "#a855f7",
  "#ef4444", "#eab308", "#14b8a6", "#ec4899",
];

export default function MapPage() {
  const [year] = useSelectedYear();
  const { data } = useOverallFeed();
  const now = useNow(2000);

  const followed = useLiveQuery(
    () => db.followed.where("year").equals(year).sortBy("addedAt"),
    [year],
  );

  // Latest completed-lap timestamp per followed bib — anchors the fraction.
  const lastLapMs = useLiveQuery(async () => {
    const f = await db.followed.where("year").equals(year).toArray();
    const out: Record<number, number | null> = {};
    for (const a of f) {
      const laps = await db.laps
        .where("bib")
        .equals(a.bib)
        .filter((l) => !!l.lapCompletedAt)
        .sortBy("lapNumber");
      const last = laps[laps.length - 1];
      out[a.bib] = last?.lapCompletedAt
        ? new Date(last.lapCompletedAt).getTime()
        : null;
    }
    return out;
  }, [year]);

  const rows = useMemo(() => {
    if (!followed) return [];
    return followed.map((a, i) => {
      const apiRow = data?.rows.find((r) => r.bib === a.bib) ?? null;
      const pos = predictPosition({
        row: apiRow,
        now,
        lastLapCompletedAtMs: lastLapMs?.[a.bib] ?? null,
      });
      return { athlete: a, pos, color: PALETTE[i % PALETTE.length] };
    });
  }, [followed, data, now, lastLapMs]);

  // Dots only for athletes who have a position on course (racing or finished).
  const mapAthletes: MapAthlete[] = useMemo(
    () =>
      rows
        .filter((r) => r.pos.state === "racing" || r.pos.state === "ended")
        .map((r) => ({
          bib: r.athlete.bib,
          name: r.athlete.name,
          fraction: r.pos.fraction,
          color: r.color,
        })),
    [rows],
  );

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60 hover:opacity-100"
      >
        <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
      </Link>

      <header
        className="rounded-lg px-4 py-4 space-y-2"
        style={{
          border: "1px solid var(--wtm-border)",
          background: "var(--wtm-surface)",
          borderLeft: "3px solid var(--wtm-accent)",
        }}
      >
        <h1 className="wtm-display text-3xl leading-none">Course view</h1>
        <p className="text-xs opacity-60 leading-snug">
          The WTM 2026 course at Belvoir Castle. Athlete dots are an{" "}
          <em>estimate</em> of position along the loop from recent lap pace —
          not a GPS fix.
        </p>
      </header>

      <CourseMap athletes={mapAthletes} />

      {(!followed || followed.length === 0) && (
        <p
          className="rounded-lg p-4 text-center text-sm opacity-70"
          style={{ border: "1px dashed var(--wtm-border-strong)" }}
        >
          Follow athletes from{" "}
          <Link href="/add" className="underline" style={{ color: "var(--wtm-accent)" }}>
            Add
          </Link>{" "}
          to see them on the course.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(({ athlete, pos, color }) => {
            const onMap = pos.state === "racing" || pos.state === "ended";
            return (
              <li
                key={athlete.bib}
                className="flex items-center gap-3 rounded-lg px-3 py-2"
                style={{
                  border: "1px solid var(--wtm-border)",
                  background: "var(--wtm-surface)",
                  opacity: athlete.paused ? 0.55 : 1,
                }}
              >
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{
                    background: onMap ? color : "var(--wtm-border)",
                    border: "1.5px solid #fff",
                  }}
                />
                <Link href={`/a/${athlete.bib}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{athlete.name}</p>
                  <p className="truncate text-[11px] opacity-60 tabular-nums">
                    <span style={{ color: "var(--wtm-accent)" }}>#{athlete.bib}</span>
                    {pos.state === "racing" && (
                      <>
                        {" "}· lap {pos.currentLap} · {Math.round(pos.fraction * 100)}%
                        {pos.etaMsToLapEnd != null &&
                          ` · ETA ${fmtCountdown(pos.etaMsToLapEnd)}`}
                      </>
                    )}
                    {pos.state === "pre-race" && " · pre-race"}
                    {pos.state === "ended" && " · finished"}
                    {pos.state === "no-data" && " · no data yet"}
                  </p>
                </Link>
                {pos.avgLapSec && (
                  <span className="shrink-0 text-[11px] opacity-70 tabular-nums">
                    ~{fmtSec(Math.round(pos.avgLapSec))}/lap
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}

function MapSkeleton() {
  return (
    <div
      className="h-[68vh] min-h-[420px] w-full animate-pulse rounded-lg"
      style={{ border: "1px solid var(--wtm-border)", background: "var(--wtm-surface)" }}
    />
  );
}

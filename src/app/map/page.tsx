"use client";

import Link from "next/link";
import { useLiveQuery } from "dexie-react-hooks";
import { db, type FollowedAthlete } from "@/lib/db";
import type { Athlete } from "@/lib/types";
import { useOverallFeed } from "@/components/FeedProvider";
import { useNow } from "@/hooks/useNow";
import { predictPosition } from "@/lib/position";
import { lapId } from "@/lib/lapSync";
import { fmtCountdown, fmtSec } from "@/lib/format";

export default function MapPage() {
  const followed = useLiveQuery(() => db.followed.orderBy("addedAt").toArray(), []);
  const { data } = useOverallFeed();
  const now = useNow(2000);

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
          Predicted position by lap fraction. A real map lands once Tough
          Mudder shares GPX for the course.
        </p>
      </header>

      {(!followed || followed.length === 0) && (
        <p
          className="rounded-lg p-6 text-center text-sm opacity-70"
          style={{ border: "1px dashed var(--wtm-border-strong)" }}
        >
          Follow some athletes from{" "}
          <Link
            href="/add"
            className="underline"
            style={{ color: "var(--wtm-accent)" }}
          >
            Add
          </Link>{" "}
          first.
        </p>
      )}

      {followed && followed.length > 0 && (
        <ul className="space-y-3">
          {followed.map((a) => (
            <AthleteRow
              key={a.bib}
              athlete={a}
              now={now}
              apiRow={data?.rows.find((r) => r.bib === a.bib) ?? null}
            />
          ))}
        </ul>
      )}
    </main>
  );
}

function AthleteRow({
  athlete,
  apiRow,
  now,
}: {
  athlete: FollowedAthlete;
  apiRow: Athlete | null;
  now: number;
}) {
  const lastLap = useLiveQuery(
    async () => {
      if (!apiRow || apiRow.laps <= 0) return undefined;
      return db.laps.get(lapId(athlete.bib, apiRow.laps));
    },
    [athlete.bib, apiRow?.laps],
  );

  const lastLapCompletedAtMs = lastLap?.lapCompletedAt
    ? new Date(lastLap.lapCompletedAt).getTime()
    : null;

  const pos = predictPosition({
    row: apiRow,
    now,
    lastLapCompletedAtMs,
  });

  return (
    <li
      className="rounded-lg px-4 py-3 space-y-2"
      style={{
        border: "1px solid var(--wtm-border)",
        background: "var(--wtm-surface)",
        opacity: athlete.paused ? 0.55 : 1,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <Link href={`/a/${athlete.bib}`} className="min-w-0">
          <p className="truncate text-sm font-semibold flex items-center gap-1.5">
            {athlete.paused && (
              <span
                className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider"
                style={{ background: "var(--wtm-border)", color: "var(--wtm-fg-muted)" }}
              >
                Paused
              </span>
            )}
            <span className="truncate">{athlete.name}</span>
          </p>
          <p className="truncate text-xs opacity-60">
            <span style={{ color: "var(--wtm-accent)" }}>#{athlete.bib}</span>
            {pos.state === "racing" && ` · lap ${pos.currentLap}`}
            {pos.state === "pre-race" && " · pre-race"}
            {pos.state === "ended" && " · race ended"}
            {pos.state === "no-data" && " · no data yet"}
          </p>
        </Link>
        <span className="shrink-0 text-xs opacity-70 tabular-nums">
          {pos.avgLapSec ? `~${fmtSec(Math.round(pos.avgLapSec))}/lap` : ""}
        </span>
      </div>

      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--wtm-border)" }}
        aria-label={`${Math.round(pos.fraction * 100)}% through lap`}
      >
        <div
          className="h-full"
          style={{
            width: `${Math.round(pos.fraction * 100)}%`,
            background: "var(--wtm-accent)",
            transition: "width 600ms ease-out",
          }}
        />
      </div>

      <p className="text-[11px] opacity-60 tabular-nums">
        {pos.state === "racing" && (
          <>
            {Math.round(pos.fraction * 100)}% through lap {pos.currentLap}
            {pos.etaMsToLapEnd != null && ` · ETA ${fmtCountdown(pos.etaMsToLapEnd)}`}
          </>
        )}
        {pos.state === "pre-race" && "Race hasn't started."}
        {pos.state === "ended" && "Race window closed."}
        {pos.state === "no-data" && "Waiting for first feed update."}
      </p>
    </li>
  );
}

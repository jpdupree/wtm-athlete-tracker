"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useAthleteRow } from "@/hooks/useAthleteRow";
import { fmtAge, fmtSec, fmtVenueClock } from "@/lib/format";
import { predict } from "@/lib/predict";
import { Countdowns } from "@/components/Countdowns";
import { GoalMilesEditor } from "@/components/GoalMilesEditor";
import { FinishPrediction } from "@/components/FinishPrediction";
import { PaceChart } from "@/components/PaceChart";
import { IntakeBars } from "@/components/IntakeBars";
import { IntakeTargetsEditor } from "@/components/IntakeTargetsEditor";
import { StatsGrid } from "@/components/StatsGrid";
import { LapStrip } from "@/components/LapStrip";
import { LapCard } from "@/components/LapCard";
import { PauseToggle } from "@/components/PauseToggle";
import { PrintButton } from "@/components/PrintButton";
import { ShareButton } from "@/components/ShareButton";
import type { Athlete } from "@/lib/types";

export default function AthleteDetailPage({
  params,
}: {
  params: Promise<{ bib: string }>;
}) {
  const { bib: bibParam } = use(params);
  const bib = parseInt(bibParam, 10);
  const followed = useLiveQuery(() => db.followed.get(bib), [bib]);
  const { row, loading, error, ageMs } = useAthleteRow(bib);

  // dexie can hang in in-app webviews; collapse undefined → null after 3s
  // so the page renders SOMETHING instead of stalling on Loading…
  const [followedTimedOut, setFollowedTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFollowedTimedOut(true), 3000);
    return () => clearTimeout(t);
  }, []);

  // We can render the page as soon as we have the feed row, even if the
  // user hasn't followed this athlete. Followed-only sections (goal
  // editor, lap cards, intake) gate on `followed` below.
  if (loading && !row) {
    return <p className="p-6 text-sm opacity-50">Loading…</p>;
  }
  if (error && !row) {
    return (
      <main className="mx-auto max-w-md px-4 py-6 space-y-3">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60"
        >
          <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
        </Link>
        <p className="rounded-md border border-red-500/50 bg-red-500/10 px-3 py-2 text-sm">
          Couldn&apos;t load athlete data: {error.message}
        </p>
      </main>
    );
  }
  if (!row) {
    return <NotInFeed bib={bib} />;
  }

  // From here on, `row` exists. `followed` may still be undefined (loading)
  // or null (not in this device's DB). After the timeout, treat undefined
  // as null so the page proceeds in webviews where dexie hangs.
  const followedResolved =
    followed !== undefined || followedTimedOut ? (followed ?? null) : undefined;
  const isFollowed = !!followedResolved;
  const isLoadingFollowed = followedResolved === undefined;

  const displayName = followedResolved?.name ?? row.name;
  const displayBib = bib;
  const displayGender = followedResolved?.gender ?? row.gender ?? null;

  const apiLaps = row.laps ?? 0;
  const lapNumbers: number[] = [];
  for (let n = apiLaps + 1; n >= 1; n--) lapNumbers.push(n);

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Link
          href="/"
          className="print-hide inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60 hover:opacity-100"
        >
          <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
        </Link>
        <div className="flex items-center gap-2">
          {isFollowed && followedResolved && (
            <PauseToggle bib={followedResolved.bib} paused={!!followedResolved.paused} />
          )}
          <ShareButton name={displayName} bib={displayBib} />
          {isFollowed && <PrintButton />}
        </div>
      </div>

      <header
        className="rounded-lg px-4 py-4 space-y-2"
        style={{
          border: "1px solid var(--wtm-border)",
          background: "var(--wtm-surface)",
          borderLeft: "3px solid var(--wtm-accent)",
        }}
      >
        <h1 className="wtm-display text-3xl leading-none">{displayName}</h1>
        <p className="text-xs opacity-60 tabular-nums">
          <span className="font-semibold" style={{ color: "var(--wtm-accent)" }}>
            #{displayBib}
          </span>
          {displayGender && ` · ${displayGender}`}
          {followedResolved?.team && ` · ${followedResolved.team}`}
          {row.nation && ` · ${row.nation}`}
          {(row.overallRank > 0 || row.genderRank > 0) && (
            <>
              {" "}· #{row.overallRank} overall
              {row.genderRank > 0 && (
                <>
                  {" "}· #{row.genderRank} {displayGender ?? "gender"}
                </>
              )}
              {row.ageGroupRank != null && <> · #{row.ageGroupRank} AG</>}
            </>
          )}
        </p>
      </header>

      <Countdowns />

      {/* Non-followed (or still-loading-followed) visitors see a read-only
          snapshot built from the live feed row. A one-tap follow button
          upgrades them to the full interactive view in this same session. */}
      {!isFollowed && (
        <>
          <PublicSummary row={row} ageMs={ageMs} />
          <FollowCTA
            bib={bib}
            row={row}
            disabled={isLoadingFollowed}
          />
        </>
      )}

      {isFollowed && followedResolved && (
        <>
          <GoalMilesEditor
            bib={bib}
            goalMiles={followedResolved.goalMiles}
            goalPitSec={followedResolved.goalPitSec ?? null}
          />

          <FinishPrediction
            bib={bib}
            totalSec={row.totalSec ?? 0}
            laps={row.laps ?? 0}
            goalMiles={followedResolved.goalMiles}
          />

          <IntakeBars
            bib={bib}
            totalSec={row.totalSec ?? 0}
            targets={{
              calPerHr: followedResolved.targetCalPerHr,
              fluidMlPerHr: followedResolved.targetFluidMlPerHr,
              sodiumMgPerHr: followedResolved.targetSodiumMgPerHr,
            }}
          />
          <IntakeTargetsEditor athlete={followedResolved} />

          <div className="print-page-before">
            <PaceChart
              bib={bib}
              totalSec={row.totalSec ?? 0}
              laps={row.laps ?? 0}
              goalMiles={followedResolved.goalMiles}
            />
          </div>

          <StatsGrid
            bib={bib}
            totalSec={row.totalSec ?? 0}
            laps={row.laps ?? 0}
            lastLapSec={row.lastLapSec ?? null}
          />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide opacity-70">
                Laps &amp; pits
              </h2>
              <span className="text-xs opacity-50">
                feed updated {fmtAge(ageMs)}
              </span>
            </div>

            <LapStrip bib={bib} lapCount={apiLaps} />

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
        </>
      )}
    </main>
  );
}

// Read-only snapshot for visitors who haven't followed the athlete on this
// device. Built entirely from the live feed row — no dexie data needed,
// so it works in in-app webviews and on first-visit shares.
function PublicSummary({ row, ageMs }: { row: Athlete; ageMs: number }) {
  // Light-weight finish projection driven by overall-feed data only.
  // Mirrors what FinishPrediction shows, but with the cumulative-average
  // model since we don't have per-lap data here.
  const p = predict({
    totalSec: row.totalSec ?? 0,
    laps: row.laps,
    goalMiles: row.distanceMiles > 0 ? row.distanceMiles + 5 : null,
  });
  return (
    <section
      className="rounded-lg px-4 py-3 space-y-2"
      style={{ border: "1px solid var(--wtm-border)", background: "var(--wtm-surface)" }}
    >
      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Laps"
          main={row.laps > 0 ? `${row.laps} · ${row.distanceMiles} mi` : "—"}
        />
        <StatTile
          label="Total time"
          main={row.totalSec ? fmtSec(row.totalSec) : "—"}
        />
        <StatTile
          label="Last seen"
          main={row.lastSeenLabel || "—"}
          sub={row.lastSeenAt ? fmtVenueClock(row.lastSeenAt) : ""}
        />
        <StatTile
          label="Last lap"
          main={row.lastLapSec != null ? fmtSec(row.lastLapSec) : "—"}
        />
      </div>
      {p && (
        <p className="text-[11px] opacity-60 tabular-nums">
          At this pace, ~{p.goalLaps} laps before race end.
        </p>
      )}
      <p className="text-[11px] opacity-50">
        Feed updated {fmtAge(ageMs)} · read-only view
      </p>
    </section>
  );
}

function StatTile({ label, main, sub }: { label: string; main: string; sub?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide opacity-60">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums">{main}</p>
      {sub && <p className="text-[10px] opacity-50 truncate">{sub}</p>}
    </div>
  );
}

function FollowCTA({
  bib,
  row,
  disabled,
}: {
  bib: number;
  row: Athlete;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inApp, setInApp] = useState(false);
  useEffect(() => {
    setInApp(isInAppBrowser());
  }, []);

  return (
    <section className="space-y-2">
      {inApp && (
        <p
          className="rounded-md px-3 py-2 text-xs"
          style={{
            border: "1px solid var(--wtm-accent)",
            background: "var(--wtm-accent-dim)",
          }}
        >
          You&apos;re viewing this in an in-app browser. To save followed
          athletes across sessions, tap the menu in the corner and choose
          &ldquo;Open in browser&rdquo; first.
        </p>
      )}
      <button
        type="button"
        disabled={busy || disabled}
        onClick={async () => {
          setError(null);
          setBusy(true);
          try {
            await db.followed.add({
              bib,
              name: row.name,
              gender: row.gender,
              team: row.category === "Team" || row.category === "TeamMember" ? row.category : null,
              goalMiles: null,
              addedAt: new Date().toISOString(),
            });
          } catch (e) {
            setError((e as Error).message || "Could not save.");
          } finally {
            setBusy(false);
          }
        }}
        className="block w-full rounded-md px-4 py-3 text-center text-sm font-semibold uppercase tracking-wider transition-colors disabled:opacity-50"
        style={{
          border: "1px solid var(--wtm-accent)",
          color: "var(--wtm-accent)",
          background: "transparent",
        }}
      >
        {busy ? "Adding…" : `+ Follow ${row.name}`}
      </button>
      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}
      <p className="text-[11px] opacity-50">
        Follow to set goals, track pits, log fuel, and see lap-by-lap detail.
      </p>
    </section>
  );
}

// Athlete bib that doesn't exist in the current feed at all (typo or
// athlete not in the published slice). Distinct from "exists but you
// don't follow them".
function NotInFeed({ bib }: { bib: number }) {
  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-3">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60"
      >
        <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
      </Link>
      <p
        className="rounded-md px-3 py-2 text-sm"
        style={{ border: "1px solid var(--wtm-border-strong)", background: "var(--wtm-surface)" }}
      >
        No athlete found for bib #{bib}. Double-check the link, or
        return home to search.
      </p>
    </main>
  );
}

// Common in-app-webview UA tokens. These browsers keep their own
// IndexedDB sandboxed away from the main browser.
function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  return /\b(FBAN|FBAV|FBIOS|FB_IAB|FB4A|Instagram|LinkedInApp|Line|MicroMessenger|musical_ly|BytedanceWebview|TwitterAndroid)\b/i.test(
    navigator.userAgent,
  );
}

"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Lap } from "@/lib/db";
import { useNow } from "@/hooks/useNow";
import { useSelectedYear } from "@/hooks/useSelectedYear";
import { LAP_MILES, raceTimingFor } from "@/lib/race";
import { fadeFactor, paceStatus, type PaceStatus } from "@/lib/predict";

const W = 320;
const H = 220;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 30;

const STATUS_STROKE: Record<PaceStatus, string> = {
  green: "#16a34a",
  amber: "#d97706",
  red: "#dc2626",
};

type Segment = {
  kind: "pit" | "lap";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  status: PaceStatus | null;
};

export function PaceChart({
  bib,
  totalSec,
  laps,
  goalMiles,
}: {
  bib: number;
  totalSec: number;
  laps: number;
  goalMiles: number | null;
}) {
  const now = useNow(10_000);
  const [year] = useSelectedYear();
  const lapRows = useLiveQuery(
    () => db.laps.where("bib").equals(bib).sortBy("lapNumber"),
    [bib],
  );

  if (!goalMiles) {
    return (
      <div className="rounded-lg border border-dashed border-current/20 px-4 py-3 text-sm opacity-70">
        Set a goal to see the pace chart.
      </div>
    );
  }

  // Lap timestamps in db.laps are stored in the year's wall-clock (set by
  // raceFeed/passings when the data was ingested). Compute the chart
  // window against the same year's RACE_START so 2024 lap times don't
  // fall a half-year outside the plotted axis.
  const timing = raceTimingFor(year);
  const raceStartMs = timing.start.getTime();
  const raceEndMs = timing.end.getTime();
  const cutoffMs = timing.lastLapStartCutoff.getTime();
  const windowSec = (raceEndMs - raceStartMs) / 1000;
  const cutoffSec = (cutoffMs - raceStartMs) / 1000;

  const secFromStart = (iso: string): number =>
    (new Date(iso).getTime() - raceStartMs) / 1000;

  // ---- Build segments per lap.
  //
  // X-axis is wall-clock from race start (race time runs continuously,
  // including during pits). Each lap is drawn as the finish-to-finish
  // interval connecting the previous lap's dot to this lap's dot — the
  // pit portion (finish → next start) is dashed, the running portion
  // (start → finish) is solid. Lap durations (used by the prediction)
  // are wall-clock-per-lap so a fading athlete's projection slows down
  // with them.
  const segments: Segment[] = [];
  const lapMarkers: Array<{ x: number; y: number }> = [];

  const validLaps = (lapRows ?? []).filter((l): l is Lap => !!l.lapCompletedAt);

  // Extend the X-axis to fit any late-finishing final lap (an athlete
  // who started a lap before the 24h cutoff still gets credit even if
  // it lands past 25.5h wall-clock). Cap removed so the line is never
  // clipped against the right edge.
  let axisMaxSec = windowSec;
  for (const lap of validLaps) {
    const s = secFromStart(lap.lapCompletedAt!);
    if (Number.isFinite(s) && s > axisMaxSec) axisMaxSec = s;
  }

  const lapDurations: number[] = [];

  let lastLapEndSec = 0;
  let lastLapEndMiles = 0;
  let prevEndSecForDur = 0;
  for (const lap of validLaps) {
    const n = lap.lapNumber;
    const lapEndSec = secFromStart(lap.lapCompletedAt!);
    if (!Number.isFinite(lapEndSec) || lapEndSec < 0 || lapEndSec > axisMaxSec) continue;

    const lapEndY = n * LAP_MILES;
    const prevY = (n - 1) * LAP_MILES;

    const priorDurs = lapDurations.slice();
    const thisLapDur = lapEndSec - prevEndSecForDur;
    const throughThis = [...priorDurs, thisLapDur];

    const statusAtLapEnd = paceStatus({
      totalSec: lapEndSec,
      laps: n,
      goalMiles,
      lapSecs: throughThis,
    });

    const hasLapStart = !!lap.lapStartedAt;
    const hasPit = lap.pitStartedAt && lap.pitCompletedAt;

    // Pit BEFORE this lap (= finish-to-start of the previous lap → this
    // lap's start). Stored on the previous lap's row, so for lap N≥2
    // we read prevLap's pitStartedAt/pitCompletedAt. Drawing it as the
    // dashed leading portion of this lap's finish-to-finish segment.
    // For lap 1 there is no prior pit, so the segment is purely solid.
    if (hasLapStart) {
      const lapStartSec = secFromStart(lap.lapStartedAt!);
      // Solid running portion: start → finish of this lap.
      segments.push({
        kind: "lap",
        x1: lapStartSec,
        y1: prevY,
        x2: lapEndSec,
        y2: lapEndY,
        status: statusAtLapEnd,
      });
    } else {
      segments.push({
        kind: "lap",
        x1: lastLapEndSec,
        y1: lastLapEndMiles,
        x2: lapEndSec,
        y2: lapEndY,
        status: statusAtLapEnd,
      });
    }

    if (hasPit) {
      const pitStartSec = secFromStart(lap.pitStartedAt!);
      const pitEndSec = secFromStart(lap.pitCompletedAt!);
      segments.push({
        kind: "pit",
        x1: pitStartSec,
        y1: lapEndY,
        x2: pitEndSec,
        y2: lapEndY,
        status: statusAtLapEnd,
      });
    }

    lapMarkers.push({ x: lapEndSec, y: lapEndY });
    lastLapEndSec = lapEndSec;
    lastLapEndMiles = lapEndY;
    lapDurations.push(thisLapDur);
    prevEndSecForDur = lapEndSec;
  }

  // Projection at TRAILING pace (last 3 lap wall-clock durations), so
  // a fading athlete's forecast doesn't keep tilting upward at their
  // early-lap pace. Falls back to cumulative avg if we have no per-lap
  // durations yet.
  const trailWindow = lapDurations.slice(-3);
  const trailAvg =
    trailWindow.length > 0
      ? trailWindow.reduce((s, x) => s + x, 0) / trailWindow.length
      : laps > 0 && totalSec > 0
        ? totalSec / laps
        : null;

  const lastY = lastLapEndMiles;
  const lastX = lastLapEndSec;

  // Projection polyline: each remaining lap k is scaled by the historical
  // fadeFactor relative to current lap N, so early-race projections bend
  // upward instead of flat-extrapolating fresh-legs pace. Late-race fade
  // ratios are ≈1.0, so the curve straightens out where the data says it
  // should.
  const goalLaps = Math.ceil(goalMiles / LAP_MILES);
  const projectionPoints: Array<{ x: number; y: number }> = [];
  if (trailAvg && lastY < goalMiles && laps > 0) {
    let projElapsed = lastX;
    for (let k = laps + 1; k <= goalLaps; k++) {
      const lapDur = trailAvg * fadeFactor(laps, k);
      const next = { x: projElapsed + lapDur, y: k * LAP_MILES };
      if (next.x > windowSec) {
        const prev = projectionPoints[projectionPoints.length - 1] ?? { x: lastX, y: lastY };
        const frac = (windowSec - prev.x) / (next.x - prev.x);
        projectionPoints.push({
          x: windowSec,
          y: prev.y + (next.y - prev.y) * Math.max(0, Math.min(1, frac)),
        });
        break;
      }
      projectionPoints.push(next);
      projElapsed = next.x;
    }
  }
  const projectionEnd = projectionPoints[projectionPoints.length - 1] ?? null;

  const yMax = Math.max(goalMiles, projectionEnd?.y ?? 0, lastY) * 1.08;

  const sx = (x: number) => PAD_L + (x / axisMaxSec) * (W - PAD_L - PAD_R);
  const sy = (y: number) => H - PAD_B - (y / yMax) * (H - PAD_T - PAD_B);

  const cutoffPaceY = Math.max(0, goalMiles - LAP_MILES);

  const nowSec = Math.min(axisMaxSec, Math.max(0, (now - raceStartMs) / 1000));
  const showNow = nowSec > 0 && nowSec < axisMaxSec;

  const xTicks: number[] = [];
  for (let h = 0; h <= axisMaxSec / 3600; h += 4) xTicks.push(h * 3600);

  const yStep = goalMiles >= 80 ? 20 : goalMiles >= 40 ? 10 : 5;
  const yTicks: number[] = [];
  for (let m = 0; m <= yMax; m += yStep) yTicks.push(m);

  return (
    <div className="rounded-lg border border-current/20 px-2 py-3">
      <p className="px-2 text-xs uppercase tracking-wide opacity-60">Pace</p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        role="img"
        aria-label={`Pace chart for bib ${bib}`}
      >
        {xTicks.map((t) => (
          <g key={`x${t}`}>
            <line
              x1={sx(t)}
              y1={PAD_T}
              x2={sx(t)}
              y2={H - PAD_B}
              stroke="currentColor"
              opacity="0.06"
            />
            <text
              x={sx(t)}
              y={H - PAD_B + 13}
              textAnchor="middle"
              fontSize="9"
              fill="currentColor"
              opacity="0.6"
            >
              {t / 3600}h
            </text>
          </g>
        ))}
        {yTicks.map((m) => (
          <g key={`y${m}`}>
            <line
              x1={PAD_L}
              y1={sy(m)}
              x2={W - PAD_R}
              y2={sy(m)}
              stroke="currentColor"
              opacity="0.06"
            />
            <text
              x={PAD_L - 3}
              y={sy(m) + 3}
              textAnchor="end"
              fontSize="9"
              fill="currentColor"
              opacity="0.6"
            >
              {m}
            </text>
          </g>
        ))}

        {/* Required-pace diagonals */}
        <line
          x1={sx(0)}
          y1={sy(0)}
          x2={sx(windowSec)}
          y2={sy(goalMiles)}
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.3"
        />

        {cutoffPaceY > 0 && (
          <line
            x1={sx(0)}
            y1={sy(0)}
            x2={sx(cutoffSec)}
            y2={sy(cutoffPaceY)}
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.3"
          />
        )}

        {/* One combined label for both reference diagonals (race-end pace
            and cutoff-start pace). Lives top-left so it doesn't fight the
            goal-miles label sitting at the top-right of the chart. */}
        <text
          x={PAD_L + 2}
          y={PAD_T + 9}
          textAnchor="start"
          fontSize="8"
          fill="currentColor"
          opacity="0.6"
        >
          required pace
        </text>

        {/* Cutoff vertical at 24h — final lap must START before this.
            Athletes who started a lap before this line and finished it
            after still get credit, so segments that cross this line
            are valid (not a missed cutoff). */}
        <line
          x1={sx(cutoffSec)}
          y1={PAD_T}
          x2={sx(cutoffSec)}
          y2={H - PAD_B}
          stroke="currentColor"
          opacity="0.18"
        />
        <text
          x={sx(cutoffSec) + 2}
          y={PAD_T + 9}
          textAnchor="start"
          fontSize="8"
          fill="currentColor"
          opacity="0.6"
        >
          24h cutoff
        </text>

        {/* Goal horizontal */}
        <line
          x1={PAD_L}
          y1={sy(goalMiles)}
          x2={W - PAD_R}
          y2={sy(goalMiles)}
          stroke="currentColor"
          strokeDasharray="2 3"
          opacity="0.5"
        />
        <text
          x={W - PAD_R - 2}
          y={sy(goalMiles) - 3}
          textAnchor="end"
          fontSize="9"
          fill="currentColor"
          opacity="0.7"
        >
          goal {goalMiles}mi
        </text>

        {/* Now marker */}
        {showNow && (
          <line
            x1={sx(nowSec)}
            y1={PAD_T}
            x2={sx(nowSec)}
            y2={H - PAD_B}
            stroke="currentColor"
            strokeDasharray="1 2"
            opacity="0.3"
          />
        )}

        {/* Actual series — one <line> per lap/pit segment, colored by paceStatus at segment end.
            Solid = lap running (start → finish). Dashed = pit (finish → next start). */}
        {segments.map((seg, i) => {
          const stroke = seg.status ? STATUS_STROKE[seg.status] : "currentColor";
          const statusLabel = seg.status === "green"
            ? "on pace"
            : seg.status === "amber"
              ? "tight"
              : seg.status === "red"
                ? "behind"
                : "no goal";
          return (
            <line
              key={i}
              x1={sx(seg.x1)}
              y1={sy(seg.y1)}
              x2={sx(seg.x2)}
              y2={sy(seg.y2)}
              stroke={stroke}
              strokeWidth={seg.kind === "lap" ? 2.2 : 1.6}
              strokeLinecap="round"
              strokeDasharray={seg.kind === "pit" ? "3 2" : undefined}
              opacity={seg.status ? 1 : 0.7}
            >
              <title>{`${seg.kind === "pit" ? "Pit" : "Lap"} segment — ${statusLabel}`}</title>
            </line>
          );
        })}
        {lapMarkers.map((p, i) => (
          <circle
            key={`m${i}`}
            cx={sx(p.x)}
            cy={sy(p.y)}
            r="2"
            fill="currentColor"
          />
        ))}

        {/* Projection — polyline from last completed lap through each
            historically-faded projected lap end. */}
        {projectionEnd && projectionPoints.length > 0 && (
          <>
            <path
              d={`M ${sx(lastX).toFixed(1)} ${sy(lastY).toFixed(1)} ${projectionPoints
                .map((p) => `L ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
                .join(" ")}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeDasharray="4 3"
              opacity="0.55"
            />
            <circle
              cx={sx(projectionEnd.x)}
              cy={sy(projectionEnd.y)}
              r="2.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            />
          </>
        )}

        {/* Legend */}
        <g transform={`translate(${PAD_L}, ${H - 6})`}>
          <line x1="0" y1="0" x2="14" y2="0" stroke={STATUS_STROKE.green} strokeWidth="2" />
          <text x="18" y="3" fontSize="8" fill="currentColor" opacity="0.7">on pace</text>
          <line x1="58" y1="0" x2="72" y2="0" stroke={STATUS_STROKE.amber} strokeWidth="2" />
          <text x="76" y="3" fontSize="8" fill="currentColor" opacity="0.7">tight</text>
          <line x1="104" y1="0" x2="118" y2="0" stroke={STATUS_STROKE.red} strokeWidth="2" />
          <text x="122" y="3" fontSize="8" fill="currentColor" opacity="0.7">behind</text>
          <line
            x1="158"
            y1="0"
            x2="172"
            y2="0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeDasharray="3 2"
            opacity="0.7"
          />
          <text x="176" y="3" fontSize="8" fill="currentColor" opacity="0.7">pit</text>
        </g>
      </svg>
      <p className="px-2 pt-1 text-[11px] opacity-60 leading-snug">
        Solid segments: laps (start → finish). Dashed segments: pits
        (finish → next start). Color reflects whether the projected
        finish is hitting the goal at that point. Thin diagonals show
        the minimum pace to hit the goal — upper line is finishing
        exactly at race end, lower is starting the final lap by cutoff.
      </p>
    </div>
  );
}

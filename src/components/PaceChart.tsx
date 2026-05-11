"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db, type Lap } from "@/lib/db";
import { useNow } from "@/hooks/useNow";
import { LAP_MILES, LAST_LAP_START_CUTOFF, RACE_END, RACE_START } from "@/lib/race";
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

  const raceStartMs = RACE_START.getTime();
  const raceEndMs = RACE_END.getTime();
  const cutoffMs = LAST_LAP_START_CUTOFF.getTime();
  const windowSec = (raceEndMs - raceStartMs) / 1000;
  const cutoffSec = (cutoffMs - raceStartMs) / 1000;

  const secFromStart = (iso: string): number =>
    (new Date(iso).getTime() - raceStartMs) / 1000;

  // ---- Build segments (pit + lap) per lap row.
  const segments: Segment[] = [];
  const lapMarkers: Array<{ x: number; y: number }> = [];

  const validLaps = (lapRows ?? []).filter((l): l is Lap => !!l.lapCompletedAt);

  // Wall-clock duration of each completed lap (pit + running). Used for the
  // trailing-pace prediction so a fading athlete's projection slows down with
  // them, instead of being anchored to their fresh-legs early-lap average.
  const lapDurations: number[] = [];

  let lastLapEndSec = 0;
  let lastLapEndMiles = 0;
  let prevEndSecForDur = 0;
  for (const lap of validLaps) {
    const n = lap.lapNumber;
    const lapEndSec = secFromStart(lap.lapCompletedAt!);
    if (!Number.isFinite(lapEndSec) || lapEndSec < 0 || lapEndSec > windowSec) continue;

    const lapEndY = n * LAP_MILES;
    const prevY = (n - 1) * LAP_MILES;

    // Trailing pace at the END of pit (before lap N starts) sees only laps
    // strictly before this one; at the END of lap N it includes this lap.
    const priorDurs = lapDurations.slice();
    const thisLapDur = lapEndSec - prevEndSecForDur;
    const throughThis = [...priorDurs, thisLapDur];

    // The first few laps don't carry enough signal to confidently call a
    // segment off-pace — leave them neutral (gray) so we don't shout red
    // at someone who's just settling into a routine.
    const MIN_LAPS_FOR_COLOR = 4;
    const statusAtLapEnd =
      n >= MIN_LAPS_FOR_COLOR
        ? paceStatus({ totalSec: lapEndSec, laps: n, goalMiles, lapSecs: throughThis })
        : null;
    const statusAtPitEnd =
      n - 1 >= MIN_LAPS_FOR_COLOR
        ? paceStatus({ totalSec: lapEndSec, laps: n - 1, goalMiles, lapSecs: priorDurs })
        : null;

    const hasPit = lap.pitStartedAt && lap.pitCompletedAt;
    const hasLapStart = !!lap.lapStartedAt;

    if (hasPit && hasLapStart) {
      const pitStartSec = secFromStart(lap.pitStartedAt!);
      const pitEndSec = secFromStart(lap.pitCompletedAt!);
      const lapStartSec = secFromStart(lap.lapStartedAt!);
      segments.push({
        kind: "pit",
        x1: pitStartSec,
        y1: prevY,
        x2: pitEndSec,
        y2: prevY,
        status: statusAtPitEnd,
      });
      segments.push({
        kind: "lap",
        x1: lapStartSec,
        y1: prevY,
        x2: lapEndSec,
        y2: lapEndY,
        status: statusAtLapEnd,
      });
    } else if (hasLapStart) {
      segments.push({
        kind: "lap",
        x1: secFromStart(lap.lapStartedAt!),
        y1: prevY,
        x2: lapEndSec,
        y2: lapEndY,
        status: statusAtLapEnd,
      });
    } else {
      // No segment-level breakdown — fall back to one combined line from
      // the prior lap end (or origin).
      segments.push({
        kind: "lap",
        x1: lastLapEndSec,
        y1: lastLapEndMiles,
        x2: lapEndSec,
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

  // Projection at TRAILING pace (last 3 lap wall-clock durations), so a
  // fading athlete's forecast doesn't keep tilting upward at their early-lap
  // pace. Falls back to cumulative avg if we somehow have no lap durations.
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

  const sx = (x: number) => PAD_L + (x / windowSec) * (W - PAD_L - PAD_R);
  const sy = (y: number) => H - PAD_B - (y / yMax) * (H - PAD_T - PAD_B);

  const cutoffPaceY = Math.max(0, goalMiles - LAP_MILES);

  const nowSec = Math.min(windowSec, Math.max(0, (now - raceStartMs) / 1000));
  const showNow = nowSec > 0 && nowSec < windowSec;

  const xTicks: number[] = [];
  for (let h = 0; h <= windowSec / 3600; h += 4) xTicks.push(h * 3600);

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
        <text
          x={sx(windowSec) - 2}
          y={sy(goalMiles) + 10}
          textAnchor="end"
          fontSize="8"
          fill="currentColor"
          opacity="0.55"
        >
          goal-by-end pace
        </text>

        {cutoffPaceY > 0 && (
          <>
            <line
              x1={sx(0)}
              y1={sy(0)}
              x2={sx(cutoffSec)}
              y2={sy(cutoffPaceY)}
              stroke="currentColor"
              strokeWidth="1"
              opacity="0.3"
            />
            <text
              x={sx(cutoffSec) - 2}
              y={sy(cutoffPaceY) - 3}
              textAnchor="end"
              fontSize="8"
              fill="currentColor"
              opacity="0.55"
            >
              start-final-lap pace
            </text>
          </>
        )}

        {/* Cutoff vertical at 24h */}
        <line
          x1={sx(cutoffSec)}
          y1={PAD_T}
          x2={sx(cutoffSec)}
          y2={H - PAD_B}
          stroke="currentColor"
          opacity="0.18"
        />

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

        {/* Actual series — one <line> per pit/lap segment, colored by paceStatus at segment end. */}
        {segments.map((seg, i) => {
          const stroke = seg.status ? STATUS_STROKE[seg.status] : "currentColor";
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
            />
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
        Solid segments: laps. Dashed segments: pit stops. Color reflects
        whether the projected finish is hitting the goal at that point.
      </p>
    </div>
  );
}

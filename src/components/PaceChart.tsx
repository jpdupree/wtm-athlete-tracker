"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useNow } from "@/hooks/useNow";
import { LAP_MILES, LAST_LAP_START_CUTOFF, RACE_END, RACE_START } from "@/lib/race";

const W = 320;
const H = 220;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

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

  const points: Array<{ x: number; y: number }> = [{ x: 0, y: 0 }];
  for (const lap of lapRows ?? []) {
    if (!lap.lapCompletedAt) continue;
    const x = (new Date(lap.lapCompletedAt).getTime() - raceStartMs) / 1000;
    if (Number.isNaN(x) || x < 0 || x > windowSec) continue;
    points.push({ x, y: lap.lapNumber * LAP_MILES });
  }
  points.sort((a, b) => a.x - b.x);
  const last = points[points.length - 1];

  const avgLapSec = laps > 0 && totalSec > 0 ? totalSec / laps : null;

  let projectionEnd: { x: number; y: number } | null = null;
  if (avgLapSec && last.y < goalMiles) {
    const slope = LAP_MILES / avgLapSec;
    const xToGoal = last.x + (goalMiles - last.y) / slope;
    projectionEnd =
      xToGoal <= windowSec
        ? { x: xToGoal, y: goalMiles }
        : { x: windowSec, y: last.y + (windowSec - last.x) * slope };
  }

  const yMax = Math.max(goalMiles, projectionEnd?.y ?? 0, last.y) * 1.08;

  const sx = (x: number) => PAD_L + (x / windowSec) * (W - PAD_L - PAD_R);
  const sy = (y: number) => H - PAD_B - (y / yMax) * (H - PAD_T - PAD_B);

  const actualPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(" ");

  const projPath = projectionEnd
    ? `M ${sx(last.x).toFixed(1)} ${sy(last.y).toFixed(1)} L ${sx(projectionEnd.x).toFixed(1)} ${sy(projectionEnd.y).toFixed(1)}`
    : null;

  // Required-pace diagonals from origin.
  //  - end-pace:    (0,0) → (raceEnd, goalMiles)
  //  - cutoff-pace: (0,0) → (cutoff,  goalMiles - LAP_MILES)
  //    (start the goal-completing lap by cutoff to have 1.5h to finish it)
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

        {/* Actual series */}
        <path d={actualPath} fill="none" stroke="currentColor" strokeWidth="2" />
        {points.map((p, i) =>
          i === 0 ? null : (
            <circle
              key={i}
              cx={sx(p.x)}
              cy={sy(p.y)}
              r="2"
              fill="currentColor"
            />
          ),
        )}

        {/* Projection */}
        {projPath && (
          <path
            d={projPath}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="4 3"
            opacity="0.55"
          />
        )}
        {projectionEnd && (
          <circle
            cx={sx(projectionEnd.x)}
            cy={sy(projectionEnd.y)}
            r="2.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )}
      </svg>
      <p className="px-2 pt-1 text-[11px] opacity-60 leading-snug">
        Solid: laps logged. Dashed: projection at current pace.
        Thin diagonals: required pace to hit goal by cutoff / race end.
      </p>
    </div>
  );
}

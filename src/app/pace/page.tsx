"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { LAP_MILES, RACE_END, RACE_START } from "@/lib/race";

// Ratio of pit time to lap (running) time used for the auto fill. Roughly
// matches what 2025 finishers' median totals worked out to once you back out
// the race window — pits are a small fraction of each cycle, not half.
const AUTO_PIT_RATIO = 0.07;

const RACE_WINDOW_SEC =
  (RACE_END.getTime() - RACE_START.getTime()) / 1000;

function autoLapPit(goalLaps: number): { lap: number; pit: number } {
  if (goalLaps < 1) return { lap: 4500, pit: 300 };
  // For exact race-end finish: goalLaps * lap + (goalLaps - 1) * pit = window
  // With pit = r * lap → lap = window / (goalLaps + (goalLaps - 1) * r)
  const denom = goalLaps + Math.max(0, goalLaps - 1) * AUTO_PIT_RATIO;
  const lap = RACE_WINDOW_SEC / denom;
  const pit = AUTO_PIT_RATIO * lap;
  return { lap: Math.round(lap), pit: Math.round(pit) };
}

// Accept H:MM:SS, MM:SS, or decimal minutes ("5", "5.5", ".75").
function parseTime(s: string): number | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+(:\d{1,2}){1,2}$/.test(t)) {
    let total = 0;
    for (const p of t.split(":")) {
      total = total * 60 + parseInt(p, 10);
    }
    return total;
  }
  if (/^\d*\.?\d+$/.test(t)) {
    return Math.round(parseFloat(t) * 60);
  }
  return null;
}

function fmtHm(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  return `${m}:${String(ss).padStart(2, "0")}`;
}

export default function PaceCalculatorPage() {
  const [milesStr, setMilesStr] = useState("100");
  const goalMiles = useMemo(() => {
    const n = parseInt(milesStr, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }, [milesStr]);
  const goalLaps = Math.max(1, Math.ceil(goalMiles / LAP_MILES));

  const auto = useMemo(() => autoLapPit(goalLaps), [goalLaps]);

  // Track whether each input has been manually edited. While "dirty" is
  // false, the field tracks the auto value as the goal changes; once the
  // user types in it the value sticks until they reset.
  const [lapDirty, setLapDirty] = useState(false);
  const [pitDirty, setPitDirty] = useState(false);
  const [lapStr, setLapStr] = useState(() => fmtHm(autoLapPit(20).lap));
  const [pitStr, setPitStr] = useState(() => fmtHm(autoLapPit(20).pit));

  useEffect(() => {
    if (!lapDirty) setLapStr(fmtHm(auto.lap));
    if (!pitDirty) setPitStr(fmtHm(auto.pit));
  }, [auto, lapDirty, pitDirty]);

  const lapSec = parseTime(lapStr) ?? auto.lap;
  const pitSec = parseTime(pitStr) ?? auto.pit;

  // Per-lap overrides. Indexed by lap number (1..goalLaps) for laps and
  // pit number (1..goalLaps-1) for pits. Stored as raw input strings so
  // partial typing is allowed; empty string = "use the global value".
  const [lapOverrides, setLapOverrides] = useState<Record<number, string>>({});
  const [pitOverrides, setPitOverrides] = useState<Record<number, string>>({});

  const numPits = Math.max(0, goalLaps - 1);

  const lapSecAt = (n: number): number => {
    const raw = lapOverrides[n];
    if (raw == null || raw.trim() === "") return lapSec;
    return parseTime(raw) ?? lapSec;
  };
  const pitSecAt = (n: number): number => {
    const raw = pitOverrides[n];
    if (raw == null || raw.trim() === "") return pitSec;
    return parseTime(raw) ?? pitSec;
  };

  let totalRun = 0;
  for (let i = 1; i <= goalLaps; i++) totalRun += lapSecAt(i);
  let totalPit = 0;
  for (let i = 1; i <= numPits; i++) totalPit += pitSecAt(i);
  const totalSec = totalRun + totalPit;
  const marginSec = RACE_WINDOW_SEC - totalSec;
  const onPace = marginSec >= 0;

  const resetAuto = () => {
    setLapDirty(false);
    setPitDirty(false);
    setLapStr(fmtHm(auto.lap));
    setPitStr(fmtHm(auto.pit));
  };

  const inputStyle: React.CSSProperties = {
    border: "1px solid var(--wtm-border)",
    background: "var(--wtm-surface)",
  };
  const verdictStyle: React.CSSProperties = onPace
    ? { border: "1px solid #166534", background: "rgba(22, 101, 52, 0.10)", color: "var(--wtm-fg)" }
    : { border: "1px solid #b91c1c", background: "rgba(185, 28, 28, 0.10)", color: "var(--wtm-fg)" };

  return (
    <main className="mx-auto max-w-md px-4 py-6 space-y-4">
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-xs uppercase tracking-wider opacity-60 hover:opacity-100"
      >
        <span style={{ color: "var(--wtm-accent)" }}>←</span> Home
      </Link>

      <header className="space-y-1">
        <h1 className="wtm-display text-3xl leading-none">Pace calculator</h1>
        <p className="text-xs opacity-60 leading-snug">
          Plan a race-day target from a mileage goal. Lap and pit times auto-fill
          to a finish at the cutoff; edit either to see how the math shifts.
        </p>
      </header>

      <section className="space-y-3">
        <label className="block space-y-1">
          <span className="block text-xs uppercase tracking-wide opacity-60">
            Goal miles
          </span>
          <input
            inputMode="numeric"
            value={milesStr}
            onChange={(e) => setMilesStr(e.target.value)}
            className="w-full rounded-md px-2 py-1 text-lg tabular-nums"
            style={inputStyle}
          />
          <span className="block text-[11px] opacity-60 tabular-nums">
            {goalMiles > 0
              ? `${goalLaps} laps × ${LAP_MILES} mi · ${numPits} pit${numPits === 1 ? "" : "s"}`
              : "—"}
          </span>
        </label>

        <label className="block space-y-1">
          <span className="block text-xs uppercase tracking-wide opacity-60">
            Lap time (running)
          </span>
          <input
            inputMode="decimal"
            value={lapStr}
            onChange={(e) => {
              setLapStr(e.target.value);
              setLapDirty(true);
            }}
            placeholder="H:MM:SS, MM:SS, or minutes"
            className="w-full rounded-md px-2 py-1 text-lg tabular-nums"
            style={inputStyle}
          />
        </label>

        <label className="block space-y-1">
          <span className="block text-xs uppercase tracking-wide opacity-60">
            Pit time (per stop)
          </span>
          <input
            inputMode="decimal"
            value={pitStr}
            onChange={(e) => {
              setPitStr(e.target.value);
              setPitDirty(true);
            }}
            placeholder="MM:SS or minutes"
            className="w-full rounded-md px-2 py-1 text-lg tabular-nums"
            style={inputStyle}
          />
        </label>

        {(lapDirty || pitDirty) && (
          <button
            type="button"
            onClick={resetAuto}
            className="text-xs uppercase tracking-wider opacity-70 hover:opacity-100"
            style={{ color: "var(--wtm-accent)" }}
          >
            ↺ Reset to auto
          </button>
        )}
      </section>

      <section
        className="rounded-lg px-4 py-3 space-y-1 text-sm"
        style={{ border: "1px solid var(--wtm-border)", background: "var(--wtm-surface)" }}
      >
        <Row label="Total run" value={fmtHm(totalRun)} />
        <Row label="Total pit" value={fmtHm(totalPit)} sub={`${numPits} pit${numPits === 1 ? "" : "s"}`} />
        <Row label="Total time" value={fmtHm(totalSec)} bold />
        <Row
          label="Race window"
          value={fmtHm(RACE_WINDOW_SEC)}
          sub="cutoff to race end"
        />
      </section>

      <section className="rounded-lg px-4 py-3" style={verdictStyle}>
        <p className="text-xs uppercase tracking-wide opacity-70">
          {onPace ? "On pace" : "Won't make it"}
        </p>
        <p className="mt-1 text-lg font-semibold tabular-nums">
          {onPace
            ? `${fmtHm(marginSec)} to spare`
            : `${fmtHm(-marginSec)} past race end`}
        </p>
      </section>

      <Chart
        goalLaps={goalLaps}
        goalMiles={goalMiles}
        lapSecAt={lapSecAt}
        pitSecAt={pitSecAt}
      />

      <section className="space-y-2">
        <div className="flex items-baseline justify-between">
          <p className="text-xs uppercase tracking-wide opacity-60">
            Per-lap plan
          </p>
          <button
            type="button"
            onClick={() => {
              setLapOverrides({});
              setPitOverrides({});
            }}
            className="text-[11px] uppercase tracking-wider opacity-70 hover:opacity-100"
            style={{ color: "var(--wtm-accent)" }}
            disabled={
              Object.keys(lapOverrides).length === 0 &&
              Object.keys(pitOverrides).length === 0
            }
          >
            ↺ Clear overrides
          </button>
        </div>
        <p className="text-[11px] opacity-60 leading-snug">
          Blank cells use the global lap / pit time above. Type a value
          (H:MM:SS, MM:SS, or minutes) to override that specific lap or pit.
        </p>
        <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--wtm-border)" }}>
          <div
            className="grid grid-cols-[auto_1fr_1fr] gap-x-2 text-[10px] uppercase tracking-wide opacity-60 px-3 py-1"
            style={{ background: "var(--wtm-surface-2)" }}
          >
            <span>#</span>
            <span className="text-center">Lap (run)</span>
            <span className="text-center">Pit (after)</span>
          </div>
          {Array.from({ length: goalLaps }, (_, idx) => {
            const n = idx + 1;
            const isLastLap = n === goalLaps;
            const lapPh = fmtHm(lapSec);
            const pitPh = fmtHm(pitSec);
            return (
              <div
                key={n}
                className="grid grid-cols-[auto_1fr_1fr] gap-x-2 items-center px-3 py-1.5"
                style={{ borderTop: "1px solid var(--wtm-border)" }}
              >
                <span className="text-xs opacity-70 tabular-nums w-6">{n}</span>
                <input
                  inputMode="decimal"
                  value={lapOverrides[n] ?? ""}
                  onChange={(e) =>
                    setLapOverrides((prev) => ({ ...prev, [n]: e.target.value }))
                  }
                  placeholder={lapPh}
                  aria-label={`Lap ${n} time`}
                  className="w-full rounded px-1.5 py-0.5 text-sm tabular-nums"
                  style={{
                    border: "1px solid var(--wtm-border)",
                    background: lapOverrides[n] ? "var(--wtm-accent-dim)" : "transparent",
                  }}
                />
                {isLastLap ? (
                  <span className="text-sm opacity-30 text-center">—</span>
                ) : (
                  <input
                    inputMode="decimal"
                    value={pitOverrides[n] ?? ""}
                    onChange={(e) =>
                      setPitOverrides((prev) => ({ ...prev, [n]: e.target.value }))
                    }
                    placeholder={pitPh}
                    aria-label={`Pit ${n} time`}
                    className="w-full rounded px-1.5 py-0.5 text-sm tabular-nums"
                    style={{
                      border: "1px solid var(--wtm-border)",
                      background: pitOverrides[n] ? "var(--wtm-accent-dim)" : "transparent",
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function Row({
  label,
  value,
  sub,
  bold,
}: {
  label: string;
  value: string;
  sub?: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-xs uppercase tracking-wide opacity-60">{label}</span>
      <span
        className={`tabular-nums ${bold ? "font-semibold text-base" : ""}`}
      >
        {value}
        {sub && <span className="ml-2 text-[10px] opacity-50">{sub}</span>}
      </span>
    </div>
  );
}

const W = 320;
const H = 200;
const PAD_L = 30;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 28;

function Chart({
  goalLaps,
  goalMiles,
  lapSecAt,
  pitSecAt,
}: {
  goalLaps: number;
  goalMiles: number;
  lapSecAt: (n: number) => number;
  pitSecAt: (n: number) => number;
}) {
  if (goalMiles <= 0) return null;

  // Build the projected miles-vs-time path. Each lap is a diagonal up by
  // LAP_MILES over the lap's effective run time; each pit is a horizontal
  // hold at the lap's miles for the pit-after duration. Both come from the
  // per-lap functions so per-lap overrides flow through automatically.
  type Pt = { x: number; y: number };
  const pts: Pt[] = [{ x: 0, y: 0 }];
  let t = 0;
  let m = 0;
  for (let i = 1; i <= goalLaps; i++) {
    t += lapSecAt(i);
    m += LAP_MILES;
    pts.push({ x: t, y: m });
    if (i < goalLaps) {
      t += pitSecAt(i);
      pts.push({ x: t, y: m });
    }
  }
  const finishSec = t;

  // X scale extends to whichever is longer — finishSec or race window — so
  // overshoots are visible on the same chart.
  const xMaxSec = Math.max(finishSec, RACE_WINDOW_SEC) * 1.04;
  const yMaxMi = Math.max(goalMiles, m) * 1.06;

  const sx = (x: number) => PAD_L + (x / xMaxSec) * (W - PAD_L - PAD_R);
  const sy = (y: number) => H - PAD_B - (y / yMaxMi) * (H - PAD_T - PAD_B);

  const xTicks: number[] = [];
  for (let h = 0; h <= xMaxSec / 3600; h += 4) xTicks.push(h * 3600);

  const yStep = goalMiles >= 80 ? 20 : goalMiles >= 40 ? 10 : 5;
  const yTicks: number[] = [];
  for (let mi = 0; mi <= yMaxMi; mi += yStep) yTicks.push(mi);

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(1)} ${sy(p.y).toFixed(1)}`)
    .join(" ");

  const finishOver = finishSec > RACE_WINDOW_SEC;
  const lineColor = finishOver ? "#dc2626" : "#16a34a";

  return (
    <div className="rounded-lg px-2 py-3" style={{ border: "1px solid var(--wtm-border)" }}>
      <p className="px-2 text-xs uppercase tracking-wide opacity-60">Projected pace</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label="Projected pace chart">
        {xTicks.map((tk) => (
          <g key={`x${tk}`}>
            <line x1={sx(tk)} y1={PAD_T} x2={sx(tk)} y2={H - PAD_B} stroke="currentColor" opacity="0.06" />
            <text x={sx(tk)} y={H - PAD_B + 12} textAnchor="middle" fontSize="9" fill="currentColor" opacity="0.6">
              {tk / 3600}h
            </text>
          </g>
        ))}
        {yTicks.map((mi) => (
          <g key={`y${mi}`}>
            <line x1={PAD_L} y1={sy(mi)} x2={W - PAD_R} y2={sy(mi)} stroke="currentColor" opacity="0.06" />
            <text x={PAD_L - 3} y={sy(mi) + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.6">
              {mi}
            </text>
          </g>
        ))}

        {/* Race-end vertical */}
        <line
          x1={sx(RACE_WINDOW_SEC)}
          y1={PAD_T}
          x2={sx(RACE_WINDOW_SEC)}
          y2={H - PAD_B}
          stroke="currentColor"
          strokeDasharray="2 3"
          opacity="0.45"
        />
        <text
          x={sx(RACE_WINDOW_SEC) - 2}
          y={PAD_T + 9}
          textAnchor="end"
          fontSize="8"
          fill="currentColor"
          opacity="0.6"
        >
          race end
        </text>

        {/* Goal horizontal */}
        <line
          x1={PAD_L}
          y1={sy(goalMiles)}
          x2={W - PAD_R}
          y2={sy(goalMiles)}
          stroke="currentColor"
          strokeDasharray="2 3"
          opacity="0.45"
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

        {/* Projected path */}
        <path d={pathD} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
        <circle cx={sx(finishSec)} cy={sy(m)} r="3" fill={lineColor} />
      </svg>
      <p className="px-2 pt-1 text-[11px] opacity-60 leading-snug">
        Diagonals: lap runs. Horizontal jogs: pits. Endpoint colored green if
        the goal lands before race end, red if past.
      </p>
    </div>
  );
}

"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { INTAKE_DEFAULTS, computeRates } from "@/lib/intake";

export function IntakeBars({
  bib,
  totalSec,
  targets,
}: {
  bib: number;
  totalSec: number;
  targets: {
    calPerHr?: number | null;
    fluidMlPerHr?: number | null;
    sodiumMgPerHr?: number | null;
  };
}) {
  const fuel = useLiveQuery(() => db.fuel.where("bib").equals(bib).toArray(), [bib]);
  const laps = useLiveQuery(() => db.laps.where("bib").equals(bib).toArray(), [bib]);

  if (!fuel || !laps) return null;

  const targetCal = targets.calPerHr ?? INTAKE_DEFAULTS.calPerHr;
  const targetFluid = targets.fluidMlPerHr ?? INTAKE_DEFAULTS.fluidMlPerHr;
  const targetNa = targets.sodiumMgPerHr ?? INTAKE_DEFAULTS.sodiumMgPerHr;

  const rates = computeRates({ fuel, laps, totalSec });
  const hasData = totalSec > 0;

  return (
    <div className="rounded-lg border border-current/20 px-4 py-3 space-y-2">
      <p className="text-xs uppercase tracking-wide opacity-60">Intake / hour</p>
      <Bar
        label="Calories"
        actual={rates.perHour.cal}
        target={targetCal}
        unit=""
        precision={0}
        disabled={!hasData}
      />
      <Bar
        label="Fluid"
        actual={rates.perHour.fluidMl}
        target={targetFluid}
        unit=" ml"
        precision={0}
        disabled={!hasData}
      />
      <Bar
        label="Sodium"
        actual={rates.perHour.sodiumMg}
        target={targetNa}
        unit=" mg"
        precision={0}
        disabled={!hasData}
      />
      {hasData && (
        <p className="pt-1 text-[11px] opacity-60 tabular-nums">
          Totals: {Math.round(rates.totals.cal)} cal · {Math.round(rates.totals.fluidMl)} ml ·{" "}
          {Math.round(rates.totals.sodiumMg)} mg sodium
        </p>
      )}
      {!hasData && (
        <p className="pt-1 text-[11px] opacity-60">
          Per-hour rates appear once the race starts.
        </p>
      )}
    </div>
  );
}

function Bar({
  label,
  actual,
  target,
  unit,
  precision,
  disabled,
}: {
  label: string;
  actual: number;
  target: number;
  unit: string;
  precision: number;
  disabled: boolean;
}) {
  const pct = target > 0 ? Math.min(150, (actual / target) * 100) : 0;
  const fillClass =
    pct < 50
      ? "bg-red-500/70"
      : pct < 85
        ? "bg-amber-500/70"
        : pct <= 115
          ? "bg-green-500/70"
          : "bg-amber-500/70";

  return (
    <div className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-2 text-sm">
      <span className="opacity-80">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-current/10">
        {!disabled && (
          <span
            className={`block h-full ${fillClass}`}
            style={{ width: `${Math.min(100, pct)}%` }}
          />
        )}
      </span>
      <span className="tabular-nums text-xs opacity-80">
        {actual.toFixed(precision)}
        {unit}
        <span className="opacity-50"> / {target}{unit}</span>
      </span>
    </div>
  );
}

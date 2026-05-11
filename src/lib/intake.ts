import { db, type FuelEntry, type Lap } from "./db";

export const INTAKE_DEFAULTS = {
  calPerHr: 250,
  fluidMlPerHr: 590, // ~20 oz
  sodiumMgPerHr: 500,
};

export type IntakeTotals = {
  cal: number;
  fluidMl: number;
  sodiumMg: number;
};

export type IntakeRates = {
  totals: IntakeTotals;
  perHour: IntakeTotals;
  courseSec: number;
};

export function sumIntake(entries: FuelEntry[]): IntakeTotals {
  return entries.reduce<IntakeTotals>(
    (acc, e) => ({
      cal: acc.cal + (e.kcal ?? 0),
      fluidMl: acc.fluidMl + (e.fluidMl ?? 0),
      sodiumMg: acc.sodiumMg + (e.sodiumMg ?? 0),
    }),
    { cal: 0, fluidMl: 0, sodiumMg: 0 },
  );
}

export function sumPitSec(laps: Lap[]): number {
  let total = 0;
  for (const l of laps) {
    if (l.pitStartedAt && l.pitCompletedAt) {
      total += (new Date(l.pitCompletedAt).getTime() - new Date(l.pitStartedAt).getTime()) / 1000;
    }
  }
  return Math.max(0, total);
}

// "Per hour" rate by course time (total - pits). Falls back to total elapsed
// when no pits are recorded (early race or crew hasn't logged any).
export function computeRates(opts: {
  fuel: FuelEntry[];
  laps: Lap[];
  totalSec: number;
}): IntakeRates {
  const totals = sumIntake(opts.fuel);
  const pitSec = sumPitSec(opts.laps);
  const courseSec = Math.max(0, opts.totalSec - pitSec);
  const denomHr = courseSec / 3600;
  return {
    totals,
    perHour: denomHr > 0
      ? {
          cal: totals.cal / denomHr,
          fluidMl: totals.fluidMl / denomHr,
          sodiumMg: totals.sodiumMg / denomHr,
        }
      : { cal: 0, fluidMl: 0, sodiumMg: 0 },
    courseSec,
  };
}

export async function fuelForBib(bib: number): Promise<FuelEntry[]> {
  return db.fuel.where("bib").equals(bib).toArray();
}

export async function lapsForBib(bib: number): Promise<Lap[]> {
  return db.laps.where("bib").equals(bib).toArray();
}

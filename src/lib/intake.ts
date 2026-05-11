import { db, type FuelEntry, type Lap } from "./db";

// WTM-tuned defaults: cold/wet conditions push fluid lower and sodium higher
// vs. a typical hot-weather ultra. Cramping is a top WTM DNF cause.
export const INTAKE_DEFAULTS = {
  calPerHr: 250,
  fluidMlPerHr: 500, // ~17 oz
  sodiumMgPerHr: 600,
};

export type IntakeProfile = {
  name: string;
  description: string;
  calPerHr: number;
  fluidMlPerHr: number;
  sodiumMgPerHr: number;
};

export const INTAKE_PROFILES: IntakeProfile[] = [
  {
    name: "Light",
    description: "smaller athletes, conservative gut",
    calPerHr: 200,
    fluidMlPerHr: 400,
    sodiumMgPerHr: 450,
  },
  {
    name: "Default",
    description: "WTM-tuned baseline (cool/wet)",
    calPerHr: 250,
    fluidMlPerHr: 500,
    sodiumMgPerHr: 600,
  },
  {
    name: "Heavy",
    description: "larger athletes, heavy sweater",
    calPerHr: 300,
    fluidMlPerHr: 700,
    sodiumMgPerHr: 800,
  },
];

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

export type PitStatus = "green" | "amber" | "red" | "none";

// Color a measured pit time relative to the athlete's goal pit time.
// Returns "none" when no goal is set; callers should render neutral in that
// case rather than fall back to a hardcoded threshold.
//   green: at or under goal
//   amber: over goal but within 2.5%
//   red:   over goal by more than 2.5%
const PIT_AMBER_OVER = 1.025;

export function pitStatus(
  pitSec: number,
  goalPitSec: number | null | undefined,
): PitStatus {
  if (goalPitSec == null || goalPitSec <= 0) return "none";
  if (pitSec <= goalPitSec) return "green";
  if (pitSec <= goalPitSec * PIT_AMBER_OVER) return "amber";
  return "red";
}

export function pitStatusClass(status: PitStatus): string {
  switch (status) {
    case "green":
      return "text-green-500";
    case "amber":
      return "text-amber-500";
    case "red":
      return "text-red-500";
    default:
      return "opacity-70";
  }
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

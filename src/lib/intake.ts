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
// Returns "none" when no goal is set; callers should render neutral in
// that case rather than fall back to a hardcoded threshold.
//   green: at or under goal
//   amber: over goal but within 5%
//   red:   over goal by more than 5%
//
// Special case: a non-positive threshold means the budget is exhausted
// (the athlete's projected run alone already exceeds the time remaining).
// Every positive pit further widens the gap, so color them red rather
// than rendering neutral — that's the honest signal.
const PIT_AMBER_OVER = 1.05;

export function pitStatus(
  pitSec: number,
  goalPitSec: number | null | undefined,
): PitStatus {
  if (goalPitSec == null) return "none";
  if (goalPitSec <= 0) return pitSec > 0 ? "red" : "green";
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

// Plain-text equivalent of the color status — used as aria-label backup
// so screen readers (and color-vision-deficient users with high-contrast
// modes) get the signal, not just the hue.
export function pitStatusLabel(status: PitStatus): string {
  switch (status) {
    case "green":
      return "on budget";
    case "amber":
      return "tight";
    case "red":
      return "over budget";
    default:
      return "no goal set";
  }
}

// "Per hour" rate by course time — i.e. the time the athlete actually
// spent moving on the course (excluding pits). After the totalSec
// semantic flip to "lap-time-sum" (matching RaceResult's official
// TotalTime), totalSec IS the course time. The returned courseSec field
// is preserved for callers that report on it.
export function computeRates(opts: {
  fuel: FuelEntry[];
  laps: Lap[];
  totalSec: number;
}): IntakeRates {
  const totals = sumIntake(opts.fuel);
  const courseSec = Math.max(0, opts.totalSec);
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

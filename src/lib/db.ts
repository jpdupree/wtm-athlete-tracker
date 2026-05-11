import Dexie, { type Table } from "dexie";

export type FollowedAthlete = {
  bib: number;
  name: string;
  gender: "M" | "F" | null;
  team: string | null;
  goalMiles: number | null;
  // Target per-pit duration in seconds. Undefined / null = no goal set.
  goalPitSec?: number | null;
  addedAt: string;
  // Optional per-athlete intake targets. Undefined → fall back to INTAKE_DEFAULTS.
  targetCalPerHr?: number | null;
  targetFluidMlPerHr?: number | null;
  targetSodiumMgPerHr?: number | null;
};

export type Lap = {
  id: string;
  bib: number;
  lapNumber: number;
  lapStartedAt: string | null;
  lapCompletedAt: string | null;
  // The pit FOLLOWING this lap (i.e. "pit N" sits on lap N's row). Pit 1
  // is the rest between lap 1 and lap 2, owned by lap 1. The final
  // completed lap typically has these as null until the next lap is
  // confirmed by the feed.
  pitStartedAt: string | null;
  pitCompletedAt: string | null;
  source: "api" | "manual";
  provisional: boolean;
};

export type FuelEntry = {
  id: string;
  bib: number;
  target: "lap" | "pit";
  lapNumber: number;
  kcal: number | null;
  sodiumMg: number | null;
  fluidMl: number | null;
  label: string | null;
  note: string | null;
  ts: string;
};

export type Note = {
  id: string;
  bib: number;
  target: "lap" | "pit";
  lapNumber: number;
  text: string;
  ts: string;
};

export type MetaKV = { key: string; value: unknown };

class WtmDB extends Dexie {
  followed!: Table<FollowedAthlete, number>;
  laps!: Table<Lap, string>;
  fuel!: Table<FuelEntry, string>;
  notes!: Table<Note, string>;
  meta!: Table<MetaKV, string>;

  constructor() {
    super("wtm");
    this.version(1).stores({
      followed: "bib, addedAt",
      laps: "id, [bib+lapNumber], bib, source",
      fuel: "id, [bib+lapNumber], bib, ts",
      notes: "id, [bib+lapNumber], bib, ts",
      meta: "key",
    });
  }
}

export const db = new WtmDB();

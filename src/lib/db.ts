import Dexie, { type Table } from "dexie";

export type FollowedAthlete = {
  bib: number;
  name: string;
  gender: "M" | "F" | null;
  team: string | null;
  goalMiles: number | null;
  addedAt: string;
};

export type Lap = {
  id: string;
  bib: number;
  lapNumber: number;
  lapStartedAt: string | null;
  lapCompletedAt: string | null;
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

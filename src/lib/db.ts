import Dexie, { type Table } from "dexie";

// Year that v1 rows are stamped with on upgrade. 2025 is the first (and
// currently only) year with live data wired up, so any pre-year-picker
// follows belong there.
const LEGACY_YEAR = 2025;

export type FollowedAthlete = {
  bib: number;
  // Race year this follow belongs to. The same bib in a different year is
  // typically a different athlete (RaceResult re-issues bibs per event),
  // so the followed list is scoped per year.
  year: number;
  name: string;
  gender: "M" | "F" | null;
  team: string | null;
  goalMiles: number | null;
  // Target per-pit duration in seconds. Undefined / null = no goal set.
  goalPitSec?: number | null;
  // When true, the athlete stays in the followed list and keeps its
  // locally-stored history (laps, fuel, notes), but the periodic sync
  // skips it — useful after a DNF when you want to preserve the data
  // without churning the network on every poll.
  paused?: boolean;
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
  // Primary key stays `bib`. `year` is just a field with a secondary
  // index for filtering — keeping the PK simple sidesteps Dexie's tricky
  // primary-key-change migration path. The trade-off: a bib can only be
  // followed for one year at a time on a given device. Re-following the
  // same bib in a different year overwrites the prior record, which is
  // fine in practice — race-day usage is single-year.
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
    // v2 — add `year` field + secondary index. Pre-existing rows get
    // stamped with LEGACY_YEAR (2025), the only year currently wired up
    // for live data.
    this.version(2)
      .stores({
        followed: "bib, year, addedAt",
        laps: "id, [bib+lapNumber], bib, source",
        fuel: "id, [bib+lapNumber], bib, ts",
        notes: "id, [bib+lapNumber], bib, ts",
        meta: "key",
      })
      .upgrade((tx) =>
        tx
          .table("followed")
          .toCollection()
          .modify((row: FollowedAthlete & { year?: number }) => {
            if (row.year == null) row.year = LEGACY_YEAR;
          }),
      );
  }
}

export const db = new WtmDB();

// Reset the local Dexie database. Used by the "Reset local data" affordance
// when an in-development schema change leaves IndexedDB in a state Dexie
// can't open cleanly. Loses every follow / lap / note on this device.
export async function resetLocalDb(): Promise<void> {
  try {
    db.close();
  } catch {
    /* swallow — closing a never-opened db throws */
  }
  await Dexie.delete("wtm");
}

// If the open fails (most likely a schema mismatch from a prior dev
// migration), surface the error to the console and set a sentinel on
// `window` so the UI can offer a one-tap reset. We deliberately DON'T
// auto-reload — racing the React render produced an "application
// error" flash that was worse than the broken state.
if (typeof window !== "undefined") {
  db.open().catch((err) => {
    console.error("WTM: failed to open local DB", err);
    (window as unknown as { __wtmDbError?: unknown }).__wtmDbError = err;
  });
}

// Currently loaded results year. Single source of truth for every UI
// place that shows a year — header, metadata, link subtext, etc.
export const RESULTS_YEAR = 2025;

export type RaceTiming = {
  start: Date;
  // 24-hour mark — final lap must START before this. (Half-hour buffer
  // exists between cutoff and end so an athlete already on course can
  // complete that lap.)
  lastLapStartCutoff: Date;
  // Hard cutoff — anything after this doesn't count.
  end: Date;
  // IANA timezone for the venue — used by fmtVenueClock to render
  // wall-clock times in the local zone of the actual event.
  venueTz: string;
};

// Per-year race timing. 2022-2024 were held at Atlanta Motor Speedway in
// November (noon EST = 17:00 UTC; DST is over by then). 2025 onward moved
// to the UK (noon BST = 11:00 UTC).
export const RACE_TIMING_BY_YEAR: Record<number, RaceTiming> = {
  // 2021 Laughlin, Nevada — Pacific time. DST ends 1st Sun of Nov so by
  // Nov 13 it's PST (UTC-8) → noon PST = 20:00 UTC.
  2021: {
    start: new Date("2021-11-13T20:00:00Z"),
    lastLapStartCutoff: new Date("2021-11-14T20:00:00Z"),
    end: new Date("2021-11-14T21:30:00Z"),
    venueTz: "America/Los_Angeles",
  },
  // 2022 Alabama and 2023 Texas are both Central time — noon CST/CDT.
  // In mid-November DST has ended, so CST = UTC-6 → noon CST = 18:00 UTC.
  2022: {
    start: new Date("2022-11-12T18:00:00Z"),
    lastLapStartCutoff: new Date("2022-11-13T18:00:00Z"),
    end: new Date("2022-11-13T19:30:00Z"),
    venueTz: "America/Chicago",
  },
  2023: {
    start: new Date("2023-11-11T18:00:00Z"),
    lastLapStartCutoff: new Date("2023-11-12T18:00:00Z"),
    end: new Date("2023-11-12T19:30:00Z"),
    venueTz: "America/Chicago",
  },
  // 2024 Florida ran Nov 2–3, the DST fall-back weekend. Race started
  // noon EDT (UTC-4 = 16:00 UTC) on Saturday; by Sunday afternoon clocks
  // had shifted to EST so the same race clock reads an hour earlier in
  // local wall time. America/New_York handles the EDT→EST switchover
  // automatically.
  2024: {
    start: new Date("2024-11-02T16:00:00Z"),
    lastLapStartCutoff: new Date("2024-11-03T16:00:00Z"),
    end: new Date("2024-11-03T17:30:00Z"),
    venueTz: "America/New_York",
  },
  2025: {
    start: new Date("2025-06-29T11:00:00Z"),
    lastLapStartCutoff: new Date("2025-06-30T11:00:00Z"),
    end: new Date("2025-06-30T12:30:00Z"),
    venueTz: "Europe/London",
  },
  2026: {
    start: new Date("2026-06-27T11:00:00Z"),
    lastLapStartCutoff: new Date("2026-06-28T11:00:00Z"),
    end: new Date("2026-06-28T12:30:00Z"),
    venueTz: "Europe/London",
  },
};

export function raceTimingFor(year: number): RaceTiming {
  return RACE_TIMING_BY_YEAR[year] ?? RACE_TIMING_BY_YEAR[RESULTS_YEAR];
}

// Legacy globals — pointed at the currently loaded results year. Server-
// side code (fixtures, raceFeed, passings) and helpers that haven't been
// threaded through a year argument yet still rely on these. Year-aware
// client code should prefer raceTimingFor(selectedYear).
const legacy = raceTimingFor(RESULTS_YEAR);
export const RACE_START = legacy.start;
export const LAST_LAP_START_CUTOFF = legacy.lastLapStartCutoff;
export const RACE_END = legacy.end;

export const LAP_MILES = 5;

// When non-null, the fixture pipeline freezes the field at this many seconds
// into the race — laps completed after the cutoff are dropped and each
// athlete's summary state (laps, totalSec, lastSeen) is recomputed from
// whatever they had crossed by then. Useful for testing the mid-race UI.
// Set to null to use the full end-of-race data.
export const SIM_RACE_ELAPSED_SEC: number | null = null;

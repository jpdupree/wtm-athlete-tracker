// Currently loaded results year. Single source of truth for every UI
// place that shows a year — header, metadata, link subtext, etc. When a
// year-picker is added later, this becomes runtime state and the same
// consumers update.
export const RESULTS_YEAR = 2025;

export const RACE_START = new Date("2026-06-27T11:00:00Z");
export const LAST_LAP_START_CUTOFF = new Date("2026-06-28T11:00:00Z");
export const RACE_END = new Date("2026-06-28T12:30:00Z");
export const LAP_MILES = 5;

// When non-null, the fixture pipeline freezes the field at this many seconds
// into the race — laps completed after the cutoff are dropped and each
// athlete's summary state (laps, totalSec, lastSeen) is recomputed from
// whatever they had crossed by then. Useful for testing the mid-race UI.
// Set to null to use the full end-of-race data.
export const SIM_RACE_ELAPSED_SEC: number | null = null;

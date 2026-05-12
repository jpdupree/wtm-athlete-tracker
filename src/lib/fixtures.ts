import { promises as fs } from "node:fs";
import path from "node:path";
import {
  LAP_MILES,
  raceTimingFor,
  SIM_RACE_ELAPSED_SEC,
} from "./race";
import type { Athlete, Passing, Slice } from "./types";

// Fixtures are organised per-year under test/fixtures/<year>/.
function fixturesDirFor(year: number): string {
  return path.join(process.cwd(), "test", "fixtures", String(year));
}

// ---- CSV parsing -----------------------------------------------------------

function parseCsv(text: string): Record<string, string>[] {
  // Strip BOM if present.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ",") { cur.push(field); field = ""; continue; }
    if (c === "\r") continue;
    if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; continue; }
    field += c;
  }
  if (field.length > 0 || cur.length > 0) { cur.push(field); rows.push(cur); }

  if (rows.length === 0) return [];
  const headers = rows[0];
  return rows.slice(1)
    .filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""))
    .map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));
}

// ---- time helpers ----------------------------------------------------------

function parseHmsToSec(s: string | null | undefined): number | null {
  if (!s) return null;
  const trimmed = s.trim();
  if (!trimmed || trimmed === "-") return null;
  const parts = trimmed.split(":").map((p) => parseInt(p, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// ---- file cache ------------------------------------------------------------

// Cache by "<year>:<filename>" so fixtures for different years stay
// separate. Promises live for the lifetime of the server process.
const cache = new Map<string, Promise<Record<string, string>[]>>();

function loadCsv(year: number, name: string): Promise<Record<string, string>[]> {
  const key = `${year}:${name}`;
  let p = cache.get(key);
  if (!p) {
    p = fs
      .readFile(path.join(fixturesDirFor(year), name), "utf8")
      .then(parseCsv)
      .catch((err: NodeJS.ErrnoException) => {
        // Treat missing fixtures as empty — the API surfaces this as an
        // empty results list rather than a 5xx.
        if (err.code === "ENOENT") return [];
        throw err;
      });
    cache.set(key, p);
  }
  return p;
}

// ---- snapshot at SIM_RACE_ELAPSED_SEC --------------------------------------

type Snapshot = {
  laps: number;
  // Sum of LAP times only (no pit). Matches the official TotalTime column
  // in RaceResult — i.e. what the scoreboard shows. Wall-clock elapsed
  // (including pit time) is reconstructed from lapEndAt when math needs
  // it.
  totalSec: number;
  lapEndAt: string | null;
};

const snapshotsByYear = new Map<number, Promise<Map<number, Snapshot>>>();

// Aggregate lap_details into per-bib state AT the simulated cutoff. Laps
// completed after the cutoff are dropped; pit + lap durations accumulate
// strictly until the next would push us past it.
function buildSnapshots(year: number): Promise<Map<number, Snapshot>> {
  let cached = snapshotsByYear.get(year);
  if (cached) return cached;
  const raceStart = raceTimingFor(year).start;
  cached = (async () => {
    const cutoff = SIM_RACE_ELAPSED_SEC;
    const [ind, team] = await Promise.all([
      loadCsv(year, "lap_details_individual.csv"),
      loadCsv(year, "lap_details_team.csv"),
    ]);
    const byBib = new Map<number, Record<string, string>[]>();
    for (const r of [...ind, ...team]) {
      const bib = toInt(r.Bib);
      if (!bib) continue;
      if (!byBib.has(bib)) byBib.set(bib, []);
      byBib.get(bib)!.push(r);
    }
    const out = new Map<number, Snapshot>();
    for (const [bib, laps] of byBib) {
      laps.sort((a, b) => toInt(a.LapNum) - toInt(b.LapNum));
      // wallClockSec tracks total time-since-race-start (lap + pit) —
      // anchored to RACE_START it gives the wall-clock ISO timestamp at
      // each lap end. movingSec tracks lap times only (no pit) — that's
      // what becomes the displayed totalSec and matches the official
      // TotalTime in the results feed.
      let wallClockSec = 0;
      let movingSec = 0;
      let lapsDone = 0;
      let lastEndedAt: string | null = null;
      for (const lap of laps) {
        const n = toInt(lap.LapNum);
        if (!n) continue;
        const pitSec = n === 1 ? 0 : (parseHmsToSec(lap.PitTime) ?? 0);
        const lapSec = parseHmsToSec(lap.LapTime) ?? 0;
        const newWallClock = wallClockSec + pitSec + lapSec;
        if (cutoff != null && newWallClock > cutoff) break;
        wallClockSec = newWallClock;
        movingSec += lapSec;
        lapsDone = n;
        lastEndedAt = new Date(raceStart.getTime() + wallClockSec * 1000).toISOString();
      }
      out.set(bib, { laps: lapsDone, totalSec: movingSec, lapEndAt: lastEndedAt });
    }
    return out;
  })();
  snapshotsByYear.set(year, cached);
  return cached;
}

function applySnapshot(a: Athlete, snap: Snapshot | undefined): Athlete {
  if (!snap) {
    return {
      ...a,
      laps: 0,
      totalSec: null,
      distanceMiles: 0,
      lastSeenLabel: "",
      lastSeenAt: null,
    };
  }
  // Prefer the official TotalTime parsed in indRowToAthlete. Only fall
  // back to the recomputed snapshot value when a sim cutoff is active
  // (the parsed value is the FINAL TotalTime, which doesn't apply mid-
  // race) or when the parsed value is missing.
  const useSimTotal = SIM_RACE_ELAPSED_SEC != null;
  const totalSec = useSimTotal || a.totalSec == null
    ? (snap.totalSec > 0 ? snap.totalSec : null)
    : a.totalSec;
  return {
    ...a,
    laps: snap.laps,
    totalSec,
    distanceMiles: snap.laps * LAP_MILES,
    lastSeenLabel: snap.laps > 0 ? `Lap ${snap.laps} Finish` : "",
    lastSeenAt: snap.lapEndAt,
  };
}

// Sort by (laps desc, totalSec asc) and assign ranks. genderRank is computed
// per-gender within the slice; for ungendered rows (teams, team members) it
// follows the overall position.
function reRank(athletes: Athlete[]): Athlete[] {
  const sorted = [...athletes].sort((a, b) => {
    if (a.laps !== b.laps) return b.laps - a.laps;
    return (a.totalSec ?? Infinity) - (b.totalSec ?? Infinity);
  });
  let mRank = 0;
  let fRank = 0;
  return sorted.map((a, i) => {
    let genderRank: number;
    if (a.gender === "M") genderRank = ++mRank;
    else if (a.gender === "F") genderRank = ++fRank;
    else genderRank = i + 1;
    return { ...a, overallRank: i + 1, genderRank };
  });
}

// ---- row → Athlete ---------------------------------------------------------

function toInt(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function indRowToAthlete(r: Record<string, string>, gender: "M" | "F"): Athlete {
  const agRank = r.AgeGroupRank && r.AgeGroupRank !== "-" ? toInt(r.AgeGroupRank) : null;
  return {
    bib: toInt(r.Bib),
    name: r.Name ?? "",
    category: "Individual",
    nation: r.Country ?? "",
    gender,
    overallRank: 0,
    genderRank: 0,
    ageGroupRank: agRank,
    distanceMiles: 0,
    laps: 0,
    lastLapSec: null,
    // Parse the official TotalTime straight from the scoreboard CSV.
    // Different years use different "total" semantics (2024/25 = moving-
    // only, 2023 = wall-clock including pits), so trusting the column
    // value keeps the displayed number aligned with RaceResult for every
    // year. Snapshot truncation only overrides this when a sim cutoff
    // is active.
    totalSec: parseHmsToSec(r.TotalTime),
    lastSeenLabel: "",
    lastSeenAt: null,
  };
}

function memberRowToAthlete(r: Record<string, string>): Athlete {
  return {
    bib: toInt(r.Bib),
    name: r.Name ?? "",
    category: "TeamMember",
    nation: "",
    gender: null,
    overallRank: 0,
    genderRank: 0,
    ageGroupRank: null,
    distanceMiles: 0,
    laps: 0,
    lastLapSec: null,
    totalSec: null,
    lastSeenLabel: "",
    lastSeenAt: null,
  };
}

function teamRowToAthlete(r: Record<string, string>): Athlete {
  return {
    bib: toInt(r.Bib),
    name: r.Team ?? "",
    category: "Team",
    nation: "",
    gender: null,
    overallRank: 0,
    genderRank: 0,
    ageGroupRank: null,
    distanceMiles: 0,
    laps: 0,
    lastLapSec: null,
    totalSec: null,
    lastSeenLabel: "",
    lastSeenAt: null,
  };
}

// ---- public API ------------------------------------------------------------

export async function getAthletesBySlice(slice: Slice, year: number): Promise<Athlete[]> {
  const snapshots = await buildSnapshots(year);

  let raw: Athlete[];
  if (slice === "women") {
    const rows = await loadCsv(year, "individual_Female.csv");
    raw = rows.map((r) => indRowToAthlete(r, "F"));
  } else if (slice === "men") {
    const rows = await loadCsv(year, "individual_Male.csv");
    raw = rows.map((r) => indRowToAthlete(r, "M"));
  } else if (slice === "teams") {
    const rows = await loadCsv(year, "teams.csv");
    raw = rows.map(teamRowToAthlete);
  } else {
    // overall = women + men + team members (no team chips)
    const [f, m, tm] = await Promise.all([
      loadCsv(year, "individual_Female.csv"),
      loadCsv(year, "individual_Male.csv"),
      loadCsv(year, "team_members.csv"),
    ]);
    raw = [
      ...f.map((r) => indRowToAthlete(r, "F")),
      ...m.map((r) => indRowToAthlete(r, "M")),
      ...tm.map(memberRowToAthlete),
    ];
  }

  const withState = raw.map((a) => applySnapshot(a, snapshots.get(a.bib)));
  return reRank(withState);
}

// Build real per-lap passings by accumulating PitTime + LapTime offsets
// from each year's RACE_START. Sourced from lap_details_individual.csv
// (solo + team members) and lap_details_team.csv (team chips). The
// team-chip rows share BIB-space (5-digit team bibs vs 4-digit athlete
// bibs) so a single merged list is safe. Laps that complete after
// SIM_RACE_ELAPSED_SEC are dropped.
export async function getAllPassings(year: number): Promise<Passing[]> {
  const cutoff = SIM_RACE_ELAPSED_SEC;
  const raceStart = raceTimingFor(year).start;
  const [ind, team] = await Promise.all([
    loadCsv(year, "lap_details_individual.csv"),
    loadCsv(year, "lap_details_team.csv"),
  ]);
  const all = [...ind, ...team];

  // Group by bib, sort by lap, accumulate.
  const byBib = new Map<number, Record<string, string>[]>();
  for (const r of all) {
    const bib = toInt(r.Bib);
    if (!bib) continue;
    if (!byBib.has(bib)) byBib.set(bib, []);
    byBib.get(bib)!.push(r);
  }

  const passings: Passing[] = [];
  for (const [bib, laps] of byBib) {
    laps.sort((a, b) => toInt(a.LapNum) - toInt(b.LapNum));
    let elapsedSec = 0;
    for (const lap of laps) {
      const lapNumber = toInt(lap.LapNum);
      if (!lapNumber) continue;
      // Lap 1's PitTime is a literal " - " — treat as no prior pit.
      const pitSec = lapNumber === 1 ? 0 : (parseHmsToSec(lap.PitTime) ?? 0);
      const lapSec = parseHmsToSec(lap.LapTime) ?? 0;
      const newElapsed = elapsedSec + pitSec + lapSec;
      if (cutoff != null && newElapsed > cutoff) break;
      elapsedSec = newElapsed;
      passings.push({
        bib,
        lapNumber,
        elapsedSec,
        completedAt: new Date(raceStart.getTime() + elapsedSec * 1000).toISOString(),
        pitSec,
        lapSec,
      });
    }
  }
  return passings;
}

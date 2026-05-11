import { promises as fs } from "node:fs";
import path from "node:path";
import { RACE_START } from "./race";
import type { Athlete, Passing, Slice } from "./types";

const FIXTURES_DIR = path.join(process.cwd(), "test", "fixtures");

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

function parseTodToISO(tod: string | null | undefined): string | null {
  if (!tod) return null;
  const m = tod.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  if (m[4].toUpperCase() === "PM" && h !== 12) h += 12;
  if (m[4].toUpperCase() === "AM" && h === 12) h = 0;
  // ToD is venue wall-clock (BST = UTC+1 for our 2025 event).
  const d = new Date(Date.UTC(
    RACE_START.getUTCFullYear(),
    RACE_START.getUTCMonth(),
    RACE_START.getUTCDate(),
    h - 1, mi, s,
  ));
  if (d.getTime() < RACE_START.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// ---- file cache ------------------------------------------------------------

const cache = new Map<string, Promise<Record<string, string>[]>>();

function loadCsv(name: string): Promise<Record<string, string>[]> {
  let p = cache.get(name);
  if (!p) {
    p = fs
      .readFile(path.join(FIXTURES_DIR, name), "utf8")
      .then(parseCsv);
    cache.set(name, p);
  }
  return p;
}

// ---- row → Athlete ---------------------------------------------------------

function toInt(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

function indRowToAthlete(r: Record<string, string>, gender: "M" | "F"): Athlete {
  const rank = toInt(r.Rank);
  const agRank = r.AgeGroupRank && r.AgeGroupRank !== "-" ? toInt(r.AgeGroupRank) : null;
  return {
    bib: toInt(r.Bib),
    name: r.Name ?? "",
    category: "Individual",
    nation: r.Country ?? "",
    gender,
    overallRank: rank,
    genderRank: rank,
    ageGroupRank: agRank,
    distanceMiles: toInt(r.TotalDistanceMi),
    laps: toInt(r.LapsCompleted),
    lastLapSec: null,
    totalSec: parseHmsToSec(r.TotalTime),
    lastSeenLabel: r.PointLastSeen ?? "",
    lastSeenAt: parseTodToISO(r.TimeOfDay),
  };
}

function memberRowToAthlete(r: Record<string, string>): Athlete {
  return {
    bib: toInt(r.Bib),
    name: r.Name ?? "",
    category: "TeamMember",
    nation: "",
    gender: null,
    overallRank: toInt(r.Rank),
    genderRank: 0,
    ageGroupRank: null,
    distanceMiles: toInt(r.TotalDistanceMi),
    laps: toInt(r.LapsCompleted),
    lastLapSec: null,
    totalSec: parseHmsToSec(r.TotalTime),
    lastSeenLabel: r.PointLastSeen ?? "",
    lastSeenAt: parseTodToISO(r.TimeOfDay),
  };
}

function teamRowToAthlete(r: Record<string, string>): Athlete {
  return {
    bib: toInt(r.Bib),
    name: r.Team ?? "",
    category: "Team",
    nation: "",
    gender: null,
    overallRank: toInt(r.Rank),
    genderRank: toInt(r.Rank),
    ageGroupRank: null,
    distanceMiles: toInt(r.TotalDistanceMi),
    laps: toInt(r.LapsCompleted),
    lastLapSec: null,
    totalSec: parseHmsToSec(r.TotalTime),
    lastSeenLabel: r.PointLastSeen ?? "",
    lastSeenAt: parseTodToISO(r.TimeOfDay),
  };
}

// ---- public API ------------------------------------------------------------

export async function getAthletesBySlice(slice: Slice): Promise<Athlete[]> {
  if (slice === "women") {
    const rows = await loadCsv("individual_Female.csv");
    return rows.map((r) => indRowToAthlete(r, "F"));
  }
  if (slice === "men") {
    const rows = await loadCsv("individual_Male.csv");
    return rows.map((r) => indRowToAthlete(r, "M"));
  }
  if (slice === "teams") {
    const rows = await loadCsv("teams.csv");
    return rows.map(teamRowToAthlete);
  }
  // overall = women + men + team members (no team chips)
  const [f, m, tm] = await Promise.all([
    loadCsv("individual_Female.csv"),
    loadCsv("individual_Male.csv"),
    loadCsv("team_members.csv"),
  ]);
  return [
    ...f.map((r) => indRowToAthlete(r, "F")),
    ...m.map((r) => indRowToAthlete(r, "M")),
    ...tm.map(memberRowToAthlete),
  ].sort((a, b) => {
    // Sort by laps desc then totalSec asc, matching event ranking.
    if (a.laps !== b.laps) return b.laps - a.laps;
    return (a.totalSec ?? Infinity) - (b.totalSec ?? Infinity);
  }).map((a, i) => ({ ...a, overallRank: i + 1 }));
}

// Build real per-lap passings by accumulating PitTime + LapTime offsets
// from RACE_START. Sourced from lap_details_individual.csv (solo + team members)
// and lap_details_team.csv (team chips). The team-chip rows share BIB-space
// (5-digit team bibs vs 4-digit athlete bibs) so a single merged list is safe.
export async function getAllPassings(): Promise<Passing[]> {
  const [ind, team] = await Promise.all([
    loadCsv("lap_details_individual.csv"),
    loadCsv("lap_details_team.csv"),
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
      const pitSec = parseHmsToSec(lap.PitTime) ?? 0;
      const lapSec = parseHmsToSec(lap.LapTime) ?? 0;
      elapsedSec += pitSec + lapSec;
      passings.push({
        bib,
        lapNumber,
        elapsedSec,
        completedAt: new Date(RACE_START.getTime() + elapsedSec * 1000).toISOString(),
      });
    }
  }
  return passings;
}

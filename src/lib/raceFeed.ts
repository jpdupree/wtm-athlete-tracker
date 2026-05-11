import { getAthletesBySlice } from "./fixtures";
import { kvGet, kvSet } from "./kv";
import { RACE_START } from "./race";
import type { Athlete, FeedResponse, RawAthleteRow, Slice } from "./types";

const FRESH_MS = 15_000;

const ENV_BY_SLICE: Record<Slice, string> = {
  overall: "RACE_FEED_OVERALL",
  men: "RACE_FEED_MEN",
  women: "RACE_FEED_WOMEN",
  teams: "RACE_FEED_TEAMS",
};

const GENDER_BY_SLICE: Record<Slice, "M" | "F" | null> = {
  overall: null,
  men: "M",
  women: "F",
  teams: null,
};

function parseHmsToSec(s: string | undefined | null): number | null {
  if (!s) return null;
  const parts = s.split(":").map((x) => parseInt(x, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

// Race wall-clock is BST (UTC+1). Combine "9:00:16 AM" with the race date;
// roll to next day if the resulting instant precedes RACE_START.
function parseTodToISO(tod: string | undefined | null, raceStart: Date): string | null {
  if (!tod) return null;
  const m = tod.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  const ap = m[4].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
  const d = new Date(Date.UTC(
    raceStart.getUTCFullYear(),
    raceStart.getUTCMonth(),
    raceStart.getUTCDate(),
    h - 1, mi, s,
  ));
  if (d.getTime() < raceStart.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function normalizeRow(r: RawAthleteRow, gender: "M" | "F" | null): Athlete {
  return {
    bib: r.Bib,
    name: r.Name,
    category: r.Category,
    nation: r.Nation,
    gender,
    overallRank: r.Rank,
    genderRank: r.Gender,
    ageGroupRank: r.AgeGroup === "" ? null : (r.AgeGroup as number),
    distanceMiles: parseInt(r.Distance, 10) || 0,
    laps: parseInt(r.Laps, 10) || 0,
    lastLapSec: parseHmsToSec(r.LastLapTime),
    totalSec: parseHmsToSec(r.TotalTime),
    lastSeenLabel: r.LastSeen,
    lastSeenAt: parseTodToISO(r.LastSeenTOD, RACE_START),
  };
}

async function fetchSlice(slice: Slice): Promise<Athlete[]> {
  const url = process.env[ENV_BY_SLICE[slice]];
  if (url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`upstream ${slice}: ${res.status}`);
    const raw = (await res.json()) as RawAthleteRow[];
    return raw.map((r) => normalizeRow(r, GENDER_BY_SLICE[slice]));
  }
  // Fixture path: CSVs already pre-split by gender, with team chips on the
  // teams slice. getAthletesBySlice returns Athlete[] directly.
  return getAthletesBySlice(slice);
}

type CachePayload = { fetchedAt: string; rows: Athlete[] };

export async function getFeed(slice: Slice): Promise<FeedResponse> {
  const cacheKey = `feed:${slice}`;
  const now = Date.now();
  const cached = await kvGet<CachePayload>(cacheKey);
  if (cached) {
    const ageMs = now - new Date(cached.fetchedAt).getTime();
    if (ageMs < FRESH_MS) {
      return { slice, fetchedAt: cached.fetchedAt, cached: true, ageMs, rows: cached.rows };
    }
  }
  const rows = await fetchSlice(slice);
  const fetchedAt = new Date(now).toISOString();
  await kvSet<CachePayload>(cacheKey, { fetchedAt, rows });
  return { slice, fetchedAt, cached: false, ageMs: 0, rows };
}

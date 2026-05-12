import { getAthletesBySlice } from "./fixtures";
import { kvGet, kvSet } from "./kv";
import { raceTimingFor } from "./race";
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

// Race wall-clock is local to the venue (UK = BST, ATL = EST). Combine
// "9:00:16 AM" with the race date in the SAME wall-clock zone as
// raceStart, then roll to the next day if the resulting instant precedes
// raceStart. Each year's raceStart is stored at the right UTC offset, so
// subtracting 1h matches UTC+1 (BST). Atlanta years (UTC-5) need to add
// 5h instead. We detect this by comparing the raceStart's hour-of-day in
// UTC to decide which offset applies.
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
  // raceStart UTC hour - venue local noon-start offset = the UTC offset.
  // UK: 11Z = 12 BST → -1 from local→UTC.
  // ATL: 17Z = 12 EST → +5 from local→UTC.
  // Generalise: utcStartHour = 12 + offset; so offset = utcStartHour - 12.
  const offsetHours = raceStart.getUTCHours() - 12;
  const d = new Date(Date.UTC(
    raceStart.getUTCFullYear(),
    raceStart.getUTCMonth(),
    raceStart.getUTCDate(),
    h + offsetHours, mi, s,
  ));
  if (d.getTime() < raceStart.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function normalizeRow(
  r: RawAthleteRow,
  gender: "M" | "F" | null,
  raceStart: Date,
): Athlete {
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
    lastSeenAt: parseTodToISO(r.LastSeenTOD, raceStart),
  };
}

async function fetchSlice(slice: Slice, year: number): Promise<Athlete[]> {
  // Upstream URLs are only configured for the live year. For any other
  // year, fall back to the per-year fixture CSVs.
  const url = process.env[ENV_BY_SLICE[slice]];
  const liveYear = parseInt(process.env.RACE_FEED_YEAR ?? "", 10);
  const isLiveYear = Number.isFinite(liveYear) ? year === liveYear : true;
  if (url && isLiveYear) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`upstream ${slice}: ${res.status}`);
    const raw = (await res.json()) as RawAthleteRow[];
    const raceStart = raceTimingFor(year).start;
    return raw.map((r) => normalizeRow(r, GENDER_BY_SLICE[slice], raceStart));
  }
  // Fixture path: CSVs already pre-split by gender, with team chips on the
  // teams slice. getAthletesBySlice returns Athlete[] directly.
  return getAthletesBySlice(slice, year);
}

type CachePayload = { fetchedAt: string; rows: Athlete[] };

export async function getFeed(slice: Slice, year: number): Promise<FeedResponse> {
  const cacheKey = `feed:${year}:${slice}`;
  const now = Date.now();
  const cached = await kvGet<CachePayload>(cacheKey);
  if (cached) {
    const ageMs = now - new Date(cached.fetchedAt).getTime();
    if (ageMs < FRESH_MS) {
      return { slice, fetchedAt: cached.fetchedAt, cached: true, ageMs, rows: cached.rows };
    }
  }
  const rows = await fetchSlice(slice, year);
  const fetchedAt = new Date(now).toISOString();
  await kvSet<CachePayload>(cacheKey, { fetchedAt, rows });
  return { slice, fetchedAt, cached: false, ageMs: 0, rows };
}

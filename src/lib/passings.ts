import { getAllPassings } from "./fixtures";
import { kvGet, kvSet } from "./kv";
import { raceTimingFor } from "./race";
import { liveBibPassings } from "./raceResultLive";
import { liveFeedYear } from "./years";
import type { Passing, RawPassing } from "./types";

const FRESH_MS = 15_000;

function parseHmsToSec(s: string | undefined | null): number | null {
  if (!s) return null;
  const parts = s.split(":").map((x) => parseInt(x, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function todToISO(tod: string | undefined | null, raceStart: Date): string | null {
  if (!tod) return null;
  const m = tod.match(/^(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const mi = parseInt(m[2], 10);
  const s = parseInt(m[3], 10);
  const ap = m[4].toUpperCase();
  if (ap === "PM" && h !== 12) h += 12;
  if (ap === "AM" && h === 12) h = 0;
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

function normalizePassing(r: RawPassing, raceStart: Date): Passing | null {
  const bib = typeof r.Bib === "number" ? r.Bib : parseInt(String(r.Bib), 10);
  const rawLap = r.Loop ?? r.Lap ?? r.Section ?? null;
  const lapNumber =
    typeof rawLap === "number" ? rawLap : rawLap ? parseInt(String(rawLap), 10) : NaN;
  if (!Number.isFinite(bib) || !Number.isFinite(lapNumber)) return null;
  const elapsedSec = parseHmsToSec(r.Time ?? null);
  const todISO = todToISO(r.TOD ?? null, raceStart);
  let completedAt: string | null = todISO;
  if (!completedAt && elapsedSec != null) {
    completedAt = new Date(raceStart.getTime() + elapsedSec * 1000).toISOString();
  }
  if (!completedAt) return null;
  return {
    bib,
    lapNumber,
    elapsedSec:
      elapsedSec ?? (new Date(completedAt).getTime() - raceStart.getTime()) / 1000,
    completedAt,
    // Upstream RawPassing doesn't expose pit / lap durations directly; the
    // fixtures path supplies them. Leave null when not available.
    pitSec: null,
    lapSec: null,
  };
}

async function fetchAllPassings(year: number): Promise<Passing[]> {
  const isLiveYear = liveFeedYear() === year;

  // Legacy: a URL returning normalized RawPassing JSON.
  const url = process.env.RACE_FEED_PASSINGS;
  if (url && isLiveYear) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`passings upstream: ${res.status}`);
    const rows = (await res.json()) as RawPassing[];
    const raceStart = raceTimingFor(year).start;
    return rows
      .map((r) => normalizePassing(r, raceStart))
      .filter((p): p is Passing => p !== null);
  }
  // Real per-lap data from test/fixtures/<year>/lap_details_{individual,team}.csv.
  return getAllPassings(year);
}

type CachePayload = { fetchedAt: string; passings: Passing[] };

export async function getPassingsForBib(
  bib: number,
  year: number,
): Promise<{
  fetchedAt: string;
  cached: boolean;
  ageMs: number;
  synthetic: boolean;
  passings: Passing[];
}> {
  // Live path: the lap-detail endpoint is per-participant, so fetch just
  // this bib's history (and cache per-bib). A failure here returns a 502 for
  // /api/passings/[bib] only — the summary feed (laps/total) is independent.
  const liveEvent = process.env.RACE_FEED_EVENT;
  if (liveEvent && liveFeedYear() === year) {
    const bibKey = `passings:${year}:bib:${bib}`;
    const t = Date.now();
    const hit = await kvGet<CachePayload>(bibKey);
    if (hit) {
      const age = t - new Date(hit.fetchedAt).getTime();
      if (age < FRESH_MS) {
        return { fetchedAt: hit.fetchedAt, cached: true, ageMs: age, synthetic: false, passings: hit.passings };
      }
    }
    const passings = await liveBibPassings(liveEvent, year, bib);
    const fetchedAt = new Date(t).toISOString();
    await kvSet<CachePayload>(bibKey, { fetchedAt, passings });
    return { fetchedAt, cached: false, ageMs: 0, synthetic: false, passings };
  }

  const cacheKey = `passings:${year}:all`;
  const now = Date.now();
  let payload = await kvGet<CachePayload>(cacheKey);
  let cached = false;
  let ageMs = 0;
  if (payload) {
    ageMs = now - new Date(payload.fetchedAt).getTime();
    if (ageMs < FRESH_MS) {
      cached = true;
    } else {
      payload = null;
    }
  }
  if (!payload) {
    const passings = await fetchAllPassings(year);
    payload = { fetchedAt: new Date(now).toISOString(), passings };
    await kvSet<CachePayload>(cacheKey, payload);
    ageMs = 0;
  }
  const forBib = payload.passings
    .filter((p) => p.bib === bib)
    .sort((a, b) => a.lapNumber - b.lapNumber);
  return {
    fetchedAt: payload.fetchedAt,
    cached,
    ageMs,
    // The CSV fixtures and the upstream URL both deliver real per-lap data,
    // so we no longer synthesize. Field kept for response-shape stability.
    synthetic: false,
    passings: forBib,
  };
}

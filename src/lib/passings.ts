import { getAllPassings } from "./fixtures";
import { kvGet, kvSet } from "./kv";
import { RACE_START } from "./race";
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

function todToISO(tod: string | undefined | null): string | null {
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
    RACE_START.getUTCFullYear(),
    RACE_START.getUTCMonth(),
    RACE_START.getUTCDate(),
    h - 1, mi, s,
  ));
  if (d.getTime() < RACE_START.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

function normalizePassing(r: RawPassing): Passing | null {
  const bib = typeof r.Bib === "number" ? r.Bib : parseInt(String(r.Bib), 10);
  const rawLap = r.Loop ?? r.Lap ?? r.Section ?? null;
  const lapNumber =
    typeof rawLap === "number" ? rawLap : rawLap ? parseInt(String(rawLap), 10) : NaN;
  if (!Number.isFinite(bib) || !Number.isFinite(lapNumber)) return null;
  const elapsedSec = parseHmsToSec(r.Time ?? null);
  const todISO = todToISO(r.TOD ?? null);
  let completedAt: string | null = todISO;
  if (!completedAt && elapsedSec != null) {
    completedAt = new Date(RACE_START.getTime() + elapsedSec * 1000).toISOString();
  }
  if (!completedAt) return null;
  return {
    bib,
    lapNumber,
    elapsedSec: elapsedSec ?? (new Date(completedAt).getTime() - RACE_START.getTime()) / 1000,
    completedAt,
    // Upstream RawPassing doesn't expose pit / lap durations directly; the
    // fixtures path supplies them. Leave null when not available.
    pitSec: null,
    lapSec: null,
  };
}

async function fetchAllPassings(): Promise<Passing[]> {
  const url = process.env.RACE_FEED_PASSINGS;
  if (url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`passings upstream: ${res.status}`);
    const rows = (await res.json()) as RawPassing[];
    return rows
      .map(normalizePassing)
      .filter((p): p is Passing => p !== null);
  }
  // Real per-lap data from test/fixtures/lap_details_{individual,team}.csv.
  return getAllPassings();
}

type CachePayload = { fetchedAt: string; passings: Passing[] };

export async function getPassingsForBib(bib: number): Promise<{
  fetchedAt: string;
  cached: boolean;
  ageMs: number;
  synthetic: boolean;
  passings: Passing[];
}> {
  const cacheKey = "passings:all";
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
    const passings = await fetchAllPassings();
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

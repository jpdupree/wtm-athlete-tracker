// Live RaceResult adapter.
//
// Fetches results straight from a RaceResult RRPublish event and maps the
// array-of-arrays response into our Athlete[] / Passing[] shapes. This is
// the TypeScript port of the column-mapping logic in
// scripts/scrape-results.ps1, scoped to the modern event layout
// (2024-25 "RTM Results Web" lists, wide lap-detail rows) since that's
// what a current live event publishes.
//
// Gated by env: when RACE_FEED_EVENT is set and the requested year equals
// RACE_FEED_YEAR, raceFeed.ts / passings.ts route through here instead of
// the bundled fixtures. Race day = swap RACE_FEED_EVENT to the new id.

import { raceTimingFor } from "./race";
import type { Athlete, Passing, Slice } from "./types";

// RaceResult "Online" results API. The public results page loads its data
// from a sharded host (my1/my2/…), under /<event>/<page>/{config,list}.
// Captured from a live request:
//   https://my1.raceresult.com/406834/results/list?key=<KEY>&listname=Online|RTM Results Web&page=results&contest=2&r=all&l=0
//
// All three are env-overridable:
//   RACE_FEED_HOST  e.g. my1.raceresult.com  (which shard the event is on)
//   RACE_FEED_PAGE  the published page name in the path/query (e.g. results)
//   RACE_FEED_KEY   the published-page read key (32-char hex)
const RR_HOST = process.env.RACE_FEED_HOST || "my1.raceresult.com";
const RR_BASE = `https://${RR_HOST}`;
const RR_PAGE = process.env.RACE_FEED_PAGE || "results";
const RR_KEY = process.env.RACE_FEED_KEY || "";

type RRField = { Expression?: string; Label?: string };
type RRListResp = { list?: { Fields?: RRField[] }; data?: unknown };
type RRConfigList = { Name: string; Contest: string; ShowAs?: string; Details?: string };
type RRConfig = { key: string; lists: RRConfigList[] };

// ---- config (key lookup) ---------------------------------------------------

let configCache: { eventId: string; cfg: RRConfig; at: number } | null = null;

async function getConfig(eventId: string): Promise<RRConfig> {
  if (
    configCache &&
    configCache.eventId === eventId &&
    Date.now() - configCache.at < 5 * 60_000
  ) {
    return configCache.cfg;
  }
  const base = `${RR_BASE}/${eventId}/${encodeURIComponent(RR_PAGE)}/config`;
  // The config is public and returns its own read key + the published lists
  // under TabConfig.Lists (older shape: Tab.Config.Lists). Try with the env
  // key first if one is set, then plain.
  const urls = RR_KEY ? [`${base}?key=${encodeURIComponent(RR_KEY)}`, base] : [base];
  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetch(url, { cache: "no-store" });
    if (res.ok) {
      const raw = (await res.json()) as {
        key?: string;
        TabConfig?: { Lists?: RRConfigList[] };
        Tab?: { Config?: { Lists?: RRConfigList[] } };
      };
      const lists = raw?.TabConfig?.Lists ?? raw?.Tab?.Config?.Lists ?? [];
      const key = RR_KEY || raw?.key || "";
      if (key && Array.isArray(lists) && lists.length > 0) {
        const cfg: RRConfig = { key, lists };
        configCache = { eventId, cfg, at: Date.now() };
        return cfg;
      }
    }
    lastStatus = res.status || lastStatus;
  }
  throw new Error(
    `RaceResult config: HTTP ${lastStatus} @ ${base} (no key/lists found in response)`,
  );
}

function findList(lists: RRConfigList[], patterns: string[]): RRConfigList | null {
  for (const p of patterns) {
    const m = lists.find((l) => l.Name.includes(p));
    if (m) return m;
  }
  return null;
}

// Short-lived cache of raw list responses, keyed by event+list+contest.
// The men / women / overall slices each fetch the SAME "solo results"
// list, and they're all requested within the same polling burst — this
// dedupes that to one RaceResult request per list per ~10s window
// instead of three. In-flight promises are cached too, so concurrent
// slice requests share a single network call rather than racing.
const LIST_TTL_MS = 10_000;
const listCache = new Map<string, { at: number; promise: Promise<RRListResp> }>();

async function fetchList(
  eventId: string,
  key: string,
  list: RRConfigList,
): Promise<RRListResp> {
  const cacheKey = `${eventId}|${list.Name}|${list.Contest}`;
  const hit = listCache.get(cacheKey);
  if (hit && Date.now() - hit.at < LIST_TTL_MS) return hit.promise;

  // Prefer the env key (the published-page read key); fall back to the key
  // the config returned.
  const useKey = RR_KEY || key;
  const url =
    `${RR_BASE}/${eventId}/${encodeURIComponent(RR_PAGE)}/list?key=${encodeURIComponent(useKey)}` +
    `&listname=${encodeURIComponent(list.Name)}` +
    `&page=${encodeURIComponent(RR_PAGE)}` +
    `&contest=${list.Contest}&r=all&l=0`;
  const promise = (async () => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`RaceResult list "${list.Name}": HTTP ${res.status}`);
    }
    return (await res.json()) as RRListResp;
  })();
  // Cache the promise immediately so a concurrent caller within the same
  // tick reuses it. On failure, evict so the next call retries instead
  // of serving a rejected promise for the whole TTL.
  listCache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => {
    const cur = listCache.get(cacheKey);
    if (cur && cur.promise === promise) listCache.delete(cacheKey);
  });
  return promise;
}

// ---- field → column mapping ------------------------------------------------

function mapField(f: RRField): string {
  const e = f.Expression ?? "";
  // Composite expressions first so embedded references don't mis-match.
  if (/LastSeenName/.test(e)) return "PointLastSeen";
  if (/^AUTORANK$/.test(e)) return "Rank";
  if (/^COUNTRY\.FLAG$/.test(e)) return "Country";
  if (/^COUNTRY\.IOCNAME$/.test(e)) return "CountryIOC";
  if (/^DisplayName$/.test(e) || /FLNAME/.test(e)) return "Name";
  if (/^TeamDist$/.test(e) || /^TotalDistance/.test(e)) return "TotalDistanceMi";
  if (/^TS1\.LAPTIMETEAMNUMBER$/.test(e) || /^TIME48$/.test(e)) return "LapsCompleted";
  if (/LAPTIMETEAMTOTALTEXT/.test(e) || /^format\(\[T1\]/.test(e)) return "TotalTime";
  if (/^AGEGROUP/.test(e)) return "AgeGroup";
  if (/AgeGroupRank/.test(e)) return "AgeGroupRank";
  if (/^format\(\[T32\]/.test(e) || /^LastSplit$/.test(e)) return "TimeOfDay";
  const l = f.Label ?? "";
  const byLabel: Record<string, string> = {
    Rank: "Rank",
    Name: "Name",
    "Nat.": "Country",
    Team: "Team",
    "Last Seen": "PointLastSeen",
    "Point Last Seen": "PointLastSeen",
    "@TOD": "TimeOfDay",
    "@ ToD": "TimeOfDay",
    TOD: "TimeOfDay",
    Distance: "TotalDistanceMi",
    "Total Distance (mi)": "TotalDistanceMi",
    Laps: "LapsCompleted",
    "Laps Completed": "LapsCompleted",
    "Total Time": "TotalTime",
    "Age Group": "AgeGroup",
    "AG Rank": "AgeGroupRank",
  };
  return byLabel[l] ?? "_skip";
}

// Data rows are [Bib, ID, ...visible fields]. The Fields list carries a
// hidden BIB entry with no data column — skip it so headers stay aligned.
function buildHeaders(fields: RRField[]): string[] {
  const headers = ["Bib", "ID"];
  for (const f of fields) {
    if ((f.Expression ?? "") === "BIB") continue;
    headers.push(mapField(f));
  }
  return headers;
}

// ---- helpers ---------------------------------------------------------------

function clean(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  const m = s.match(/^\[img:\/graphics\/flags\/([A-Z]{2})\.svg\]$/);
  return m ? m[1] : s;
}

function parseHms(s: string | undefined): number | null {
  if (!s) return null;
  const t = s.trim();
  if (!t || t === "-") return null;
  const parts = t.split(":").map((x) => parseInt(x, 10));
  if (parts.some((n) => Number.isNaN(n))) return null;
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return null;
}

function todToISO(tod: string | undefined, raceStart: Date): string | null {
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
  const d = new Date(
    Date.UTC(
      raceStart.getUTCFullYear(),
      raceStart.getUTCMonth(),
      raceStart.getUTCDate(),
      h + offsetHours,
      mi,
      s,
    ),
  );
  if (d.getTime() < raceStart.getTime()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}

// Flatten a possibly-nested data tree into {sectionName => rows[]}.
function flatten(data: unknown): Record<string, string[][]> {
  const out: Record<string, string[][]> = {};
  if (Array.isArray(data)) {
    out[""] = data as string[][];
    return out;
  }
  if (data && typeof data === "object") {
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      const name = k.replace(/^#\d+_/, "");
      if (Array.isArray(v)) {
        out[name] = (out[name] ?? []).concat(v as string[][]);
      } else {
        for (const [nk, nv] of Object.entries(flatten(v))) {
          out[nk] = (out[nk] ?? []).concat(nv);
        }
      }
    }
  }
  return out;
}

function rowToRec(row: string[], headers: string[]): Record<string, string> {
  const rec: Record<string, string> = {};
  headers.forEach((h, i) => {
    rec[h] = clean(row[i]);
  });
  return rec;
}

function toInt(s: string | undefined, fallback = 0): number {
  if (!s) return fallback;
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : fallback;
}

// Sort by (laps desc, totalSec asc), assign ranks — mirrors fixtures.reRank.
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

function recToAthlete(
  r: Record<string, string>,
  gender: "M" | "F" | null,
  category: string,
  raceStart: Date,
): Athlete {
  const agRank =
    r.AgeGroupRank && r.AgeGroupRank !== "-" ? toInt(r.AgeGroupRank) || null : null;
  return {
    bib: toInt(r.Bib),
    name: (category === "Team" ? r.Team || r.Name : r.Name) ?? "",
    category,
    nation: r.Country ?? "",
    gender,
    overallRank: 0,
    genderRank: 0,
    ageGroupRank: agRank,
    distanceMiles: toInt(r.TotalDistanceMi),
    laps: toInt(r.LapsCompleted),
    lastLapSec: null,
    totalSec: parseHms(r.TotalTime),
    lastSeenLabel: r.PointLastSeen ?? "",
    lastSeenAt: todToISO(r.TimeOfDay, raceStart),
  };
}

// ---- public: athletes ------------------------------------------------------

export async function liveAthletes(
  eventId: string,
  slice: Slice,
  year: number,
): Promise<Athlete[]> {
  const cfg = await getConfig(eventId);
  const raceStart = raceTimingFor(year).start;

  if (slice === "teams") {
    const teamList = findList(cfg.lists, ["RTM Team Results", "Team Results"]);
    if (!teamList) return [];
    const resp = await fetchList(eventId, cfg.key, teamList);
    const headers = buildHeaders(resp.list?.Fields ?? []);
    const out: Athlete[] = [];
    for (const rows of Object.values(flatten(resp.data))) {
      for (const row of rows) {
        out.push(recToAthlete(rowToRec(row, headers), null, "Team", raceStart));
      }
    }
    return reRank(out);
  }

  const soloList = findList(cfg.lists, [
    "RTM Results Web",
    "Solo Results",
    "Individual Results",
  ]);
  if (!soloList) return [];
  const soloResp = await fetchList(eventId, cfg.key, soloList);
  const soloHeaders = buildHeaders(soloResp.list?.Fields ?? []);
  const soloSections = flatten(soloResp.data);

  const solo: Athlete[] = [];
  for (const [section, rows] of Object.entries(soloSections)) {
    const gender: "M" | "F" | null = /female/i.test(section)
      ? "F"
      : /male/i.test(section)
        ? "M"
        : null;
    for (const row of rows) {
      solo.push(recToAthlete(rowToRec(row, soloHeaders), gender, "Individual", raceStart));
    }
  }

  if (slice === "men") return reRank(solo.filter((a) => a.gender === "M"));
  if (slice === "women") return reRank(solo.filter((a) => a.gender === "F"));

  // overall = solo (men + women) + team members
  const memberList = findList(cfg.lists, [
    "RTM Results Team Members",
    "Results Team Members",
    "Team Members",
  ]);
  let members: Athlete[] = [];
  if (memberList) {
    const memResp = await fetchList(eventId, cfg.key, memberList);
    const memHeaders = buildHeaders(memResp.list?.Fields ?? []);
    members = [];
    for (const rows of Object.values(flatten(memResp.data))) {
      for (const row of rows) {
        members.push(
          recToAthlete(rowToRec(row, memHeaders), null, "TeamMember", raceStart),
        );
      }
    }
  }
  return reRank([...solo, ...members]);
}

// ---- public: passings ------------------------------------------------------

// Wide lap-detail row: [Bib, ID, logo, 5 const strings, lap1 (5 fields at
// 8-12), then laps 2..N as [num, pit, lap] triples from index 13].
function parseWideLapRow(
  row: string[],
): Array<{ n: number; pitSec: number; lapSec: number }> {
  const laps: Array<{ n: number; pitSec: number; lapSec: number }> = [];
  const push = (ln: string, pit: string, lt: string) => {
    if (!ln || !ln.trim()) return;
    const n = parseInt(ln, 10);
    if (!Number.isFinite(n)) return;
    laps.push({
      n,
      pitSec: n === 1 ? 0 : (parseHms(pit) ?? 0),
      lapSec: parseHms(lt) ?? 0,
    });
  };
  if (row.length >= 11) {
    push(String(row[8]), String(row[9]), String(row[10]));
  }
  for (let i = 13; i + 2 < row.length; i += 3) {
    push(String(row[i]), String(row[i + 1]), String(row[i + 2]));
  }
  return laps;
}

// Narrow lap-detail row (older events): [Bib, ID, LapNum, PitTime, LapTime, ...].
function parseNarrowLapRow(
  row: string[],
): { bib: number; n: number; pitSec: number; lapSec: number } | null {
  if (row.length < 5) return null;
  const bib = parseInt(String(row[0]), 10);
  const n = parseInt(String(row[2]), 10);
  if (!Number.isFinite(bib) || !Number.isFinite(n)) return null;
  return {
    bib,
    n,
    pitSec: n === 1 ? 0 : (parseHms(String(row[3])) ?? 0),
    lapSec: parseHms(String(row[4])) ?? 0,
  };
}

// The lap-detail list is published on its own page ("details0") and is
// fetched PER PARTICIPANT by pid (not bib), e.g.:
//   /<event>/details0/list?key=…&listname=Online|Lap Details&page=details0
//     &r=pid&pid=331&contest=2
// pid is the participant id carried as row[1] in the summary lists.
const DETAILS_PAGE = process.env.RACE_FEED_DETAILS_PAGE || "details0";
const DETAILS_LISTNAME = process.env.RACE_FEED_DETAILS_LISTNAME || "Online|Lap Details";

// bib -> { pid, contest } built from the summary lists, cached briefly.
let pidMapCache: {
  eventId: string;
  map: Map<number, { pid: string; contest: string }>;
  at: number;
} | null = null;

async function getPidMap(
  eventId: string,
): Promise<Map<number, { pid: string; contest: string }>> {
  if (
    pidMapCache &&
    pidMapCache.eventId === eventId &&
    Date.now() - pidMapCache.at < 60_000
  ) {
    return pidMapCache.map;
  }
  const cfg = await getConfig(eventId);
  const map = new Map<number, { pid: string; contest: string }>();
  const lists = [
    findList(cfg.lists, ["RTM Results Web", "Solo Results", "Individual Results"]),
    findList(cfg.lists, ["RTM Results Team Members", "Results Team Members", "Team Members"]),
    findList(cfg.lists, ["RTM Team Results", "Team Results"]),
  ].filter((l): l is RRConfigList => l != null);
  for (const list of lists) {
    const resp = await fetchList(eventId, cfg.key, list);
    for (const rows of Object.values(flatten(resp.data))) {
      for (const row of rows) {
        const bib = parseInt(String(row[0]), 10);
        const pid = String(row[1] ?? "").trim();
        if (Number.isFinite(bib) && pid && !map.has(bib)) {
          map.set(bib, { pid, contest: list.Contest });
        }
      }
    }
  }
  pidMapCache = { eventId, map, at: Date.now() };
  return map;
}

// Per-athlete lap history. The endpoint is per-pid, so this fetches just the
// one bib's laps — which is exactly what /api/passings/[bib] needs.
export async function liveBibPassings(
  eventId: string,
  year: number,
  bib: number,
): Promise<Passing[]> {
  const map = await getPidMap(eventId);
  const entry = map.get(bib);
  if (!entry) return [];
  const cfg = await getConfig(eventId);
  const key = RR_KEY || cfg.key;
  const url =
    `${RR_BASE}/${eventId}/${encodeURIComponent(DETAILS_PAGE)}/list?key=${encodeURIComponent(key)}` +
    `&listname=${encodeURIComponent(DETAILS_LISTNAME)}` +
    `&page=${encodeURIComponent(DETAILS_PAGE)}` +
    `&r=pid&pid=${encodeURIComponent(entry.pid)}` +
    `&contest=${entry.contest}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`RaceResult lap details bib ${bib} (pid ${entry.pid}): HTTP ${res.status}`);
  }
  const resp = (await res.json()) as RRListResp;
  const raceStart = raceTimingFor(year).start;
  const sections = flatten(resp.data);

  // Detect wide (one row, all laps) vs narrow (one row per lap).
  let sampleWidth = 0;
  for (const rows of Object.values(sections)) {
    if (rows.length > 0) {
      sampleWidth = rows[0].length;
      break;
    }
  }
  const narrow = sampleWidth > 0 && sampleWidth <= 8;

  const laps: Array<{ n: number; pitSec: number; lapSec: number }> = [];
  for (const rows of Object.values(sections)) {
    for (const row of rows) {
      if (narrow) {
        // Single-participant response: every row is this athlete's lap.
        const p = parseNarrowLapRow(row);
        if (p) laps.push({ n: p.n, pitSec: p.pitSec, lapSec: p.lapSec });
      } else {
        laps.push(...parseWideLapRow(row));
      }
    }
  }
  laps.sort((a, b) => a.n - b.n);

  const passings: Passing[] = [];
  let elapsedSec = 0;
  for (const lap of laps) {
    if (!lap.n) continue;
    elapsedSec += lap.pitSec + lap.lapSec;
    passings.push({
      bib,
      lapNumber: lap.n,
      elapsedSec,
      completedAt: new Date(raceStart.getTime() + elapsedSec * 1000).toISOString(),
      pitSec: lap.pitSec,
      lapSec: lap.lapSec,
    });
  }
  return passings;
}

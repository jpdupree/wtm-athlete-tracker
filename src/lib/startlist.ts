// Pre-race start-list seed.
//
// Lets spectators find and follow their athlete BEFORE the live RaceResult
// feed is switched on. Served by raceFeed.fetchSlice for a seeded year only
// when the live path isn't active — the moment RACE_FEED_EVENT +
// NEXT_PUBLIC_RACE_FEED_YEAR are set on race morning, the live feed
// supersedes this entirely (fetchSlice returns live before reaching here).
//
// Entries with a real, uniquely-owned bib auto-join the live feed by bib.
// Provisional entries (no bib assigned yet, or a relay teammate sharing a
// team bib) carry a synthetic bib >= 9_000_000 so they're followable now;
// they attach to live data by name once the official bibs publish
// (see lapSync reconciliation).

import startlist2026 from "@/data/startlist-2026.json";
import type { Athlete, Slice } from "./types";

export type SeedAthlete = {
  bib: number;
  name: string;
  gender: "M" | "F" | null;
  category: string; // "Individual" | "Relay" | "Team"
  provisional: boolean;
};

type SeedFile = { athletes: SeedAthlete[] };

const SEEDS: Record<number, SeedFile> = {
  2026: startlist2026 as SeedFile,
};

export function hasStartlist(year: number): boolean {
  return year in SEEDS;
}

export const SYNTHETIC_BIB_MIN = 9_000_000;

export function isSyntheticBib(bib: number): boolean {
  return bib >= SYNTHETIC_BIB_MIN;
}

function toAthlete(s: SeedAthlete): Athlete {
  return {
    bib: s.bib,
    name: s.name,
    category: s.category === "Team" ? "Team" : s.category,
    nation: "",
    gender: s.gender,
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

// Athlete[] for a slice from the seeded start list, or null when the year
// has no seed (callers then fall back to fixtures / live).
export function startlistForSlice(slice: Slice, year: number): Athlete[] | null {
  const seed = SEEDS[year];
  if (!seed) return null;
  const people = seed.athletes;
  let picked: SeedAthlete[];
  if (slice === "teams") {
    picked = people.filter((p) => p.category === "Team");
  } else if (slice === "men") {
    picked = people.filter((p) => p.category !== "Team" && p.gender === "M");
  } else if (slice === "women") {
    picked = people.filter((p) => p.category !== "Team" && p.gender === "F");
  } else {
    // overall = all individuals + relay members (no team entities)
    picked = people.filter((p) => p.category !== "Team");
  }
  return picked.map(toAthlete);
}

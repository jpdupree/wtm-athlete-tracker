export type Slice = "overall" | "men" | "women" | "teams";

export type RawAthleteRow = {
  Rank: number;
  Bib: number;
  Name: string;
  Category: string;
  Gender: number;
  Nation: string;
  AgeGroup: number | "";
  Distance: string;
  Laps: string;
  LastLapTime: string;
  LastSeen: string;
  LastSeenTOD: string;
  TotalTime: string;
};

export type Athlete = {
  bib: number;
  name: string;
  category: string;
  nation: string;
  gender: "M" | "F" | null;
  overallRank: number;
  genderRank: number;
  ageGroupRank: number | null;
  distanceMiles: number;
  laps: number;
  lastLapSec: number | null;
  totalSec: number | null;
  lastSeenLabel: string;
  lastSeenAt: string | null;
};

export type FeedResponse = {
  slice: Slice;
  fetchedAt: string;
  cached: boolean;
  ageMs: number;
  rows: Athlete[];
};

// Per-crossing data from the RaceResult passings list. Shape is a best-guess
// of typical RR passings exports — adjust fields here when the real URL is wired.
export type RawPassing = {
  Bib: number;
  Loop?: number | string;
  Lap?: number | string;
  Section?: number | string;
  Time?: string; // h:mm:ss elapsed since start
  TOD?: string;  // "9:00:16 AM" venue wall clock
};

export type Passing = {
  bib: number;
  lapNumber: number;
  elapsedSec: number;
  completedAt: string; // ISO
  // Seconds spent in the pit BEFORE this lap (0 for lap 1, null if unknown).
  pitSec: number | null;
  // Running duration of this lap in seconds (null if unknown).
  lapSec: number | null;
};

export type PassingsResponse = {
  bib: number;
  fetchedAt: string;
  cached: boolean;
  ageMs: number;
  synthetic: boolean;
  passings: Passing[];
};

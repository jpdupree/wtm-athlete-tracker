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

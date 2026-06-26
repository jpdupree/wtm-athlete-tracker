// Per-year configuration. Add a new entry to YEARS to enable that year in
// the picker — no other code touches needed for the UI side. Hooking up
// actual race data for a year is a separate step (fixtures or live API).

export type YearConfig = {
  year: number;
  // RaceResult event id, if known. Null for years whose event hasn't been
  // published yet.
  eventId: string | null;
  // YouTube (or other) URL for that year's live broadcast or recording.
  // Race-day 2026 uses the channel's /live page which redirects to the
  // current stream; past years should point at the recorded broadcast.
  // null while the link isn't known yet — the UI renders "link pending".
  liveStreamUrl: string | null;
  // Display venue name for the year (used in the picker tooltip).
  venue: string;
  // Whether the app currently has fixture / live data wired up for this
  // year. When false, the UI shows a "data not yet wired up" banner and
  // the followed list / picker still works but no athlete data flows.
  hasData: boolean;
};

// 2022 was the first year The OCR Report live-streamed WTM, so the
// picker starts there. Each year's liveStreamUrl points at the YouTube
// playlist of that year's broadcast; 2026 uses the channel's /live
// page which redirects to the current stream on race day.
export const YEARS: YearConfig[] = [
  {
    year: 2021,
    eventId: "186269",
    liveStreamUrl: null,
    venue: "Laughlin, NV",
    hasData: true,
  },
  {
    year: 2022,
    eventId: "225090",
    liveStreamUrl:
      "https://youtube.com/playlist?list=PLyK0g0eIg3RUatl_wqdq80W5fLcUyB1rW&si=V549l4spA0XEJKVU",
    venue: "Atmore, AL",
    hasData: true,
  },
  {
    year: 2023,
    eventId: "268297",
    liveStreamUrl:
      "https://youtube.com/playlist?list=PLyK0g0eIg3RUsISbDpQ4GVWqpQeYojXrD&si=sLFvoifPBAvlFIDD",
    venue: "Texas",
    hasData: true,
  },
  {
    year: 2024,
    eventId: "316804",
    liveStreamUrl:
      "https://youtube.com/playlist?list=PLyK0g0eIg3RVw1pdRLA86GNFXJnAfcKeb&si=Qe3MMiChPpJwoc71",
    venue: "Florida",
    hasData: true,
  },
  {
    year: 2025,
    eventId: "348237",
    liveStreamUrl:
      "https://youtube.com/playlist?list=PLyK0g0eIg3RWM689bEHjn1e8Tr0Vjoeau&si=TVcm_64RIbtH8Esk",
    venue: "Belvoir Castle",
    hasData: true,
  },
  { year: 2026, eventId: "406834", liveStreamUrl: "https://www.youtube.com/playlist?list=PLyK0g0eIg3RV948Mr1zWCye6wvIGVF7qM", venue: "TBA", hasData: false },
];

export const DEFAULT_YEAR = 2025;

export function configFor(year: number): YearConfig {
  return YEARS.find((y) => y.year === year) ?? YEARS.find((y) => y.year === DEFAULT_YEAR)!;
}

// The year currently wired to the live RaceResult feed, if any.
// NEXT_PUBLIC_ so the value reaches the client (useFeed's data gate) as
// well as the server (raceFeed / passings). Race day = set this to the
// new year alongside RACE_FEED_EVENT.
export function liveFeedYear(): number | null {
  const raw = process.env.NEXT_PUBLIC_RACE_FEED_YEAR;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Years that ship a pre-race start-list seed (src/data/startlist-<year>.json).
// Kept as a static list here — rather than importing the seed module — so
// years.ts (used widely on the client) doesn't pull the large roster JSON
// into the client bundle. The roster reaches the client via the API.
const STARTLIST_YEARS = new Set<number>([2026]);

export function yearHasStartlist(year: number): boolean {
  return STARTLIST_YEARS.has(year);
}

// Whether a year should fetch athlete data: it has bundled fixtures, is the
// live feed year (served from the RaceResult adapter), or ships a pre-race
// start-list seed so people can follow before the feed switches on.
export function yearHasData(year: number): boolean {
  return (
    configFor(year).hasData ||
    liveFeedYear() === year ||
    yearHasStartlist(year)
  );
}

export function liveResultsUrlFor(year: number): string | null {
  const c = configFor(year);
  return c.eventId ? `https://my.raceresult.com/${c.eventId}/` : null;
}

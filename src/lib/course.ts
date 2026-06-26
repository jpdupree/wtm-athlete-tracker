// Course geometry helpers for the WTM 2026 map.
//
// The GeoJSON is generated from Tough Mudder's KMZ by
// scripts/kmz-to-geojson.mjs and served from /public/course/. Coordinates
// are GeoJSON order: [lon, lat]. Leaflet wants [lat, lon] — convert at the
// boundary with toLatLng().

export type LonLat = [number, number];

export type CourseFeature = {
  type: "Feature";
  properties: {
    name: string;
    folder: string | null;
    kind: "linestring" | "point" | "polygon";
    obstacleNum: number | null;
  };
  geometry:
    | { type: "LineString"; coordinates: LonLat[] }
    | { type: "Point"; coordinates: LonLat }
    | { type: "Polygon"; coordinates: LonLat[][] };
};

export type CourseData = {
  type: "FeatureCollection";
  bbox?: [number, number, number, number];
  properties: { source: string; center: LonLat | null; featureCount: number };
  features: CourseFeature[];
};

export const COURSE_URL = "/course/wtm-2026-v5.geojson";

// The main racing loop — longest linestring whose name mentions loop/course.
export function findLoop(data: CourseData): CourseFeature | null {
  const lines = data.features.filter(
    (f) => f.geometry.type === "LineString",
  );
  const named = lines.filter((f) => /loop|course/i.test(f.properties.name));
  const pool = named.length > 0 ? named : lines;
  return (
    pool.sort(
      (a, b) =>
        (b.geometry as { coordinates: LonLat[] }).coordinates.length -
        (a.geometry as { coordinates: LonLat[] }).coordinates.length,
    )[0] ?? null
  );
}

// Haversine distance in metres between two [lon,lat] points.
function haversine(a: LonLat, b: LonLat): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b[1] - a[1]);
  const dLon = toRad(b[0] - a[0]);
  const lat1 = toRad(a[1]);
  const lat2 = toRad(b[1]);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// Precompute cumulative distances so repeated fraction lookups are cheap.
export type LoopIndex = {
  coords: LonLat[];
  cumulative: number[]; // cumulative[i] = distance from start to vertex i
  total: number;
};

export function indexLoop(loop: CourseFeature): LoopIndex {
  const coords = (loop.geometry as { coordinates: LonLat[] }).coordinates;
  const cumulative: number[] = [0];
  for (let i = 1; i < coords.length; i++) {
    cumulative[i] = cumulative[i - 1] + haversine(coords[i - 1], coords[i]);
  }
  return { coords, cumulative, total: cumulative[cumulative.length - 1] || 1 };
}

// Interpolate the [lon,lat] point that lies `fraction` (0..1) of the way
// along the loop by arc length. Clamps out-of-range fractions.
export function pointAtFraction(idx: LoopIndex, fraction: number): LonLat {
  const f = Math.max(0, Math.min(1, fraction));
  const target = f * idx.total;
  // Binary search the cumulative array for the segment containing `target`.
  let lo = 0;
  let hi = idx.cumulative.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (idx.cumulative[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return idx.coords[0];
  const segStart = idx.cumulative[lo - 1];
  const segEnd = idx.cumulative[lo];
  const segLen = segEnd - segStart || 1;
  const t = (target - segStart) / segLen;
  const a = idx.coords[lo - 1];
  const b = idx.coords[lo];
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

// Strip a leading "N. " obstacle-number prefix for display.
export function obstacleLabel(name: string): string {
  return name.replace(/^\d+\.\s+/, "");
}

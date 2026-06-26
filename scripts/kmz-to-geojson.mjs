#!/usr/bin/env node
// Convert a Google-Earth KMZ (or KML) of the WTM course into a GeoJSON
// FeatureCollection. Output is written next to public/course/<basename>.geojson
// and ready for any map library to draw.
//
// Usage:
//   node scripts/kmz-to-geojson.mjs <path-to-file.kmz>
//   node scripts/kmz-to-geojson.mjs <path-to-file.kml>
//
// Each output feature carries:
//   - properties.name        (the Placemark name)
//   - properties.folder      (the parent Folder name — Obstacles, Mile Markers, …)
//   - properties.kind        (linestring | point | polygon)
//   - properties.obstacleNum (parsed when the name starts with "1. …", "20. …")
// The FeatureCollection also exposes:
//   - bbox  [minLon, minLat, maxLon, maxLat]   for default map fit
//   - properties.center  [lon, lat]            convenience midpoint
//   - properties.source  basename of the input file

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const src = process.argv[2];
if (!src) {
  console.error("usage: node scripts/kmz-to-geojson.mjs <file.kmz|file.kml>");
  process.exit(1);
}
const inPath = resolve(src);
if (!existsSync(inPath)) {
  console.error(`not found: ${inPath}`);
  process.exit(1);
}

// ---- get the KML text -------------------------------------------------------

function readKmlFromKmz(path) {
  // KMZ is just a zip with a doc.kml inside. Use the system `unzip` to avoid
  // a node_modules dependency.
  const tmpDir = `/tmp/kmz-${process.pid}`;
  mkdirSync(tmpDir, { recursive: true });
  execSync(`unzip -o -j -q "${path}" "doc.kml" -d "${tmpDir}"`);
  const kmlPath = join(tmpDir, "doc.kml");
  return readFileSync(kmlPath, "utf8");
}

const isKmz = inPath.toLowerCase().endsWith(".kmz");
const kml = isKmz ? readKmlFromKmz(inPath) : readFileSync(inPath, "utf8");

// ---- minimal KML walker (regex-based, KML is well-structured) ---------------

// Parse a <coordinates> block into [lon,lat,(alt)] tuples. KML separates
// coord sets with whitespace and the lon/lat/alt with commas.
function parseCoords(text) {
  return text
    .trim()
    .split(/\s+/)
    .map((s) => s.split(",").map(Number))
    .filter((t) => Number.isFinite(t[0]) && Number.isFinite(t[1]))
    .map(([lon, lat]) => [lon, lat]); // drop altitude, GeoJSON only wants [lon,lat]
}

// Walk Placemarks while tracking the current Folder name.
const features = [];
let cursor = 0;
const folderStack = [];

function scanRange(text) {
  // Iterate <Folder> and <Placemark> in source order so folder context is right.
  const tagRe = /<(\/?)(Folder|Placemark)\b[^>]*>/g;
  let m;
  while ((m = tagRe.exec(text)) !== null) {
    const closing = m[1] === "/";
    const tag = m[2];
    const idx = m.index;

    if (tag === "Folder") {
      if (!closing) {
        // Pull the folder's <name>...</name> — it's the first <name> after the open tag.
        const after = text.slice(idx);
        const nm = after.match(/<name>([\s\S]*?)<\/name>/);
        folderStack.push(nm ? nm[1].trim() : "(unnamed folder)");
      } else {
        folderStack.pop();
      }
      continue;
    }

    if (tag === "Placemark" && !closing) {
      // Slice out the placemark body up to its closing tag.
      const closeIdx = text.indexOf("</Placemark>", idx);
      if (closeIdx < 0) continue;
      const body = text.slice(idx, closeIdx);
      const name = (body.match(/<name>([\s\S]*?)<\/name>/) || [])[1]?.trim() ?? "";
      const folder = folderStack[folderStack.length - 1] ?? null;

      // obstacleNum: pull a leading "N. " prefix from the placemark name.
      const obstacleMatch = name.match(/^(\d+)\.\s+/);
      const obstacleNum = obstacleMatch ? parseInt(obstacleMatch[1], 10) : null;

      const baseProps = { name, folder, obstacleNum };

      // Determine geometry. Order matters: LineString before Polygon before Point
      // since a Polygon can contain a LinearRing of coordinates and we want the
      // outer ring, not the bounding box's edges.
      const ls = body.match(/<LineString>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/LineString>/);
      const poly = body.match(/<Polygon>[\s\S]*?<outerBoundaryIs>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>/);
      const pt = body.match(/<Point>[\s\S]*?<coordinates>([\s\S]*?)<\/coordinates>[\s\S]*?<\/Point>/);

      if (ls) {
        features.push({
          type: "Feature",
          properties: { ...baseProps, kind: "linestring" },
          geometry: { type: "LineString", coordinates: parseCoords(ls[1]) },
        });
      } else if (poly) {
        features.push({
          type: "Feature",
          properties: { ...baseProps, kind: "polygon" },
          geometry: { type: "Polygon", coordinates: [parseCoords(poly[1])] },
        });
      } else if (pt) {
        const c = parseCoords(pt[1])[0];
        if (c) {
          features.push({
            type: "Feature",
            properties: { ...baseProps, kind: "point" },
            geometry: { type: "Point", coordinates: c },
          });
        }
      }
    }
  }
}

scanRange(kml);
void cursor; // silence

// ---- compute bbox + center --------------------------------------------------

let minLon = Infinity,
  minLat = Infinity,
  maxLon = -Infinity,
  maxLat = -Infinity;

function visit([lon, lat]) {
  if (lon < minLon) minLon = lon;
  if (lat < minLat) minLat = lat;
  if (lon > maxLon) maxLon = lon;
  if (lat > maxLat) maxLat = lat;
}

for (const f of features) {
  const g = f.geometry;
  if (g.type === "Point") visit(g.coordinates);
  else if (g.type === "LineString") g.coordinates.forEach(visit);
  else if (g.type === "Polygon") g.coordinates[0].forEach(visit);
}

const center =
  Number.isFinite(minLon) && Number.isFinite(minLat)
    ? [(minLon + maxLon) / 2, (minLat + maxLat) / 2]
    : null;

const fc = {
  type: "FeatureCollection",
  bbox: Number.isFinite(minLon) ? [minLon, minLat, maxLon, maxLat] : undefined,
  properties: {
    source: basename(inPath),
    extractedAt: process.argv[3] ?? null, // optional ISO timestamp from caller
    center,
    featureCount: features.length,
  },
  features,
};

// ---- write output -----------------------------------------------------------

const outDir = join(repoRoot, "public", "course");
mkdirSync(outDir, { recursive: true });
const outName = basename(inPath)
  .replace(/\.(kmz|kml)$/i, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)/g, "");
const outPath = join(outDir, `${outName}.geojson`);
writeFileSync(outPath, JSON.stringify(fc));

// ---- short report -----------------------------------------------------------

console.log(`== ${basename(inPath)} ==`);
console.log(`features: ${features.length}`);
const byFolder = new Map();
for (const f of features) {
  const k = f.properties.folder ?? "(no folder)";
  byFolder.set(k, (byFolder.get(k) ?? 0) + 1);
}
for (const [k, n] of byFolder) console.log(`  ${k.padEnd(28)} ${n}`);
// Pick the most likely "course loop": the longest linestring whose name
// references a loop / course, falling back to the longest linestring overall.
const lineFeatures = features.filter((f) => f.properties.kind === "linestring");
const loopCandidates = lineFeatures.filter((f) =>
  /loop|course/i.test(f.properties.name ?? ""),
);
const courseLine =
  (loopCandidates.length > 0 ? loopCandidates : lineFeatures).sort(
    (a, b) => b.geometry.coordinates.length - a.geometry.coordinates.length,
  )[0] ?? null;
if (courseLine) {
  console.log(
    `course loop: "${courseLine.properties.name}" with ${courseLine.geometry.coordinates.length} vertices`,
  );
}
for (const ls of lineFeatures) {
  if (ls === courseLine) continue;
  if (ls.properties.name === "Participant Direction") continue;
  console.log(
    `other line: "${ls.properties.name}" with ${ls.geometry.coordinates.length} vertices`,
  );
}
console.log(`bbox: ${JSON.stringify(fc.bbox)}`);
console.log(`center: ${JSON.stringify(center)}`);
console.log(`wrote: ${outPath.replace(repoRoot + "/", "")} (${(JSON.stringify(fc).length / 1024).toFixed(1)} KB)`);

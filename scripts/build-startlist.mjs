#!/usr/bin/env node
// Build a pre-race start-list seed from a RaceResult/registration .xlsx export.
//
// Usage:
//   node scripts/build-startlist.mjs <participants.xlsx> [year]
//   (year defaults to 2026)
//
// Writes src/data/startlist-<year>.json — the file raceFeed serves pre-race.
//
// What it does:
//   - Reads the first worksheet. Expects a header row containing the
//     columns: Bib, Name, Gender (Age used only to detect data rows).
//   - Splits the sheet into sections by the lone-label header rows
//     ("Pit Crew", "... Individual Participant", "... Team Relay",
//     "Team", "Brunch Ticket", etc). EXCLUDES Pit Crew and Brunch.
//   - Every athlete gets a UNIQUE bib: the real one if present and not
//     already taken, otherwise a synthetic bib >= 9_000_000 (flagged
//     provisional — followable now, attaches to live by its real bib
//     once that's known / once you re-run this against an updated export).
//
// The source .xlsx is NOT committed (it carries ages etc); only the
// derived JSON (name + bib + gender + category) is.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

const src = process.argv[2];
const year = parseInt(process.argv[3] ?? "2026", 10);
if (!src) {
  console.error("usage: node scripts/build-startlist.mjs <participants.xlsx> [year]");
  process.exit(1);
}

const SYNTH_MIN = 9_000_000;

// ---- unzip xlsx + parse the first worksheet --------------------------------

const tmp = `/tmp/startlist-xlsx-${process.pid}`;
mkdirSync(tmp, { recursive: true });
execSync(`unzip -o -q "${resolve(src)}" -d "${tmp}"`);

const decode = (s) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");

const ssXml = readFileSync(join(tmp, "xl/sharedStrings.xml"), "utf8");
const strings = [...ssXml.matchAll(/<si>(.*?)<\/si>/gs)].map((m) =>
  [...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((t) => decode(t[1])).join(""),
);

const sheetXml = readFileSync(join(tmp, "xl/worksheets/sheet1.xml"), "utf8");
const colLetter = (r) => r.replace(/\d+/g, "");
const colIndex = (l) => {
  let n = 0;
  for (const ch of l) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
};
const grid = [];
for (const [, , body] of sheetXml.matchAll(/<row[^>]*r="(\d+)"[^>]*>(.*?)<\/row>/gs)) {
  const cells = [
    ...body.matchAll(
      /<c r="([A-Z]+\d+)"(?:[^>]*t="([^"]*)")?[^>]*>(?:<v>(.*?)<\/v>)?(?:<is><t[^>]*>(.*?)<\/t><\/is>)?<\/c>/gs,
    ),
  ];
  const a = [];
  for (const [, ref, type, v, inline] of cells) {
    const ci = colIndex(colLetter(ref));
    a[ci] = type === "s" ? strings[parseInt(v, 10)] ?? "" : inline != null ? inline : v ?? "";
  }
  grid.push(a);
}

// ---- locate columns from the header row ------------------------------------

let headerIdx = grid.findIndex((r) => r.some((c) => /^name$/i.test((c ?? "").trim())));
if (headerIdx < 0) headerIdx = 0;
const header = grid[headerIdx].map((c) => (c ?? "").trim().toLowerCase());
const col = (name) => header.findIndex((h) => h === name || h.startsWith(name));
const C = {
  bib: col("bib"),
  name: col("name"),
  age: col("age"),
  gender: col("gender"),
};
if (C.name < 0) {
  console.error("could not find a 'Name' column in the header row");
  process.exit(1);
}

// ---- walk rows, tracking the current section -------------------------------

function classify(label) {
  const l = label.toLowerCase();
  if (l.includes("pit crew")) return { keep: false };
  if (l.includes("brunch")) return { keep: false };
  if (l.includes("relay")) return { keep: true, category: "Relay" };
  if (l.includes("individual")) return { keep: true, category: "Individual" };
  if (l === "team" || (l.includes("team") && !l.includes("relay"))) {
    return { keep: true, category: "Team" };
  }
  return null; // unrecognised title (e.g. the event name) — leave section as-is
}

let section = null; // {keep, category}
const people = [];
grid.forEach((r, i) => {
  if (i <= headerIdx) return;
  const name = (r[C.name] ?? "").trim();
  const age = C.age >= 0 ? (r[C.age] ?? "").trim() : "";
  const isData = name && age && !isNaN(parseInt(age));
  if (!isData) {
    // Possible section header: a lone label, no name.
    const label = (r[0] ?? "").trim() || name;
    if (label && isNaN(parseInt(label))) {
      const c = classify(label);
      if (c) section = c;
    }
    return;
  }
  if (!section || !section.keep) return; // skip pit crew / brunch / pre-section
  const bibRaw = C.bib >= 0 ? (r[C.bib] ?? "").trim() : "";
  const realBib =
    /^\d+$/.test(bibRaw) && bibRaw !== "00000" && parseInt(bibRaw) > 0
      ? parseInt(bibRaw, 10)
      : null;
  const g = (C.gender >= 0 ? r[C.gender] ?? "" : "").trim().toUpperCase();
  people.push({
    realBib,
    name: name.replace(/\s+/g, " "),
    gender: g === "M" ? "M" : g === "F" ? "F" : null,
    category: section.category,
  });
});

// ---- dedupe + assign unique bibs -------------------------------------------

const seen = new Set();
const uniq = [];
for (const p of people) {
  const k = `${p.realBib ?? "-"}|${p.name.toLowerCase()}`;
  if (seen.has(k)) continue;
  seen.add(k);
  uniq.push(p);
}

const usedReal = new Set();
let synth = SYNTH_MIN;
const athletes = uniq.map((p) => {
  let bib, provisional;
  if (p.realBib != null && !usedReal.has(p.realBib)) {
    usedReal.add(p.realBib);
    bib = p.realBib;
    provisional = false;
  } else {
    bib = synth++;
    provisional = true;
  }
  return { bib, name: p.name, gender: p.gender, category: p.category, provisional };
});

// ---- write -----------------------------------------------------------------

const realCount = athletes.filter((a) => !a.provisional).length;
const payload = {
  event: `WTM ${year}`,
  generatedFrom: src.replace(/.*\//, ""),
  note: "Provisional entries have no assigned bib yet (synthetic bib >= 9000000). Real-bib entries auto-join the live feed.",
  athletes,
};
const outDir = join(repoRoot, "src", "data");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `startlist-${year}.json`);
writeFileSync(outPath, JSON.stringify(payload));

console.log(`== startlist ${year} ==`);
console.log(`athletes: ${athletes.length} | real-bib (auto-join): ${realCount} | provisional: ${athletes.length - realCount}`);
console.log(
  "by category:",
  JSON.stringify(
    athletes.reduce((o, a) => ((o[a.category] = (o[a.category] || 0) + 1), o), {}),
  ),
);
console.log(`unique bibs: ${new Set(athletes.map((a) => a.bib)).size === athletes.length}`);
console.log(`wrote ${outPath.replace(repoRoot + "/", "")} (${(JSON.stringify(payload).length / 1024).toFixed(1)} KB)`);
if (realCount < athletes.length) {
  console.log(`\n${athletes.length - realCount} athletes still lack a real bib — re-run against a newer export once check-in assigns them.`);
}

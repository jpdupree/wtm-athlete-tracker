#!/usr/bin/env node
// Probe a RaceResult event's public endpoints and save data to mocks/.
// Usage: node scripts/scrape-raceresult.mjs [event_id]    (default: 348237)
//
// What it tries:
//  1. Fetch the SPA HTML at my.raceresult.com/<event>/ and look for the read-key.
//  2. Call RRPublish/data/config to enumerate the lists the event publishes.
//  3. Pull common listnames (Overall / Men / Women / Teams / Passings / …) and
//     save any list that returns rows.
//
// If step 1 finds no key, open the page in a browser, watch DevTools → Network,
// reload, and look for an XHR to .../RRPublish/data/list?key=XYZ&listname=…
// Pass that key in via the RR_KEY env var: RR_KEY=xyz node scripts/scrape-...

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVENT = process.argv[2] ?? "348237";
const BASE = `https://my.raceresult.com/${EVENT}`;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "mocks");
mkdirSync(OUT, { recursive: true });

async function getRaw(url) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Accept: "text/html,application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Referer: `${BASE}/`,
      },
    });
    const text = await res.text();
    return { status: res.status, text };
  } catch (err) {
    return { status: 0, text: "", error: err.message };
  }
}

async function getJSON(url) {
  const r = await getRaw(url);
  if (r.status !== 200) return { ok: false, ...r };
  try {
    return { ok: true, status: 200, text: r.text, json: JSON.parse(r.text) };
  } catch {
    return { ok: false, status: 200, parseError: true, text: r.text };
  }
}

function save(name, content) {
  const p = join(OUT, name);
  writeFileSync(p, content);
  return p;
}

console.log(`== scraping RaceResult event ${EVENT} ==`);
console.log(`base: ${BASE}\n`);

// ---- 1. fetch SPA HTML, scrape for a read-key ----
console.log("[1] fetching page HTML…");
const page = await getRaw(`${BASE}/`);
console.log(`    status ${page.status}, ${page.text.length} bytes`);
if (page.status !== 200) {
  console.log(`    error: ${page.error ?? "non-200"}`);
}
save(`${EVENT}-page.html`, page.text);

let key = process.env.RR_KEY ?? null;
if (!key) {
  // Common embedded patterns.
  const patterns = [
    /"key"\s*:\s*"([A-Za-z0-9_-]{8,})"/i,
    /'key'\s*:\s*'([A-Za-z0-9_-]{8,})'/i,
    /[?&]key=([A-Za-z0-9_-]{8,})/,
    /readKey['"]?\s*[:=]\s*['"]([A-Za-z0-9_-]{8,})['"]/i,
    /accessKey['"]?\s*[:=]\s*['"]([A-Za-z0-9_-]{8,})['"]/i,
  ];
  for (const re of patterns) {
    const m = page.text.match(re);
    if (m) {
      key = m[1];
      console.log(`    found key via ${re.source}: ${key}`);
      break;
    }
  }
}
if (!key) {
  console.log(
    "    no key found in HTML. Open the page in a browser, watch DevTools",
  );
  console.log(
    "    Network for an XHR to /RRPublish/data/list?key=XYZ, then re-run:",
  );
  console.log(`    RR_KEY=XYZ node ${process.argv[1].replace(/.*\//, "")}`);
}

// ---- 2. enumerate published lists ----
console.log("\n[2] probing RRPublish config…");
for (const url of [
  `${BASE}/RRPublish/data/config?eventid=${EVENT}${key ? `&key=${key}` : ""}`,
  `${BASE}/RRPublish/data/config?eventid=${EVENT}`,
]) {
  const r = await getJSON(url);
  console.log(`    ${url}`);
  console.log(`      -> ${r.ok ? "ok" : r.status} ${r.text?.length ?? 0}b`);
  if (r.ok) {
    save(`${EVENT}-config.json`, r.text);
    if (r.json?.Lists) {
      console.log(`      lists: ${Object.keys(r.json.Lists).join(", ")}`);
    }
    if (r.json?.lists) {
      console.log(`      lists: ${Object.keys(r.json.lists).join(", ")}`);
    }
    break;
  }
}

// ---- 3. pull common listnames ----
if (!key) {
  console.log("\n[3] skipping list pulls (no key). Re-run with RR_KEY=… set.");
  process.exit(0);
}
console.log("\n[3] pulling lists with key…");
const listnames = [
  "Overall",
  "Result Lists|Overall",
  "Result Lists|Overall Results",
  "Men",
  "Result Lists|Men",
  "Women",
  "Result Lists|Women",
  "Teams",
  "Result Lists|Teams",
  "Passings",
  "Passings|Passings",
  "Result Lists|Passings",
  "Crossings",
  "Times",
  "Splits",
  "Start List",
  "Participants",
];
for (const listname of listnames) {
  const url = `${BASE}/RRPublish/data/list?eventid=${EVENT}&key=${encodeURIComponent(
    key,
  )}&listname=${encodeURIComponent(listname)}`;
  const r = await getJSON(url);
  if (!r.ok) {
    console.log(`    ${listname.padEnd(34)} -> ${r.status}`);
    continue;
  }
  const items = Array.isArray(r.json)
    ? r.json
    : Array.isArray(r.json?.data)
      ? r.json.data
      : null;
  const count = items?.length ?? "?";
  console.log(`    ${listname.padEnd(34)} -> ok, items: ${count}`);
  if (items && items.length > 0) {
    const safe = listname.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    save(`${EVENT}-${safe}.json`, JSON.stringify(items, null, 2));
    const sample = items[0];
    console.log(
      `      sample keys: ${
        sample && typeof sample === "object"
          ? Object.keys(sample).join(", ")
          : typeof sample
      }`,
    );
  }
}

console.log("\n== done ==");
console.log(`Files in ${OUT.replace(process.cwd() + "/", "")}/. Inspect to find:`);
console.log("  - the 'overall' list (matches our existing mock shape)");
console.log("  - the 'passings' list (per-crossing data we currently lack)");
console.log("\nOnce identified, paste the working URL into .env.local as");
console.log(`  RACE_FEED_OVERALL=${BASE}/RRPublish/data/list?eventid=${EVENT}&key=${key ?? "<KEY>"}&listname=<NAME>`);

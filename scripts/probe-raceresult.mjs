#!/usr/bin/env node
// Probe RaceResult API endpoint shapes to find the one that serves this
// event's results. Run from a machine with internet (your Codespace):
//
//   node scripts/probe-raceresult.mjs <eventId> <key>
//   e.g. node scripts/probe-raceresult.mjs 406834 1DE6B6
//
// Paste the FULL output back. Each line shows HTTP status + the first slice
// of the body for a candidate URL; the winner is whichever returns JSON
// containing "lists" / "Result Lists" / real data (not an error).

const [event, key] = process.argv.slice(2);
if (!event || !key) {
  console.error("usage: node scripts/probe-raceresult.mjs <eventId> <key>");
  process.exit(1);
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

const API = "https://api.raceresult.com";
const MY = "https://my.raceresult.com";
const L = "Result Lists|Overall"; // a common results list name
const enc = encodeURIComponent;

// Candidate URLs, ordered roughly by likelihood.
const candidates = [
  // key-in-path under the API host
  `${API}/${event}/${key}/RRPublish/data/config?page=results`,
  `${API}/${event}/${key}/RRPublish/data/config`,
  `${API}/${event}/${key}/data/config?page=results`,
  `${API}/${event}/${key}/RRPublish/data/list?listname=${enc(L)}&page=results&contest=0&r=all`,
  // api name after event, key as query
  `${API}/${event}/RRPublish/data/config?key=${key}&page=results`,
  `${API}/${event}/RRPublish/data/config?key=${key}`,
  `${API}/${event}/RRPublish/data/list?key=${key}&listname=${enc(L)}&page=results&contest=0&r=all`,
  // RaceResult Web API "simple" style
  `${API}/${event}/${key}/simpleapi`,
  `${API}/${event}/${key}/RRPublish`,
  // my.raceresult.com host with the key as a query param
  `${MY}/${event}/RRPublish/data/config?key=${key}&page=results`,
  `${MY}/${event}/RRPublish/data/config?key=${key}`,
  `${MY}/${event}/RRPublish/data/list?key=${key}&listname=${enc(L)}&page=results&contest=0&r=all`,
  // RRPublish-before-event format
  `${MY}/RRPublish/data/config?eventid=${event}&key=${key}&page=results`,
  `${MY}/RRPublish/data/list?eventid=${event}&key=${key}&listname=${enc(L)}&contest=0&r=all`,
  // page as the numeric from the URL hash
  `${API}/${event}/${key}/RRPublish/data/config?page=2`,
  `${MY}/${event}/RRPublish/data/config?key=${key}&page=2`,
];

console.log(`Probing event ${event} key ${key} — ${candidates.length} candidates\n`);

for (const url of candidates) {
  let line;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/json,*/*" },
    });
    const body = (await res.text()).replace(/\s+/g, " ").trim();
    const looksGood =
      res.ok &&
      /("lists"|Result Lists|"data"\s*:|"key"\s*:)/i.test(body) &&
      !/error/i.test(body.slice(0, 40));
    line = `${looksGood ? "✅" : "  "} HTTP ${res.status}  ${url}\n        ${body.slice(0, 160)}`;
  } catch (e) {
    line = `  ERR        ${url}\n        ${e.message}`;
  }
  console.log(line);
}

console.log("\nDone. Paste everything above. The ✅ line (or any HTTP 200 with real JSON) is the winner.");

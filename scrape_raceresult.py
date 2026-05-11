#!/usr/bin/env python3
"""
Scrape results from a raceresult.com event (RRPublish API) and emit JSON in
the same shape as OCRReport-all.json.

Example URL: https://my.raceresult.com/348237/

Usage:
    # See what result lists the event publishes
    python3 scrape_raceresult.py --event 348237 --list-lists

    # Pull a specific list and write JSON
    python3 scrape_raceresult.py --event 348237 \
        --list "Result Lists|Overall" --out results.json

    # Pull every list and merge by Bib (best for events split across contests)
    python3 scrape_raceresult.py --event 348237 --all --out results.json

The scraper hits the public endpoints used by the raceresult.com web widget:
    https://my.raceresult.com/<event>/RRPublish/data/config
    https://my.raceresult.com/<event>/RRPublish/data/list

Field positions in the `data/list` response depend on how the event organiser
configured each list, so this script reads the `Fields` metadata returned by
the API and maps by header name. Override the mapping with --field-map if your
event uses non-standard column titles.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
from typing import Any
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError


BASE = "https://my.raceresult.com"
USER_AGENT = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
)

# Default header -> OCRReport-all.json field mapping. Header text is
# lower-cased and stripped before lookup. Add custom mappings via --field-map.
DEFAULT_FIELD_MAP: dict[str, str] = {
    "place": "Rank",
    "rank": "Rank",
    "pos": "Rank",
    "position": "Rank",
    "bib": "Bib",
    "bib no": "Bib",
    "bib no.": "Bib",
    "bib number": "Bib",
    "no": "Bib",
    "no.": "Bib",
    "name": "Name",
    "athlete": "Name",
    "participant": "Name",
    "category": "Category",
    "type": "Category",
    "gender": "Gender",
    "sex": "Gender",
    "nation": "Nation",
    "country": "Nation",
    "nationality": "Nation",
    "age group": "AgeGroup",
    "agegroup": "AgeGroup",
    "ag": "AgeGroup",
    "distance": "Distance",
    "miles": "Distance",
    "km": "Distance",
    "laps": "Laps",
    "lap": "Laps",
    "last lap": "LastLapTime",
    "last lap time": "LastLapTime",
    "last seen": "LastSeen",
    "last seen tod": "LastSeenTOD",
    "last seen time": "LastSeenTOD",
    "tod": "LastSeenTOD",
    "total time": "TotalTime",
    "time": "TotalTime",
    "finish": "TotalTime",
    "finish time": "TotalTime",
}


def http_get_json(url: str, *, retries: int = 3, backoff: float = 1.5) -> Any:
    last_err: Exception | None = None
    for attempt in range(retries):
        req = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
        try:
            with urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            # raceresult sometimes wraps JSON with a leading semicolon or BOM
            raw = raw.lstrip("﻿;")
            return json.loads(raw)
        except (HTTPError, URLError, json.JSONDecodeError) as exc:
            last_err = exc
            if attempt < retries - 1:
                time.sleep(backoff ** attempt)
    raise RuntimeError(f"GET {url} failed: {last_err}")


def get_config(event: str) -> dict[str, Any]:
    """Fetch the publish config (key + listings) for the event."""
    url = f"{BASE}/{event}/RRPublish/data/config?" + urlencode({"page": "results", "noVisitor": "1"})
    cfg = http_get_json(url)
    if not isinstance(cfg, dict) or "key" not in cfg:
        raise RuntimeError(
            f"Unexpected config payload for event {event}. Got: {str(cfg)[:200]}"
        )
    return cfg


def list_available_lists(cfg: dict[str, Any]) -> list[str]:
    """Return the flat list of list names available on this event."""
    listings = cfg.get("lists") or cfg.get("Lists") or {}
    names: list[str] = []
    if isinstance(listings, dict):
        for group, items in listings.items():
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, str):
                        names.append(f"{group}|{item}")
                    elif isinstance(item, dict) and "Name" in item:
                        names.append(f"{group}|{item['Name']}")
            elif isinstance(items, str):
                names.append(items)
    elif isinstance(listings, list):
        names.extend(str(n) for n in listings)
    return names


def fetch_list(event: str, key: str, listname: str, *, contest: int = 0) -> dict[str, Any]:
    params = {
        "key": key,
        "listname": listname,
        "page": "results",
        "contest": str(contest),
        "r": "all",
        "l": "0",
    }
    url = f"{BASE}/{event}/RRPublish/data/list?" + urlencode(params)
    return http_get_json(url)


def build_field_index(fields: list[Any], extra_map: dict[str, str]) -> dict[int, str]:
    """Return {column_index: target_field_name} based on header labels."""
    mapping: dict[str, str] = {**DEFAULT_FIELD_MAP, **extra_map}
    out: dict[int, str] = {}
    for idx, field in enumerate(fields):
        label = ""
        if isinstance(field, dict):
            label = field.get("Label") or field.get("Caption") or field.get("Expression") or ""
        elif isinstance(field, list) and field:
            label = str(field[0])
        elif isinstance(field, str):
            label = field
        key = re.sub(r"\s+", " ", label.strip().lower())
        if key in mapping:
            out[idx] = mapping[key]
    return out


def rows_from_list(payload: dict[str, Any]) -> tuple[list[Any], list[list[Any]]]:
    """Flatten the grouped data structure returned by data/list."""
    meta = payload.get("list") or {}
    fields = meta.get("Fields") or meta.get("fields") or []
    data = payload.get("data") or {}
    rows: list[list[Any]] = []
    if isinstance(data, dict):
        for group_rows in data.values():
            if isinstance(group_rows, list):
                for row in group_rows:
                    if isinstance(row, list):
                        rows.append(row)
    elif isinstance(data, list):
        for row in data:
            if isinstance(row, list):
                rows.append(row)
    return fields, rows


def coerce(value: Any, target: str) -> Any:
    if value is None:
        return None
    if target in ("Rank", "Bib") and isinstance(value, str) and value.isdigit():
        return int(value)
    return value


def project_row(row: list[Any], index: dict[int, str]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for col, target in index.items():
        if col < len(row):
            out[target] = coerce(row[col], target)
    return out


def merge_records(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Merge per-Bib records so multiple lists contribute fields to one row."""
    by_bib: dict[Any, dict[str, Any]] = {}
    out: list[dict[str, Any]] = []
    for rec in records:
        bib = rec.get("Bib")
        if bib is None:
            out.append(rec)
            continue
        if bib in by_bib:
            for k, v in rec.items():
                if v not in (None, "") and not by_bib[bib].get(k):
                    by_bib[bib][k] = v
        else:
            by_bib[bib] = dict(rec)
    out.extend(by_bib.values())
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--event", required=True, help="Numeric event id, e.g. 348237")
    parser.add_argument("--list", dest="listname", help="List name to pull, e.g. 'Result Lists|Overall'")
    parser.add_argument("--all", action="store_true", help="Pull every available list and merge by Bib")
    parser.add_argument("--list-lists", action="store_true", help="Print available list names and exit")
    parser.add_argument("--contest", type=int, default=0, help="Contest id to filter on (default 0 = all)")
    parser.add_argument("--out", default="-", help="Output path (default stdout)")
    parser.add_argument(
        "--field-map",
        help="Path to a JSON file with extra {header: target_field} mappings",
    )
    args = parser.parse_args()

    extra_map: dict[str, str] = {}
    if args.field_map:
        with open(args.field_map, encoding="utf-8") as fh:
            extra_map = {k.lower(): v for k, v in json.load(fh).items()}

    cfg = get_config(args.event)
    key = cfg["key"]
    available = list_available_lists(cfg)

    if args.list_lists:
        for name in available:
            print(name)
        return 0

    targets: list[str]
    if args.all:
        targets = available or []
        if not targets:
            print("No lists discovered for this event.", file=sys.stderr)
            return 2
    elif args.listname:
        targets = [args.listname]
    else:
        print("Pick a list with --list, or use --all. Available lists:", file=sys.stderr)
        for name in available:
            print(f"  {name}", file=sys.stderr)
        return 2

    all_records: list[dict[str, Any]] = []
    for name in targets:
        payload = fetch_list(args.event, key, name, contest=args.contest)
        fields, rows = rows_from_list(payload)
        index = build_field_index(fields, extra_map)
        if not index:
            labels = [
                (f.get("Label") if isinstance(f, dict) else f) for f in fields
            ]
            print(
                f"warning: list {name!r} has no recognised columns. Headers: {labels}",
                file=sys.stderr,
            )
            continue
        for row in rows:
            rec = project_row(row, index)
            if rec:
                all_records.append(rec)

    if args.all:
        all_records = merge_records(all_records)

    body = json.dumps(all_records, indent=2, ensure_ascii=False)
    if args.out == "-":
        sys.stdout.write(body + "\n")
    else:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(body)
        print(f"wrote {len(all_records)} records to {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

# wtm-athlete-tracker

## Pulling results from raceresult.com

`scrape_raceresult.py` pulls athlete results from a raceresult.com event using
the same `RRPublish` JSON API that the public results widget uses, and writes
JSON in the same shape as `OCRReport-all.json`.

```bash
# 1. See what result lists the event exposes
python3 scrape_raceresult.py --event 348237 --list-lists

# 2. Pull a specific list
python3 scrape_raceresult.py --event 348237 \
    --list "Result Lists|Overall" --out results.json

# 3. Or pull every list and merge by bib number
python3 scrape_raceresult.py --event 348237 --all --out results.json
```

Run it from a host with outbound HTTPS to `my.raceresult.com`. The sandbox
this repo was bootstrapped in blocks that host (`x-deny-reason:
host_not_allowed`), so the scraper has to be executed locally rather than from
inside the agent environment.

If the event uses unusual column titles, pass `--field-map map.json` where
`map.json` is `{"Header Text": "TargetField", ...}` — target fields match the
keys already used in `OCRReport-all.json` (`Rank`, `Bib`, `Name`, `Category`,
`Gender`, `Nation`, `AgeGroup`, `Distance`, `Laps`, `LastLapTime`, `LastSeen`,
`LastSeenTOD`, `TotalTime`).

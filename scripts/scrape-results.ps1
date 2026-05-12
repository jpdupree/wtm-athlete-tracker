#!/usr/bin/env pwsh
# Scrape the RaceResult API for a World's Toughest Mudder event and emit
# tidy CSVs for use as deterministic test data.
#
# Usage:
#   pwsh scripts/scrape-results.ps1                 # default: 2025 (event 348237)
#   pwsh scripts/scrape-results.ps1 316804 2024     # arbitrary event/year pair
#
# Outputs (test/fixtures/<year>/):
#   individual_Female.csv, individual_Male.csv  — overall individual results split by gender
#   teams.csv                                   — team-chip standings (if the event has them)
#   team_members.csv                            — individuals scored on a team (if available)
#   lap_details_individual.csv                  — one row per (bib, lap) for solo + team members
#   lap_details_team.csv                        — one row per (team bib, lap) for team chips
#
# The list names and column layouts vary year over year — older events
# use "Online|Solo Results Web" and contest=0; newer ones use
# "Online|RTM Results Web" with separate solo/team contests. We pull the
# config first, find lists by name pattern, and derive the CSV column
# headers from each list's Fields metadata so r.Name / r.Country /
# r.TotalTime keep landing in predictable places downstream.

param(
    [string]$EventId = '348237',
    [string]$Year    = '2025'
)

$ErrorActionPreference = 'Stop'

$eventId = $EventId
$base    = "https://my.raceresult.com/$eventId/RRPublish/data"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$outDir   = Join-Path $repoRoot "test/fixtures/$Year"
$rawDir   = Join-Path $outDir   'raw'
New-Item -ItemType Directory -Force -Path $outDir, $rawDir | Out-Null

Write-Host "Fetching config..."
$config = Invoke-RestMethod -Uri "$base/config?page=results"
$key    = $config.key
Write-Host "  event: $($config.eventname) | key: $key"
Write-Host "  lists:"
foreach ($l in $config.lists) {
    Write-Host "    [$($l.Contest)] $($l.Name) ($($l.ShowAs))"
}

# Pick a list out of config.lists by matching any of the candidate name
# substrings. Older events use shorter names (no "RTM" prefix); newer
# ones add it. Returns $null if no candidate matches — the caller is
# expected to handle missing list types gracefully.
function Find-List {
    param([object[]]$Lists, [string[]]$NamePatterns)
    foreach ($p in $NamePatterns) {
        $match = $Lists | Where-Object { $_.Name -like "*$p*" } | Select-Object -First 1
        if ($match) { return $match }
    }
    return $null
}

function Get-ListData {
    param($List)
    $url = "$base/list?key=$key&listname=$([uri]::EscapeDataString($List.Name))&page=results&contest=$($List.Contest)&r=all&l=0"
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing
    $rawName = ($List.Name -replace '[^A-Za-z0-9]+', '-').ToLower().Trim('-') + "-contest$($List.Contest).json"
    [System.IO.File]::WriteAllText((Join-Path $rawDir $rawName), $resp.Content, [System.Text.Encoding]::UTF8)
    return $resp.Content | ConvertFrom-Json
}

function Clean-Cell {
    param($v)
    if ($null -eq $v) { return '' }
    $s = [string]$v
    if ($s -match '^\[img:/graphics/flags/([A-Z]{2})\.svg\]$') { return $Matches[1] }
    return $s
}

# Map a Fields[i] entry to a stable column name. Expression-based
# matches win first, then Label, then the bare label as a fallback.
function Map-FieldName {
    param($Field, [int]$Index)
    $expr = [string]$Field.Expression
    $label = [string]$Field.Label

    # Explicit Expression matches. Order matters: composite expressions
    # (Last Seen, projection helpers) embed standalone field references
    # inside their formulas, so we check the composite patterns FIRST
    # and anchor the standalone field matches to exact-string so we
    # don't accidentally claim them.
    switch -Regex ($expr) {
        'LastSeenName'         { return 'PointLastSeen' }
        '^AUTORANK$'           { return 'Rank' }
        '^BIB$'                { return "BibDup$Index" }  # already in prefix
        '^COUNTRY\.FLAG$'      { return 'Country' }
        '^COUNTRY\.IOCNAME$'   { return 'CountryIOC' }
        '^DisplayName$'        { return 'Name' }
        'FLNAME'               { return 'Name' }
        '^TeamDist$'           { return 'TotalDistanceMi' }
        '^TotalDistance'       { return 'TotalDistanceMi' }
        '^LastSplit$'          { return 'TimeOfDay' }
        '^TS1\.LAPTIMETEAMNUMBER$'    { return 'LapsCompleted' }
        '^TIME48$'                    { return 'LapsCompleted' }
        'LAPTIMETEAMTOTALTEXT' { return 'TotalTime' }
        '^format\(\[T1\]'      { return 'TotalTime' }
        '^AGEGROUP'            { return 'AgeGroup' }
        'AgeGroupRank'         { return 'AgeGroupRank' }
        '^format\(\[T32\]'     { return 'TimeOfDay' }
    }

    # Label-based fallbacks for fields whose expression we don't pattern-match.
    switch ($label) {
        'Rank'        { return 'Rank' }
        'Bib'         { return "BibDup$Index" }
        'Name'        { return 'Name' }
        'Nat.'        { return 'Country' }
        'Overall'     { return 'OverallPos' }
        'Gender'      { return 'GenderRank' }
        'AG'          { return 'AgeGroupRank' }
        'AgeGroup'    { return 'AgeGroup' }
        'Last Seen'   { return 'PointLastSeen' }
        '@TOD'        { return 'TimeOfDay' }
        'TOD'         { return 'TimeOfDay' }
        'Distance'    { return 'TotalDistanceMi' }
        'Laps'        { return 'LapsCompleted' }
        'Total Time'  { return 'TotalTime' }
        'Team'        { return 'Team' }
        ''            { return "Col$Index" }
    }

    # No match — sanitise the label as a last resort so it's still
    # legal as a CSV header.
    return ($label -replace '[^A-Za-z0-9]', '')
}

function Build-Headers {
    param($Resp)
    # Data rows start with [Bib, ID] as a system prefix. The Fields list
    # describes the *visible* columns that follow, but RaceResult emits
    # a Fields[1] entry with Expression="BIB" that doesn't get its own
    # data column (it's the same value as the prefix Bib). Skipping it
    # keeps the header count aligned with the actual data width.
    $headers = @('Bib', 'ID')
    $i = 0
    foreach ($f in $Resp.list.Fields) {
        if ([string]$f.Expression -eq 'BIB') { continue }
        $headers += Map-FieldName -Field $f -Index $i
        $i++
    }
    return $headers
}

function Write-Csv {
    param($Rows, [string[]]$Headers, [string]$Path)
    $records = foreach ($r in $Rows) {
        $obj = [ordered]@{}
        for ($i = 0; $i -lt $Headers.Count; $i++) {
            $obj[$Headers[$i]] = if ($i -lt $r.Count) { Clean-Cell $r[$i] } else { '' }
        }
        [pscustomobject]$obj
    }
    $records | Export-Csv -Path $Path -NoTypeInformation -Encoding UTF8
    Write-Host "  $($records.Count.ToString().PadLeft(4)) rows -> $($Path.Substring($repoRoot.Path.Length + 1))"
}

# Flatten a possibly-nested data tree into a map of {bucketName => rows[]}.
# 2022's solo results are TWO levels deep: Category ("Contender"/"Open")
# then Gender ("Female"/"Male"). We collapse to gender-only buckets so
# downstream code keeps reading individual_Female.csv / individual_Male.csv.
function Flatten-Sections {
    param($Data)
    $out = [ordered]@{}
    if ($Data -is [System.Collections.IList]) {
        $out[''] = $Data
        return $out
    }
    foreach ($prop in $Data.PSObject.Properties) {
        $rawName = $prop.Name -replace '^#\d+_', ''
        $val = $prop.Value
        if ($val -is [System.Collections.IList]) {
            if ($out.Contains($rawName)) {
                # Same bucket from a deeper level — append.
                foreach ($r in $val) { $out[$rawName] += ,$r }
            } else {
                $out[$rawName] = @($val)
            }
            continue
        }
        # Nested object — recurse and merge child buckets, dropping
        # this level's name (we don't care about Contender vs Open).
        $nested = Flatten-Sections -Data $val
        foreach ($k in $nested.Keys) {
            if ($out.Contains($k)) {
                foreach ($r in $nested[$k]) { $out[$k] += ,$r }
            } else {
                $out[$k] = @($nested[$k])
            }
        }
    }
    return $out
}

function Export-Section {
    param($Resp, [string]$BaseName, [switch]$MergeSections)
    $headers = Build-Headers -Resp $Resp
    $sections = Flatten-Sections -Data $Resp.data
    # When there's only one bucket, drop the section suffix so the
    # output file lands at the canonical BaseName.csv (e.g. teams.csv).
    if ($sections.Count -le 1) {
        $rows = if ($sections.Count -eq 1) { $sections.Values | Select-Object -First 1 } else { @() }
        Write-Csv -Rows $rows -Headers $headers -Path (Join-Path $outDir "$BaseName.csv")
        return
    }
    if ($MergeSections) {
        # Concatenate all sections (e.g. 2021's "Team of 2" + "Team of 4")
        # into a single teams.csv so downstream code doesn't care about
        # team-size categories.
        $merged = New-Object System.Collections.Generic.List[object]
        foreach ($section in $sections.Keys) {
            foreach ($r in $sections[$section]) { $merged.Add($r) | Out-Null }
        }
        Write-Csv -Rows $merged -Headers $headers -Path (Join-Path $outDir "$BaseName.csv")
        return
    }
    foreach ($section in $sections.Keys) {
        $suffix = if ($section) { "_$section" } else { '' }
        Write-Csv -Rows $sections[$section] -Headers $headers -Path (Join-Path $outDir "${BaseName}${suffix}.csv")
    }
}

# ---- summary lists ----------------------------------------------------------

$soloList = Find-List -Lists $config.lists -NamePatterns @('Solo Results', 'RTM Results Web', 'Individual Results')
$teamList = Find-List -Lists $config.lists -NamePatterns @('RTM Team Results', 'Team Results')
$teamMembersList = Find-List -Lists $config.lists -NamePatterns @('RTM Results Team Members', 'Results Team Members', 'Team Members')

if ($soloList) {
    Write-Host "`nIndividual results... ($($soloList.Name))"
    Export-Section -Resp (Get-ListData -List $soloList) -BaseName 'individual'
} else {
    Write-Host "`nNo solo list found — skipping individuals."
}

if ($teamList) {
    Write-Host "`nTeam results... ($($teamList.Name))"
    Export-Section -Resp (Get-ListData -List $teamList) -BaseName 'teams' -MergeSections
} else {
    Write-Host "`nNo team list found — skipping teams."
}

if ($teamMembersList) {
    Write-Host "`nTeam-member results... ($($teamMembersList.Name))"
    Export-Section -Resp (Get-ListData -List $teamMembersList) -BaseName 'team_members'
} else {
    Write-Host "`nNo team-members list found — skipping (older events don't publish one)."
}

# ---- lap details ------------------------------------------------------------
#
# Each row in the Lap Details payload is a flat array, padded to a fixed width:
#   [0..1]   Bib, ID
#   [2..7]   logo + 5 constant header strings ("Lap #", "Pit Time", ...)
#   [8..12]  Lap 1: LapNum, PitTime, LapTime, AthleteTotalTime, AthleteTotalDist
#            (the Total Time/Distance values are the ATHLETE-WIDE totals jammed
#             into the lap-1 row positionally; they are not lap-1 splits)
#   [13..]   Laps 2..N: 3 fields each [LapNum, PitTime, LapTime]
#   trailing empty strings as padding

function Parse-LapDetailRows {
    param($Section, $Rows, [bool]$Narrow)
    $records = New-Object System.Collections.Generic.List[object]
    foreach ($row in $Rows) {
        if ($Narrow) {
            if ($row.Count -lt 5) { continue }
            $ln = [string]$row[2]
            if ([string]::IsNullOrWhiteSpace($ln)) { continue }
            $records.Add([pscustomobject][ordered]@{
                Bib     = [string]$row[0]
                ID      = [string]$row[1]
                Section = $Section
                LapNum  = $ln.Trim()
                PitTime = ([string]$row[3]).Trim()
                LapTime = ([string]$row[4]).Trim()
            })
            continue
        }
        if ($row.Count -lt 13) { continue }
        $bib = [string]$row[0]
        $id  = [string]$row[1]
        $addLap = {
            param([string]$ln, [string]$pit, [string]$lt)
            if ([string]::IsNullOrWhiteSpace($ln)) { return }
            $records.Add([pscustomobject][ordered]@{
                Bib     = $bib
                ID      = $id
                Section = $Section
                LapNum  = $ln.Trim()
                PitTime = $pit.Trim()
                LapTime = $lt.Trim()
            })
        }
        & $addLap ([string]$row[8])  ([string]$row[9])  ([string]$row[10])
        for ($i = 13; $i + 2 -lt $row.Count; $i += 3) {
            & $addLap ([string]$row[$i]) ([string]$row[$i+1]) ([string]$row[$i+2])
        }
    }
    return $records
}

# Write lap-details rows from one response, splitting sections between
# individual / team CSVs based on section name. 2023 returns a single
# response with both groups; 2024-25 returns them on separate per-contest
# calls — either way this routes correctly.
function Export-LapDetails {
    param($Resp, [string]$IndividualPath, [string]$TeamPath)
    $rowSets = if ($Resp.data -is [System.Collections.IList]) { @{ '' = $Resp.data } } else {
        $h = @{}
        foreach ($prop in $Resp.data.PSObject.Properties) {
            $section = $prop.Name -replace '^#\d+_', ''
            $h[$section] = $prop.Value
        }
        $h
    }

    # Detect row format by sampling the first non-empty section.
    $sampleWidth = 0
    foreach ($key in $rowSets.Keys) {
        $rows = $rowSets[$key]
        if ($rows.Count -gt 0) { $sampleWidth = $rows[0].Count; break }
    }
    $narrow = $sampleWidth -gt 0 -and $sampleWidth -le 8

    $indRows = New-Object System.Collections.Generic.List[object]
    $teamRows = New-Object System.Collections.Generic.List[object]
    foreach ($section in $rowSets.Keys) {
        $parsed = Parse-LapDetailRows -Section $section -Rows $rowSets[$section] -Narrow $narrow
        if ($section -like '*Team*') {
            foreach ($r in $parsed) { $teamRows.Add($r) }
        } else {
            foreach ($r in $parsed) { $indRows.Add($r) }
        }
    }

    if ($IndividualPath) {
        $indRows | Export-Csv -Path $IndividualPath -NoTypeInformation -Encoding UTF8
        Write-Host "  $($indRows.Count.ToString().PadLeft(4)) rows -> $($IndividualPath.Substring($repoRoot.Path.Length + 1))"
    }
    if ($TeamPath -and $teamRows.Count -gt 0) {
        $teamRows | Export-Csv -Path $TeamPath -NoTypeInformation -Encoding UTF8
        Write-Host "  $($teamRows.Count.ToString().PadLeft(4)) rows -> $($TeamPath.Substring($repoRoot.Path.Length + 1))"
    }
}

# Lap Details lives on a separate listname referenced by each summary
# list's "Details" field. Pull it once per distinct (Name, Contest) pair.
# Each call's response is split into individual vs team CSVs by section
# name, so newer events (one call per contest) and older events (one
# combined response with both sections) both end up in the right files.
$indPath = Join-Path $outDir 'lap_details_individual.csv'
$teamPath = Join-Path $outDir 'lap_details_team.csv'
$lapListsSeen = @{}
foreach ($parent in @($soloList, $teamList, $teamMembersList)) {
    if (-not $parent) { continue }
    $detailsName = $parent.Details
    if (-not $detailsName) { continue }
    $contest = $parent.Contest
    $key2 = "$detailsName||$contest"
    if ($lapListsSeen.ContainsKey($key2)) { continue }
    $lapListsSeen[$key2] = $true

    Write-Host "`nLap details ($detailsName contest=$contest)..."
    $lapResp = Get-ListData -List ([pscustomobject]@{ Name = $detailsName; Contest = $contest })
    # For contests that exclusively carry team data (e.g. 2024-25's
    # contest=3), route everything to the team CSV; otherwise default
    # to the individual file and let section-name routing inside
    # Export-LapDetails fan things out.
    $parentIsTeamOnly = $parent.Name -like '*Team Results*' -and $parent.Name -notlike '*Team Members*'
    if ($parentIsTeamOnly) {
        Export-LapDetails -Resp $lapResp -IndividualPath $null -TeamPath $teamPath
    } else {
        Export-LapDetails -Resp $lapResp -IndividualPath $indPath -TeamPath $teamPath
    }
}

Write-Host "`nDone. Fixtures in: $outDir"

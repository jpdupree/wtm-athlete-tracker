#!/usr/bin/env pwsh
# Scrape the RaceResult API for event 348237 (World's Toughest Mudder 2025)
# and emit tidy CSVs under test/fixtures/ for use as deterministic test data.
#
# Outputs (test/fixtures/):
#   individual_Female.csv, individual_Male.csv  — overall individual results split by gender
#   teams.csv                                   — team-chip standings
#   team_members.csv                            — individuals scored on a team
#   lap_details_individual.csv                  — one row per (bib, lap) for solo + team members
#   lap_details_team.csv                        — one row per (team bib, lap) for team chips
#
# Raw API snapshots are also saved under test/fixtures/raw/ so downstream parsing
# can be re-tested without re-hitting the API.

$ErrorActionPreference = 'Stop'

$eventId = '348237'
$base    = "https://my.raceresult.com/$eventId/RRPublish/data"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$outDir   = Join-Path $repoRoot 'test/fixtures'
$rawDir   = Join-Path $outDir   'raw'
New-Item -ItemType Directory -Force -Path $outDir, $rawDir | Out-Null

Write-Host "Fetching config..."
$config = Invoke-RestMethod -Uri "$base/config?page=results"
$key    = $config.key
Write-Host "  event: $($config.eventname) | key: $key"

function Get-List {
    param([string]$ListName, [int]$Contest)
    $url = "$base/list?key=$key&listname=$([uri]::EscapeDataString($ListName))&page=results&contest=$Contest&r=all&l=0"
    $resp = Invoke-WebRequest -Uri $url -UseBasicParsing
    $rawName = ($ListName -replace '[^A-Za-z0-9]+', '-').ToLower().Trim('-') + "-contest$Contest.json"
    [System.IO.File]::WriteAllText((Join-Path $rawDir $rawName), $resp.Content, [System.Text.Encoding]::UTF8)
    $resp.Content | ConvertFrom-Json
}

function Clean-Cell {
    param($v)
    if ($null -eq $v) { return '' }
    $s = [string]$v
    if ($s -match '^\[img:/graphics/flags/([A-Z]{2})\.svg\]$') { return $Matches[1] }
    return $s
}

function Export-Section {
    param($Resp, [string]$BaseName, [string[]]$Headers)
    if ($Resp.data -is [System.Collections.IList]) {
        Write-Csv -Rows $Resp.data -Headers $Headers -Path (Join-Path $outDir "$BaseName.csv")
    } else {
        foreach ($prop in $Resp.data.PSObject.Properties) {
            $section = $prop.Name -replace '^#\d+_', ''
            Write-Csv -Rows $prop.Value -Headers $Headers -Path (Join-Path $outDir "${BaseName}_${section}.csv")
        }
    }
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

# ---- summary lists ----------------------------------------------------------

Write-Host "`nIndividual results..."
$ind = Get-List -ListName 'Online|RTM Results Web' -Contest 1
$indHeaders = 'Bib','ID','Rank','Country','Name','PointLastSeen','TimeOfDay','LapsCompleted','TotalDistanceMi','TotalTime','AgeGroup','AgeGroupRank'
Export-Section -Resp $ind -BaseName 'individual' -Headers $indHeaders

Write-Host "`nTeam results..."
$team = Get-List -ListName 'Online|RTM Team Results Web' -Contest 3
$teamHeaders = 'Bib','ID','Rank','Team','PointLastSeen','TimeOfDay','LapsCompleted','TotalDistanceMi','TotalTime'
Export-Section -Resp $team -BaseName 'teams' -Headers $teamHeaders

Write-Host "`nTeam-member results..."
$mem = Get-List -ListName 'Online|RTM Results Team Members Web' -Contest 3
$memHeaders = 'Bib','ID','Rank','Name','Team','PointLastSeen','TimeOfDay','LapsCompleted','TotalDistanceMi','TotalTime'
Export-Section -Resp $mem -BaseName 'team_members' -Headers $memHeaders

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

function Export-LapDetails {
    param($Resp, [string]$Path)
    $records = New-Object System.Collections.Generic.List[object]
    foreach ($prop in $Resp.data.PSObject.Properties) {
        $section = $prop.Name -replace '^#\d+_', ''
        foreach ($row in $prop.Value) {
            if ($row.Count -lt 13) { continue }
            $bib = [string]$row[0]
            $id  = [string]$row[1]

            $addLap = {
                param([string]$ln, [string]$pit, [string]$lt)
                if ([string]::IsNullOrWhiteSpace($ln)) { return }
                $records.Add([pscustomobject][ordered]@{
                    Bib     = $bib
                    ID      = $id
                    Section = $section
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
    }
    $records | Export-Csv -Path $Path -NoTypeInformation -Encoding UTF8
    Write-Host "  $($records.Count.ToString().PadLeft(4)) rows -> $($Path.Substring($repoRoot.Path.Length + 1))"
}

Write-Host "`nLap details (individuals)..."
$lapInd  = Get-List -ListName 'Online|Lap Details' -Contest 1
Export-LapDetails -Resp $lapInd -Path (Join-Path $outDir 'lap_details_individual.csv')

Write-Host "`nLap details (teams)..."
$lapTeam = Get-List -ListName 'Online|Lap Details' -Contest 3
Export-LapDetails -Resp $lapTeam -Path (Join-Path $outDir 'lap_details_team.csv')

Write-Host "`nDone. Fixtures in: $outDir"

# Copies the canonical ../shared-data JSON into proto-godot/data (res://data) and verifies hashes.
# Run from anywhere:  pwsh -NoProfile -File proto-godot\tools\sync-data.ps1
# Add -Check to verify only (exit 1 when the copies differ).
param([switch]$Check)

$ErrorActionPreference = 'Stop'
$project = Split-Path -Parent $PSScriptRoot
$source = Join-Path (Split-Path -Parent $project) 'shared-data'
$target = Join-Path $project 'data'
$names = 'turrets', 'enemies', 'maps', 'waves'

if (-not (Test-Path $source)) { throw "Canonical data not found: $source" }
if (-not $Check) { New-Item -ItemType Directory -Force -Path $target | Out-Null }

$bad = 0
foreach ($n in $names) {
    $src = Join-Path $source "$n.json"
    $dst = Join-Path $target "$n.json"
    if (-not $Check) { Copy-Item -LiteralPath $src -Destination $dst -Force }
    $same = (Test-Path $dst) -and ((Get-FileHash $src).Hash -eq (Get-FileHash $dst).Hash)
    if (-not $same) { $bad++ }
    '{0,-14} {1}' -f "$n.json", $(if ($same) { 'identical' } else { 'DIFFERENT' })
}
if ($bad -gt 0) { Write-Error "$bad file(s) differ from shared-data"; exit 1 }

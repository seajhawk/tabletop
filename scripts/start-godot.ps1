param([switch]$Editor)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$gamePath = Join-Path $projectRoot 'proto-godot'
$dataPath = Join-Path $gamePath 'data'
New-Item -ItemType Directory -Force -Path $dataPath | Out-Null
Get-ChildItem -LiteralPath (Join-Path $projectRoot 'shared-data') -Filter '*.json' | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination $dataPath -Force
}
$godotPath = Join-Path $projectRoot '.tools/godot-4.7.2/Godot_v4.7.2-stable_win64.exe'
if (-not (Test-Path -LiteralPath $godotPath)) {
    $godotCommand = Get-Command godot -ErrorAction SilentlyContinue
    if (-not $godotCommand) { throw 'Godot 4 required. See docs/TOOLCHAIN.md.' }
    $godotPath = $godotCommand.Source
}
if ($Editor) { & $godotPath --editor --path $gamePath }
else { & $godotPath --path $gamePath }

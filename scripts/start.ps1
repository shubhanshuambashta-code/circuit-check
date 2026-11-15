param([string]$KiCadCli = '', [int]$Port = 8000, [switch]$NoBrowser, [switch]$Service)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
if ($KiCadCli) { $env:KICAD_CLI = $KiCadCli }
$settingsFile = Join-Path $projectRoot 'data\runtime.json'
$settings = $null
if (Test-Path -LiteralPath $settingsFile) { $settings = Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json }
$candidates = @((Join-Path $projectRoot '.venv\Scripts\python.exe'), $settings.python, (Join-Path $projectRoot '..\..\work\venv\Scripts\python.exe'))
$runtime = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $runtime) { throw 'Python dependencies are not installed for this extracted folder. Double-click Setup CircuitCheck.cmd once, then Start CircuitCheck.cmd.' }
$arguments = @('scripts\start.py', '--port', "$Port")
if ($Service) { $arguments += '--service' }
if (-not $NoBrowser) { $arguments += '--open' }
& $runtime @arguments
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

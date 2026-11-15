$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot 'runtime-settings.ps1')
$taskConfiguration = Get-CircuitCheckConfiguration $projectRoot
$taskDataDirectory = $taskConfiguration.data_directory
$taskTempDirectory = Join-Path $taskDataDirectory 'tmp'
New-Item -ItemType Directory -Path $taskTempDirectory -Force | Out-Null
$env:TMP = $taskTempDirectory
$env:TEMP = $env:TMP
python -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Python venv creation failed.' }
& '.\.venv\Scripts\python.exe' -m pip install -r requirements.lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Python dependency installation failed.' }
npm.cmd ci --no-audit --no-fund
if ($LASTEXITCODE -ne 0) { throw 'Local checker/frontend dependency installation failed. Install Node.js 24 and run setup again.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist\index.html'))) {
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
}
Write-Output 'Setup complete. Configure KICAD_CLI in .env if needed, then run scripts\start.ps1.'

param([int]$Port = 8000, [string]$OutFile = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'runtime-settings.ps1')
$taskSettings = Get-CircuitCheckConfiguration $taskRoot
$taskDataDirectory = $taskSettings.data_directory
$taskPython = @((Join-Path $taskRoot '.venv\Scripts\python.exe'), $taskSettings.python) | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
if (-not $taskPython) { $taskPython = (Get-Command python -ErrorAction SilentlyContinue).Source }
$taskChecks = @()
$taskPythonVersion = if ($taskPython) { (& $taskPython --version 2>&1 | Out-String).Trim() } else { 'Not found' }
$taskChecks += [ordered]@{ id='python'; ready=[bool]$taskPython; detail=$taskPythonVersion; fix='Install Python 3.11 or later, then run Setup CircuitCheck.cmd.' }
$taskNode = if ($taskSettings.node) { $taskSettings.node } else { (Get-Command node -ErrorAction SilentlyContinue).Source }
$taskNodeVersion = if ($taskNode) { (& $taskNode --version 2>&1 | Out-String).Trim() } else { 'Not found' }
$taskChecks += [ordered]@{ id='node'; ready=($taskNodeVersion -match '^v(?:2[4-9]|[3-9][0-9])\.'); detail=$taskNodeVersion; fix='Install Node.js 24 and run npm ci in the CircuitCheck folder.' }
$taskCli = if ($env:KICAD_CLI) { $env:KICAD_CLI } elseif ($taskSettings.kicad_cli) { $taskSettings.kicad_cli } else { (Get-Command kicad-cli -ErrorAction SilentlyContinue).Source }
if (-not $taskCli) { $taskCli = 'C:\Program Files\KiCad\10.0\bin\kicad-cli.exe' }
$taskKiCadVersion = if (Test-Path -LiteralPath $taskCli -PathType Leaf) { (& $taskCli version 2>&1 | Out-String).Trim() } else { 'Not found' }
$taskChecks += [ordered]@{ id='kicad'; ready=($taskKiCadVersion -like '10.0.*'); detail=$taskKiCadVersion; fix='Install KiCad 10.0.x and set KICAD_CLI to the full executable path.' }
$taskHealth = $null
try { $taskHealth = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 4 } catch {}
$taskChecks += [ordered]@{ id='api'; ready=($taskHealth.status -eq 'ok'); detail=if ($taskHealth) { 'API answered' } else { 'API unavailable' }; fix='Run Start CircuitCheck.cmd. If startup fails, run Setup CircuitCheck.cmd.' }
$taskChecks += [ordered]@{ id='worker'; ready=($taskHealth.worker_available -eq $true); detail=if ($taskHealth.worker_available) { 'Worker heartbeat is current' } else { 'No live worker heartbeat' }; fix='Stop and start CircuitCheck. Inspect worker.log in the configured data directory logs folder.' }
$taskChecks += [ordered]@{ id='storage'; ready=(Test-Path -LiteralPath $taskDataDirectory -PathType Container); detail=$taskDataDirectory; fix='Set CIRCUITCHECK_DATA to a writable folder and restart the API and worker.' }
$taskReport = [ordered]@{ generated_at=(Get-Date).ToUniversalTime().ToString('o'); app_version=(Get-Content -LiteralPath (Join-Path $taskRoot 'package.json') -Raw | ConvertFrom-Json).version; checks=$taskChecks }
if (-not $OutFile) { $OutFile = Join-Path $taskDataDirectory 'diagnostics\circuitcheck-diagnostics.json' }
$taskReportFolder = Split-Path -Parent $OutFile
New-Item -ItemType Directory -Force -Path $taskReportFolder | Out-Null
$taskReport | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $OutFile -Encoding UTF8
foreach ($taskCheck in $taskChecks) { Write-Output "$($taskCheck.id): $(if ($taskCheck.ready) {'READY'} else {'NEEDS ATTENTION'}) - $($taskCheck.detail)"; if (-not $taskCheck.ready) { Write-Output "  Fix: $($taskCheck.fix)" } }
Write-Output "Diagnostic report: $OutFile"
Write-Output 'Credentials, environment values and circuit contents are excluded.'

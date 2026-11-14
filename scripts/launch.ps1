param([int]$Port = 8000, [switch]$NoBrowser, [switch]$Stop)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$url = "http://127.0.0.1:$Port"
$sha = [System.Security.Cryptography.SHA256]::Create()
try { $key = ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectRoot.ToLowerInvariant())))).Replace('-','').Substring(0,12) } finally { $sha.Dispose() }
$taskName = "CircuitCheck-$key-$Port"
if ($Stop) {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Disable-ScheduledTask -TaskName $taskName | Out-Null
        $startFile = Join-Path $PSScriptRoot 'start.py'
        $processes = @(Get-CimInstance Win32_Process)
        $owned = New-Object 'System.Collections.Generic.HashSet[int]'
        foreach ($process in $processes) {
            if ($process.Name -in @('python.exe','pythonw.exe') -and $process.CommandLine -and $process.CommandLine.IndexOf($startFile,[StringComparison]::OrdinalIgnoreCase) -ge 0 -and $process.CommandLine -match "--port\s+$Port(?:\s|$)") { [void]$owned.Add([int]$process.ProcessId) }
        }
        do {
            $added = $false
            foreach ($process in $processes) { if ($owned.Contains([int]$process.ParentProcessId) -and $owned.Add([int]$process.ProcessId)) { $added = $true } }
        } while ($added)
        Stop-ScheduledTask -TaskName $taskName
        foreach ($processId in $owned) { Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue }
        Write-Output 'CircuitCheck background server stopped. Automatic recovery is disabled until Start CircuitCheck.cmd is used.'
    }
    else { Write-Output 'No background server is registered for this folder.' }
    return
}
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask -and $existingTask.State -eq 'Disabled') { Enable-ScheduledTask -TaskName $taskName | Out-Null }
$version = (Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json).version
function Test-CircuitCheck {
    try {
        $health = Invoke-RestMethod -Uri "$url/api/health" -TimeoutSec 2
        $info = Invoke-RestMethod -Uri "$url/openapi.json" -TimeoutSec 2
        return ($health.status -eq 'ok' -and $health.deployment -eq 'local single-user' -and $info.info.title -eq 'CircuitCheck' -and $info.info.version -eq $version)
    } catch { return $false }
}
if (-not (Test-CircuitCheck)) {
    $settingsFile = Join-Path $projectRoot 'data\runtime.json'
    $runtimeSettings = if (Test-Path -LiteralPath $settingsFile) { Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json } else { $null }
    $candidates = @((Join-Path $projectRoot '.venv\Scripts\python.exe'), $runtimeSettings.python, (Join-Path $projectRoot '..\..\work\venv\Scripts\python.exe'))
    $runtime = $candidates | Where-Object { $_ -and (Test-Path -LiteralPath $_ -PathType Leaf) } | Select-Object -First 1
    if (-not $runtime) { throw 'Python dependencies are not installed. Double-click Setup CircuitCheck.cmd once.' }
    $backgroundRuntime = Join-Path (Split-Path -Parent $runtime) 'pythonw.exe'
    if (-not (Test-Path -LiteralPath $backgroundRuntime)) { throw 'Python console-free runtime is missing. Repair the Windows Python installation, then run Setup CircuitCheck.cmd.' }
    $startFile = Join-Path $PSScriptRoot 'start.py'
    $action = New-ScheduledTaskAction -Execute $backgroundRuntime -Argument "-u `"$startFile`" --service --port $Port" -WorkingDirectory $projectRoot
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
    $principal = New-ScheduledTaskPrincipal -UserId $identity -LogonType Interactive -RunLevel Limited
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    $trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(15) -RepetitionInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Settings $settings -Trigger $trigger -Description 'Local CircuitCheck API and native worker. A one-minute recovery trigger starts it again if it exits while this user is signed in. Stop CircuitCheck.cmd disables recovery; Start CircuitCheck.cmd enables it.' -Force | Out-Null
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        if (Test-CircuitCheck) { $ready = $true; break }
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
        $task = Get-ScheduledTask -TaskName $taskName
        if ($task.State -ne 'Running' -and $taskInfo.LastTaskResult -ne 267009 -and $attempt -gt 1) {
            throw "CircuitCheck startup failed (exit $($taskInfo.LastTaskResult)). Run scripts\start.ps1 to see the error; background logs are in the configured data\logs folder."
        }
        Start-Sleep -Milliseconds 500
    }
    if (-not $ready) { throw 'CircuitCheck did not become ready. Review data\logs or run scripts\start.ps1 for details.' }
}
Write-Output "CircuitCheck is ready: $url"
Write-Output 'The background server runs independently and automatically recovers within about a minute after an unexpected exit while you are signed in. Use Stop CircuitCheck.cmd to stop it and disable recovery.'
if (-not $NoBrowser) { Start-Process $url }

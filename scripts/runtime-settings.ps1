function Get-CircuitCheckConfiguration([string]$ProjectRoot) {
    $taskBootstrap = Join-Path $ProjectRoot 'data\runtime.json'
    $taskSettings = if (Test-Path -LiteralPath $taskBootstrap) { Get-Content -LiteralPath $taskBootstrap -Raw | ConvertFrom-Json } else { $null }
    $taskDotenv = @{}
    $taskEnvFile = Join-Path $ProjectRoot '.env'
    if (Test-Path -LiteralPath $taskEnvFile) {
        foreach ($taskLine in (Get-Content -LiteralPath $taskEnvFile)) {
            if ($taskLine -match '^\s*(CIRCUITCHECK_DATA|KICAD_CLI|CIRCUITCHECK_NODE)\s*=(.*)$') { $taskDotenv[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'") }
        }
    }
    return @{
        node = $(if ($env:CIRCUITCHECK_NODE) { $env:CIRCUITCHECK_NODE } else { $taskDotenv.CIRCUITCHECK_NODE })
        python = $taskSettings.python
        data_directory = $(if ($env:CIRCUITCHECK_DATA) { $env:CIRCUITCHECK_DATA } elseif ($taskDotenv.CIRCUITCHECK_DATA) { $taskDotenv.CIRCUITCHECK_DATA } elseif ($taskSettings.data_directory) { $taskSettings.data_directory } else { Join-Path $ProjectRoot 'data' })
        kicad_cli = $(if ($env:KICAD_CLI) { $env:KICAD_CLI } elseif ($taskDotenv.KICAD_CLI) { $taskDotenv.KICAD_CLI } else { $taskSettings.kicad_cli })
    }
}

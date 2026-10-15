# run-striv.ps1 -- one-shot launcher for the Striv project.
# Double-clicked via Striv.bat. Starts backend (Laravel :8001) and
# frontend (Next.js :3000), waits until both answer, then opens the browser.
#
# Usage: .\run-striv.ps1            (start everything + open browser)
#        .\run-striv.ps1 -NoBrowser (start everything, no browser)

param(
    [switch]$NoBrowser
)

$ErrorActionPreference = "SilentlyContinue"
$Root         = $PSScriptRoot
$BackendPort  = 8001
$FrontendPort = 3000
$FrontendUrl  = "http://localhost:$FrontendPort"

function Write-Line {
    param([string]$Text, [string]$Color = "Gray")
    Write-Host $Text -ForegroundColor $Color
}

function Get-PortPid {
    param([int]$Port)
    $line = netstat -ano | Select-String ":$Port\s" | Select-String "LISTENING" | Select-Object -First 1
    if ($line -match "(\d+)\s*$") { [int]$Matches[1] } else { $null }
}

function Stop-Port {
    param([int]$Port)
    # $procId, NOT $pid -- $pid is read-only in PowerShell and would make
    # taskkill target this very script.
    $procId = Get-PortPid $Port
    if ($procId -and $procId -ne $PID) {
        taskkill /PID $procId /F 2>&1 | Out-Null
        Start-Sleep -Milliseconds 500
    }
}

function Stop-StrivFrontends {
    # Booting `next dev` doesn't hold the port yet, so a port kill misses it
    # and leaves orphan duplicates. Match on CommandLine, not .Path.
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*next*"
    } | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 | Out-Null }
    Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*npm*dev*"
    } | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 | Out-Null }
}

function Wait-ForHttp {
    param([string]$Url, [int]$TimeoutSec = 60)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $r = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
            if ($r.StatusCode -ge 200 -and $r.StatusCode -lt 500) { return $true }
        } catch {
            # Not up yet (or still compiling) -- keep waiting.
        }
        Start-Sleep -Milliseconds 800
    }
    return $false
}

function Start-Backend {
    Stop-Port $BackendPort
    # workers + --no-reload: a lone php worker crashes under the dashboard's
    # parallel calls; --no-reload is required for multiple workers.
    $env:PHP_CLI_SERVER_WORKERS = "8"
    Start-Process -FilePath "php" `
        -ArgumentList "artisan", "serve", "--host=127.0.0.1", "--port=$BackendPort", "--no-reload" `
        -WorkingDirectory $Root -WindowStyle Hidden
}

function Start-Frontend {
    Stop-Port $FrontendPort
    Stop-StrivFrontends
    $feDir = Join-Path $Root "frontend"
    Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "cd /d `"$feDir`" && npm run dev > dev.log 2>&1" `
        -WindowStyle Hidden
}

function Start-QueueWorker {
    <#
      Run the Laravel queue worker.

      WHY THIS EXISTS — this was a real, silent failure, not a precaution.

      The launcher previously started only the web server and the frontend. Queued
      jobs therefore never executed: the database was found holding 50 pending
      `GenerateInsight` jobs with `attempts = 0`, meaning not one had ever been
      picked up. Finishing a workout dispatched the job, the job sat in the table
      forever, and the AI insight feature was dead in development while looking
      perfectly healthy — no errors, no failed jobs, just nothing happening.

      Draining that backlog produced 6 insights in under a second, which is what
      confirmed the worker was the only missing piece.

      `queue:work` rather than `queue:listen`: it boots the framework once and
      stays resident, where `listen` reloads the whole app for every job.
      `--tries=3` lets a genuinely flaky job retry before landing in failed_jobs.
      `--stop-when-empty` is deliberately NOT set: a worker that exits when the
      queue drains would leave the next job waiting until someone restarted it.
    #>
    $existing = Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" | Where-Object {
        $_.CommandLine -like "*queue:work*"
    }
    if ($existing) {
        Write-Line "[=] Queue worker already running (PID $($existing.ProcessId -join ','))" "DarkGray"
        return
    }

    Start-Process -FilePath "php" `
        -ArgumentList "artisan", "queue:work", "--tries=3", "--timeout=120" `
        -WorkingDirectory $Root -WindowStyle Hidden

    Start-Sleep -Seconds 2

    $procId = (Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" | Where-Object {
        $_.CommandLine -like "*queue:work*"
    }).ProcessId

    if ($procId) {
        Write-Line "    Queue    OK   worker PID $procId" "Green"
    } else {
        Write-Line "    Queue    FAIL (queued jobs will not run)" "Red"
    }
}

function Stop-QueueWorker {
    # Matched on command line, not on a port: a worker listens on nothing, so the
    # port-based Stop-Port helper cannot see it and would leave an orphan.
    Get-CimInstance Win32_Process -Filter "Name = 'php.exe'" | Where-Object {
        $_.CommandLine -like "*queue:work*"
    } | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 | Out-Null }
}

# ---------------------------------------------------------------------------

Write-Host ""
Write-Line "==========================================" "Cyan"
Write-Line "            Striv -- Launcher             " "Cyan"
Write-Line "==========================================" "Cyan"
Write-Host ""

# Sanity check the tools we need.
if (-not (Get-Command php -ErrorAction SilentlyContinue)) {
    Write-Line "[X] PHP not found on PATH. Install PHP 8.3+ first." "Red"
    Read-Host "Press Enter to close"
    exit 1
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
    Write-Line "[X] npm not found on PATH. Install Node.js first." "Red"
    Read-Host "Press Enter to close"
    exit 1
}

$beWas = Get-PortPid $BackendPort
$feWas = Get-PortPid $FrontendPort

# --- backend ---------------------------------------------------------------
if ($beWas) {
    Write-Line "[=] Backend already running on :$BackendPort (PID $beWas)" "DarkGray"
} else {
    Write-Line "[>] Starting backend (Laravel) on :$BackendPort ..." "Yellow"
    Start-Backend
}

# --- frontend --------------------------------------------------------------
if ($feWas) {
    Write-Line "[=] Frontend already running on :$FrontendPort (PID $feWas)" "DarkGray"
} else {
    Write-Line "[>] Starting frontend (Next.js) on :$FrontendPort ..." "Yellow"
    Start-Frontend
}

# --- queue worker ----------------------------------------------------------
# Started unconditionally rather than only when the backend was just booted:
# the worker is a separate process, so a backend that was already running does
# not imply a worker is. Without it, dispatched jobs accumulate unprocessed —
# see the comment on Start-QueueWorker for the failure this caused.
Write-Line "[>] Starting queue worker ..." "Yellow"
Start-QueueWorker

# --- wait for readiness ----------------------------------------------------
Write-Host ""
Write-Line "[.] Waiting for backend ..." "Yellow"
$beUp = Wait-ForHttp "http://127.0.0.1:$BackendPort" 60
if ($beUp) { Write-Line "    Backend  OK   http://127.0.0.1:$BackendPort" "Green" }
else       { Write-Line "    Backend  FAIL (see storage/logs/laravel.log)" "Red" }

Write-Line "[.] Waiting for frontend (first compile can take a bit) ..." "Yellow"
$feUp = Wait-ForHttp $FrontendUrl 120
if ($feUp) { Write-Line "    Frontend OK   $FrontendUrl" "Green" }
else       { Write-Line "    Frontend FAIL (see frontend/dev.log)" "Red" }

# --- open the browser ------------------------------------------------------
Write-Host ""
if ($feUp) {
    Write-Line "Striv is up." "Cyan"
    if (-not $NoBrowser) {
        Write-Line "[>] Opening browser ..." "Yellow"
        Start-Process $FrontendUrl
    }
    Write-Line "Local: $FrontendUrl" "Cyan"
    Write-Line "Stop it any time with:  .\dev.ps1 stop   (or close this window and run Stop Striv.bat)" "DarkGray"
} else {
    if ($beUp) {
        Write-Line "Backend is up but frontend did not answer yet." "Red"
        Write-Line "Try opening $FrontendUrl manually in a few seconds." "Yellow"
    } else {
        Write-Line "Startup failed. Check the logs mentioned above." "Red"
    }
}

Write-Host ""
Write-Line "This window can stay open. Press Enter to close it." "DarkGray"
Read-Host | Out-Null

# start.ps1
# Usage: ./start.ps1 up|down|restart|logs|watch [--force]
#   up/down/restart/logs — docker-compose lifecycle
#   watch               — dev watchdog: revives backend (8001) + frontend (3000)
param(
    [string]$Action = "up",
    [switch]$Force
)

# NOTE: use $procId everywhere — $pid is a read-only automatic variable in
# PowerShell; assigning it fails silently and taskkill would target the
# script itself (this bug previously made the watcher kill its own process).
function Stop-Process-On-Port {
    param([int]$Port)
    $line = netstat -ano | findstr ":$Port " | findstr "LISTENING"
    if ($line) {
        $procId = ($line -split '\s+')[-1]
        if ($procId -match '^\d+$' -and [int]$procId -ne $PID) {
            Write-Host "Killing process $procId on port $Port"
            taskkill /PID $procId /F 2>&1 | Out-Null
        }
    }
}

function Start-Backend {
    # PHP_CLI_SERVER_WORKERS + --no-reload: parallel API requests (dashboard
    # fires 4+) crash a lone single worker.
    $env:PHP_CLI_SERVER_WORKERS = "8"
    Start-Process -FilePath "php" -ArgumentList "artisan","serve","--host=127.0.0.1","--port=8001","--no-reload" -WorkingDirectory "C:\Users\raso8\Striv" -WindowStyle Hidden
}

function Stop-Frontend-Instances {
    # Kill ALL Striv frontend instances (not just the port holder) — a
    # booting `next dev` does not hold the port yet, so port-based kills
    # miss it and leave orphan duplicates (user hit one on :3002 once).
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*next*"
    } | ForEach-Object {
        Write-Host "Killing Striv frontend node PID $($_.ProcessId)"
        taskkill /PID $_.ProcessId /F 2>&1 | Out-Null
    }
    # cmd.exe wrappers that may be launching npm run dev
    Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*npm*dev*"
    } | ForEach-Object {
        taskkill /PID $_.ProcessId /F 2>&1 | Out-Null
    }
}

function Start-Frontend {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\raso8\Striv\frontend && npm run dev > dev.log 2>&1" -WindowStyle Hidden
}

function Watch-Dev {
    # Dev watchdog: every 10s, revive whichever server died. Backend must
    # match dev.ps1 (port 8001, workers=8). Frontend runs in DEV mode on a
    # locked port 3000 (package.json -p 3000) — never `next start`: a
    # production build overwrites the shared .next folder and wipes dev
    # chunks -> 404s + client-side errors. Frontend kills are instance-based
    # (see Stop-Frontend-Instances) to prevent orphan duplicates on :3002.
    while ($true) {
        $backend = netstat -ano | findstr ":8001 " | findstr "LISTENING"
        $frontend = netstat -ano | findstr ":3000 " | findstr "LISTENING"

        if (-not $backend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Backend down. Restarting..."
            Stop-Process-On-Port 8001
            Start-Backend
        }
        if (-not $frontend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Frontend down. Restarting..."
            Stop-Frontend-Instances
            Start-Frontend
        }
        Start-Sleep -Seconds 10
    }
}

if ($Force) {
    Stop-Process-On-Port 8001
    Stop-Process-On-Port 3000
    Start-Sleep -Seconds 2
}

switch ($Action) {
    "up" {
        docker-compose up -d
        docker-compose exec -d app php artisan migrate --force
        Write-Host "Striv running."
    }
    "down" { docker-compose down }
    "restart" { docker-compose restart }
    "logs" { docker-compose logs -f }
    "watch" {
        # Single-instance guard: a previous watcher (manual + Task Scheduler)
        # must not run concurrently — racing watchers spawn duplicate
        # frontends (user hit an orphan on :3002 caused by this exact race).
        $existing = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
            Where-Object { $_.ProcessId -ne $PID -and $_.CommandLine -like "*start.ps1*watch*" }
        if ($existing) {
            Write-Host "Another watcher is already running (PID $($existing.ProcessId -join ', ')). Exiting."
            exit 0
        }
        Watch-Dev
    }
    default { Write-Host "Usage: ./start.ps1 up|down|restart|logs|watch [--force]" }
}

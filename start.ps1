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

function Start-Frontend {
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\raso8\Striv\frontend && npm run dev > dev.log 2>&1" -WindowStyle Hidden
}

function Watch-Dev {
    # Dev watchdog: every 10s, revive whichever server died. Backend must
    # match dev.ps1 (port 8001, workers=8). Frontend must run in DEV mode
    # (`npm run dev`) — never `next start`: a production build overwrites the
    # shared .next folder and wipes dev chunks -> 404s + client-side errors.
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
            Stop-Process-On-Port 3000
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
    "watch" { Watch-Dev }
    default { Write-Host "Usage: ./start.ps1 up|down|restart|logs|watch [--force]" }
}

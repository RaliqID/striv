# start.ps1
# Usage: ./start.ps1 up|down|restart|logs|watch [--force]
param(
    [string]$Action = "up",
    [switch]$Force
)

function Stop-Process-On-Port {
    param([int]$Port)
    $proc = netstat -ano | findstr ":$Port " | findstr "LISTENING"
    if ($proc) {
        $pid = ($proc -split '\s+')[-1]
        if ($pid -match '^\d+$') {
            Write-Host "Killing process $pid on port $Port"
            taskkill /PID $pid /F 2>&1 | Out-Null
        }
    }
}

function Watch-Dev {
    # NOTE: Backend must match dev.ps1 / frontend/.env.local (port 8001).
    # Frontend must run in DEV mode (`npm run dev`) — never `next start`.
    # Running `next build`/`next start` while `next dev` is live overwrites
    # the shared .next folder and wipes dev chunks -> client-side 404s and
    # "Application error: a client-side exception has occurred" on navigation.
    while ($true) {
        $backend = netstat -ano | findstr ":8001 " | findstr "LISTENING"
        $frontend = netstat -ano | findstr ":3000 " | findstr "LISTENING"

        if (-not $backend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Backend down. Restarting..."
            Stop-Process-On-Port 8001
            Start-Process -FilePath "php" -ArgumentList "artisan","serve","--host=127.0.0.1","--port=8001" -WorkingDirectory "C:\Users\raso8\Striv" -WindowStyle Hidden
        }
        if (-not $frontend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Frontend down. Restarting..."
            Stop-Process-On-Port 3000
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\raso8\Striv\frontend && npm run dev > dev.log 2>&1" -WindowStyle Hidden
        }
        Start-Sleep -Seconds 5
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
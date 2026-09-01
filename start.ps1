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
    while ($true) {
        $backend = netstat -ano | findstr ":8000 " | findstr "LISTENING"
        $frontend = netstat -ano | findstr ":3000 " | findstr "LISTENING"

        if (-not $backend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Backend down. Restarting..."
            Stop-Process-On-Port 8000
            Start-Process -FilePath "php" -ArgumentList "artisan","serve","--host=127.0.0.1","--port=8000" -WorkingDirectory "C:\Users\raso8\Striv" -WindowStyle Hidden
        }
        if (-not $frontend) {
            Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Frontend down. Restarting..."
            Stop-Process-On-Port 3000
            Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d C:\Users\raso8\Striv\frontend && npx next start -p 3000" -WindowStyle Hidden
        }
        Start-Sleep -Seconds 5
    }
}

if ($Force) {
    Stop-Process-On-Port 8000
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
# Striv dev manager
# Usage: .\dev.ps1 start|stop|restart|status
param([Parameter(Position=0)][string]$Action = "status")

$ErrorActionPreference = "SilentlyContinue"
$BackendPort = 8001
$FrontendPort = 3000
$Root = $PSScriptRoot

function Get-PortPid($port) {
    $line = netstat -ano | Select-String ":$port\s" | Select-String "LISTENING" | Select-Object -First 1
    if ($line -match "(\d+)\s*$") { [int]$Matches[1] } else { $null }
}

function Stop-Port($port) {
    # NOTE: use $procId — $pid is a read-only automatic variable in PowerShell;
    # assigning it fails silently and taskkill would target the script itself.
    $procId = Get-PortPid $port
    if ($procId -and $procId -ne $PID) {
        Write-Host "[dev] killing PID $procId on port $port" -ForegroundColor Yellow
        taskkill /PID $procId /F | Out-Null
        Start-Sleep -Milliseconds 500
    }
}

function Start-Backend {
    Stop-Port $BackendPort
    # PHP_CLI_SERVER_WORKERS + --no-reload: php artisan serve is single-worker
    # by default; parallel API requests (dashboard fires 4+) crash a lone worker.
    # Env var inherits to the child process; --no-reload is required for workers.
    $env:PHP_CLI_SERVER_WORKERS = "8"
    Start-Process -FilePath "php" -ArgumentList "artisan","serve","--host=127.0.0.1","--port=$BackendPort","--no-reload" -WorkingDirectory $Root -WindowStyle Hidden
    Start-Sleep -Seconds 3
    $procId = Get-PortPid $BackendPort
    if ($procId) {
        Write-Host "[dev] backend  OK  http://localhost:$BackendPort (PID $procId, workers=8)" -ForegroundColor Green
    } else {
        Write-Host "[dev] backend  FAIL (check logs: storage/logs/laravel.log)" -ForegroundColor Red
    }
}

function Stop-StrivFrontends {
    # Kill every Striv frontend instance — booting `next dev` doesn't hold the
    # port yet, so port-based kills miss it and leave orphans on :3001/:3002.
    # NOTE: match CommandLine, not .Path (node.exe lives in Program Files).
    Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*next*"
    } | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 | Out-Null }
    Get-CimInstance Win32_Process -Filter "Name = 'cmd.exe'" | Where-Object {
        $_.CommandLine -like "*Striv*frontend*" -and $_.CommandLine -like "*npm*dev*"
    } | ForEach-Object { taskkill /PID $_.ProcessId /F 2>&1 | Out-Null }
}

function Start-Frontend {
    Stop-Port $FrontendPort
    Stop-StrivFrontends
    $feDir = Join-Path $Root "frontend"
    Start-Process -FilePath "cmd.exe" -ArgumentList "/c","cd /d `"$feDir`" && npm run dev > dev.log 2>&1" -WindowStyle Hidden
    Start-Sleep -Seconds 8
    $procId = Get-PortPid $FrontendPort
    if ($procId) {
        Write-Host "[dev] frontend OK  http://localhost:$FrontendPort (PID $procId)" -ForegroundColor Green
    } else {
        Write-Host "[dev] frontend FAIL (check frontend/dev.log)" -ForegroundColor Red
    }
}

switch ($Action) {
    "start" {
        Write-Host "[dev] starting Striv..." -ForegroundColor Cyan
        Start-Backend
        Start-Frontend
        Write-Host "[dev] done. Local: http://localhost:$FrontendPort" -ForegroundColor Cyan
    }
    "stop" {
        Write-Host "[dev] stopping..." -ForegroundColor Cyan
        # Close the tunnel first: it holds a public URL that would dangle if the
        # app behind it stopped serving.
        & (Join-Path $Root "share.ps1") stop
        Stop-Port $BackendPort
        Stop-Port $FrontendPort
        Stop-StrivFrontends
        Write-Host "[dev] stopped." -ForegroundColor Cyan
    }
    "restart" {
        & "$PSCommandPath" stop
        Start-Sleep -Seconds 1
        & "$PSCommandPath" start
    }
    "share" {
        <#
          Start the app AND the public tunnel, then restart the frontend so it
          boots with the same-origin API setting the tunnel needs (Next only
          reads NEXT_PUBLIC_* at startup, so the order matters).
        #>
        Write-Host "[dev] starting Striv for sharing..." -ForegroundColor Cyan
        Start-Backend
        Start-Frontend

        & (Join-Path $Root "share.ps1") start
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[dev] tunnel failed to start." -ForegroundColor Red
            exit 1
        }

        # Reboot the frontend so it picks up NEXT_PUBLIC_API_URL=/api/v1.
        Write-Host "[dev] restarting frontend to apply share mode..." -ForegroundColor DarkGray
        Stop-Port $FrontendPort
        Stop-StrivFrontends
        Start-Sleep -Seconds 1
        Start-Frontend
    }
    "status" {
        $bp = Get-PortPid $BackendPort
        $fp = Get-PortPid $FrontendPort
        Write-Host "backend  :$(if ($bp) { " RUNNING (PID $bp)" } else { " stopped" })"
        Write-Host "frontend :$(if ($fp) { " RUNNING (PID $fp)" } else { " stopped" })"
        & (Join-Path $Root "share.ps1") status
    }
    default {
        Write-Host "Usage: .\dev.ps1 start | stop | restart | status | share"
        Write-Host "  start    run backend + frontend locally"
        Write-Host "  share    run everything and expose a public HTTPS URL"
    }
}

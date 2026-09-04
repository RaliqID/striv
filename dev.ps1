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

function Start-Frontend {
    Stop-Port $FrontendPort
    # kill leftover node processes from previous runs
    Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Striv*" } | Stop-Process -Force
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
        Write-Host "[dev] done." -ForegroundColor Cyan
    }
    "stop" {
        Write-Host "[dev] stopping..." -ForegroundColor Cyan
        Stop-Port $BackendPort
        Stop-Port $FrontendPort
        Get-Process -Name node -ErrorAction SilentlyContinue | Where-Object { $_.Path -like "*Striv*" } | Stop-Process -Force
        Write-Host "[dev] stopped." -ForegroundColor Cyan
    }
    "restart" {
        & "$PSCommandPath" stop
        Start-Sleep -Seconds 1
        & "$PSCommandPath" start
    }
    "status" {
        $bp = Get-PortPid $BackendPort
        $fp = Get-PortPid $FrontendPort
        Write-Host "backend  :$(if ($bp) { " RUNNING (PID $bp)" } else { " stopped" })"
        Write-Host "frontend :$(if ($fp) { " RUNNING (PID $fp)" } else { " stopped" })"
    }
    default {
        Write-Host "Usage: .\dev.ps1 start|stop|restart|status"
    }
}

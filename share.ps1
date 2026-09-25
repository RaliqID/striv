# Striv share tunnel
#
# Exposes the locally running Striv app on a public HTTPS URL so someone else
# can open it. Two things make this work with a single tunnel:
#
#   1. next.config.js proxies /api/* to the Laravel backend, so the browser only
#      ever talks to one origin.
#   2. The frontend is pointed at the relative "/api/v1" path, so API requests
#      resolve against whatever host the tunnel hands out instead of
#      localhost:8001 (which would only work on this machine).
#
# Usage:
#   .\share.ps1 start    start the tunnel and print the public URL
#   .\share.ps1 stop     close the tunnel and restore local settings
#   .\share.ps1 status   show whether the tunnel is up and the current URL

param([Parameter(Position = 0)][string]$Action = "status")

$ErrorActionPreference = "SilentlyContinue"
$Root = $PSScriptRoot
$FrontendDir = Join-Path $Root "frontend"
$EnvFile = Join-Path $FrontendDir ".env.local"
$EnvBackup = Join-Path $FrontendDir ".env.local.local-backup"
$TunnelLog = Join-Path $Root "storage\logs\tunnel.log"
$TunnelErr = Join-Path $Root "storage\logs\tunnel.err.log"
$UrlFile = Join-Path $Root "storage\logs\tunnel-url.txt"
$Cloudflared = "C:\Program Files (x86)\cloudflared\cloudflared.exe"

function Get-TunnelPid {
    Get-CimInstance Win32_Process -Filter "Name = 'cloudflared.exe'" |
        Where-Object { $_.CommandLine -like "*localhost:3000*" } |
        Select-Object -First 1 -ExpandProperty ProcessId
}

function Set-SameOriginApi {
    # Point the app at the tunnel origin (relative path) so API calls follow the
    # public host. Backs up the original so stop/restart is lossless.
    if (-not (Test-Path $EnvBackup)) {
        Copy-Item -LiteralPath $EnvFile -Destination $EnvBackup -Force
        Write-Host "[share] backed up .env.local" -ForegroundColor DarkGray
    }

    # Preserve everything except NEXT_PUBLIC_API_URL, which is set to the
    # relative path. The OIDC token line and any other settings are kept.
    $lines = Get-Content -LiteralPath $EnvFile | Where-Object { $_ -notmatch '^NEXT_PUBLIC_API_URL=' }
    $out = @("# Striv share mode: relative API path, proxied by Next to the backend.") +
           @("NEXT_PUBLIC_API_URL=/api/v1") + $lines
    Set-Content -LiteralPath $EnvFile -Value $out -Encoding utf8
}

function Restore-LocalApi {
    if (Test-Path $EnvBackup) {
        Copy-Item -LiteralPath $EnvBackup -Destination $EnvFile -Force
        Remove-Item -LiteralPath $EnvBackup -Force
        Write-Host "[share] restored local .env.local" -ForegroundColor DarkGray
    }
}

function Stop-Tunnel {
    $procId = Get-TunnelPid
    if ($procId) {
        taskkill /PID $procId /F 2>&1 | Out-Null
        Write-Host "[share] tunnel closed" -ForegroundColor Yellow
    }
    Remove-Item -LiteralPath $UrlFile -Force
}

function Show-Status {
    $procId = Get-TunnelPid
    if (-not $procId) {
        Write-Host "tunnel   : stopped"
        return
    }
    if (Test-Path $UrlFile) {
        Write-Host "tunnel   : RUNNING (PID $procId)" -ForegroundColor Green
        Write-Host "public   : $((Get-Content -LiteralPath $UrlFile -Raw).Trim())" -ForegroundColor Cyan
    } else {
        Write-Host "[share] tunnel process is up but no URL recorded yet" -ForegroundColor Yellow
    }
}

switch ($Action) {
    "start" {
        Write-Host "[share] preparing..." -ForegroundColor Cyan

        if (-not (Test-Path $Cloudflared)) {
            Write-Host "[share] cloudflared not found at $Cloudflared" -ForegroundColor Red
            exit 1
        }

        # Both services must already be running; the tunnel only forwards.
        $frontendUp = netstat -ano | Select-String ":3000\s" | Select-String "LISTENING"
        $backendUp = netstat -ano | Select-String ":8001\s" | Select-String "LISTENING"
        if (-not $frontendUp -or -not $backendUp) {
            Write-Host "[share] services are not running. Start them first:" -ForegroundColor Red
            Write-Host "        .\dev.ps1 start" -ForegroundColor Yellow
            exit 1
        }

        Stop-Tunnel | Out-Null
        Set-SameOriginApi
        Remove-Item -LiteralPath $TunnelLog -Force
        Remove-Item -LiteralPath $TunnelErr -Force

        # Quick tunnel: no account needed, random *.trycloudflare.com hostname.
        Start-Process -FilePath $Cloudflared `
            -ArgumentList "tunnel", "--no-autoupdate", "--url", "http://localhost:3000" `
            -RedirectStandardOutput $TunnelLog -RedirectStandardError $TunnelErr `
            -WindowStyle Hidden

        Write-Host "[share] waiting for public URL..." -ForegroundColor DarkGray
        $url = $null
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            $match = Select-String -Path $TunnelErr, $TunnelLog -Pattern "https://[a-z0-9-]+\.trycloudflare\.com" -ErrorAction SilentlyContinue |
                Select-Object -First 1
            if ($match -and $match.Matches.Count -gt 0) {
                $url = $match.Matches[0].Value
                break
            }
        }

        if (-not $url) {
            Write-Host "[share] could not detect a URL. Check storage\logs\tunnel.err.log" -ForegroundColor Red
            exit 1
        }

        Set-Content -LiteralPath $UrlFile -Value $url -Encoding utf8

        Write-Host ""
        Write-Host "  Share this URL with your friend:" -ForegroundColor Cyan
        Write-Host "  $url" -ForegroundColor Green
        Write-Host ""
        Write-Host "  The API now runs in same-origin mode. Restart the frontend" -ForegroundColor DarkGray
        Write-Host "  once so it picks up the new NEXT_PUBLIC_API_URL:" -ForegroundColor DarkGray
        Write-Host "      .\dev.ps1 restart" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "  Stop sharing with:  .\share.ps1 stop" -ForegroundColor DarkGray
    }
    "stop" {
        Stop-Tunnel
        Restore-LocalApi
        Write-Host "[share] run .\dev.ps1 restart to return to local API calls" -ForegroundColor DarkGray
    }
    "status" {
        Show-Status
    }
    default {
        Write-Host 'Usage: .\share.ps1 start | stop | status'
    }
}

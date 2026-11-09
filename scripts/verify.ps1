# Striv - Master Verification Gate
# Returns Exit Code 0 if and only if all checks pass.

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

Write-Host "=== STRIV MASTER VERIFICATION GATE ===" -ForegroundColor Cyan

# 1. Composer validation
Write-Host "`n[1/5] Validating composer.json..." -ForegroundColor Yellow
& composer validate --no-check-publish --strict
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Composer validation failed." -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] composer.json is valid." -ForegroundColor Green

# 2. Backend Laravel test suite
Write-Host "`n[2/5] Running Backend Test Suite (php artisan test)..." -ForegroundColor Yellow
& php artisan test
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] PHP tests failed." -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Backend tests passed." -ForegroundColor Green

# 3. Dockerignore checks
Write-Host "`n[3/5] Verifying .dockerignore files..." -ForegroundColor Yellow
$rootDockerignore = Join-Path $Root ".dockerignore"
$frontendDockerignore = Join-Path $Root "frontend\.dockerignore"

if (-not (Test-Path $rootDockerignore)) {
    Write-Host "[FAIL] Root .dockerignore missing: $rootDockerignore" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $frontendDockerignore)) {
    Write-Host "[FAIL] Frontend .dockerignore missing: $frontendDockerignore" -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] .dockerignore exists in root and frontend." -ForegroundColor Green

# 4. Frontend Typecheck and Build
Write-Host "`n[4/5] Running Frontend Typecheck & Build..." -ForegroundColor Yellow
$FrontendDir = Join-Path $Root "frontend"
Set-Location $FrontendDir

Write-Host "  -> Running npm run typecheck..." -ForegroundColor Gray
& npm run typecheck
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Frontend typecheck failed." -ForegroundColor Red
    Set-Location $Root
    exit 1
}

Write-Host "  -> Running npm run build..." -ForegroundColor Gray
& npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "[FAIL] Frontend build failed." -ForegroundColor Red
    Set-Location $Root
    exit 1
}
Set-Location $Root
Write-Host "[PASS] Frontend typecheck and build succeeded." -ForegroundColor Green

# 5. Sanity Config: Sanctum Expiration
Write-Host "`n[5/5] Checking config sanity (Sanctum expiration)..." -ForegroundColor Yellow
$sanctumExp = & php -r "require 'vendor/autoload.php'; `$app = require_once 'bootstrap/app.php'; `$kernel = `$app->make(Illuminate\Contracts\Console\Kernel::class); `$kernel->bootstrap(); `$exp = config('sanctum.expiration'); if (`$exp === null) { exit(1); } echo `$exp; exit(0);"
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($sanctumExp)) {
    Write-Host "[FAIL] config('sanctum.expiration') is null or invalid." -ForegroundColor Red
    exit 1
}
Write-Host "[PASS] Sanctum expiration is configured ($sanctumExp minutes)." -ForegroundColor Green

Write-Host "`n=== ALL VERIFICATION CHECKS PASSED (EXIT CODE 0) ===" -ForegroundColor Green
exit 0

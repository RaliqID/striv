# Build the Striv Android app.
#
# Wraps gradlew with the environment it needs, because two non-obvious things
# must both be right or the build fails with a misleading message:
#
#   1. JAVA_HOME must point at JDK 21 (or 17), NOT the JDK 25 that Android
#      Studio ships. Gradle 8.14.3 cannot compile build scripts on Java 25 and
#      reports "Unsupported class file major version 69" (69 = Java 25), which
#      says nothing about the actual cause.
#   2. ANDROID_HOME must point at the SDK.
#
# Usage:
#   .\build.ps1                # debug APK (default)
#   .\build.ps1 release        # release bundle (.aab) for Play Store
#   .\build.ps1 apk            # release APK for sideloading
#   .\build.ps1 clean          # clean build outputs

param([Parameter(Position = 0)][string]$Task = "debug")

$ErrorActionPreference = "Stop"
$AndroidDir = $PSScriptRoot

function Find-JdkDir {
    <#
      Locate a JDK Gradle can run on: 17 or 21, never 25+.
      Searched by version rather than hard-coded, so a JDK patch update does not
      break the script.
    #>
    $roots = @(
        "C:\Program Files\Microsoft",
        "C:\Program Files\Eclipse Adoptium",
        "C:\Program Files\Java",
        "C:\Program Files\Android\Android Studio\jbr"
    )

    foreach ($root in $roots) {
        $dirs = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -match "jdk-(17|21)" -or $_.Name -eq "jbr" }
        foreach ($dir in $dirs) {
            $java = Join-Path $dir.FullName "bin\java.exe"
            if (-not (Test-Path $java)) { continue }

            # Read the major version and reject anything Gradle cannot use.
            #
            # `java -version` writes to stderr by design, and with
            # $ErrorActionPreference = 'Stop' PowerShell treats that as a fatal
            # error. Redirecting inside cmd and relaxing the preference for this
            # one call keeps the script strict everywhere else.
            $previousPreference = $ErrorActionPreference
            $ErrorActionPreference = "Continue"
            $versionOutput = & cmd /c "`"$java`" -version 2>&1" | Out-String
            $ErrorActionPreference = $previousPreference

            if ($versionOutput -match '"(\d+)') {
                $major = [int]$Matches[1]
                if ($major -eq 17 -or $major -eq 21) {
                    return $dir.FullName
                }
            }
        }
    }

    return $null
}

function Find-AndroidSdk {
    $candidates = @(
        $env:ANDROID_HOME,
        $env:ANDROID_SDK_ROOT,
        "$env:LOCALAPPDATA\Android\Sdk",
        "C:\Android\Sdk"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path $candidate)) { return $candidate }
    }
    return $null
}

$jdk = Find-JdkDir
if (-not $jdk) {
    Write-Host "[android] No JDK 17 or 21 found." -ForegroundColor Red
    Write-Host "          Gradle cannot run on Java 25+ (which is what Android Studio ships)." -ForegroundColor Yellow
    Write-Host "          Install one:  winget install Microsoft.OpenJDK.21" -ForegroundColor Yellow
    exit 1
}

$sdk = Find-AndroidSdk
if (-not $sdk) {
    Write-Host "[android] Android SDK not found. Set ANDROID_HOME or install via Android Studio." -ForegroundColor Red
    exit 1
}

$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk

Write-Host "[android] JAVA_HOME    = $jdk" -ForegroundColor DarkGray
Write-Host "[android] ANDROID_HOME = $sdk" -ForegroundColor DarkGray

# Sync web assets first: without this the APK keeps whatever frontend build was
# current the last time it was synced, which reads as "my change did nothing".
Write-Host "[android] syncing web assets..." -ForegroundColor Cyan
Push-Location (Join-Path $AndroidDir "..")
& npx cap sync android
$syncExit = $LASTEXITCODE
Pop-Location
if ($syncExit -ne 0) {
    Write-Host "[android] cap sync failed" -ForegroundColor Red
    exit $syncExit
}

$gradleTask = switch ($Task) {
    "debug"   { "assembleDebug" }
    "apk"     { "assembleRelease" }
    "release" { "bundleRelease" }
    "clean"   { "clean" }
    default {
        Write-Host "Usage: .\build.ps1 [debug|apk|release|clean]" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host "[android] running :$gradleTask" -ForegroundColor Cyan
Push-Location $AndroidDir
& .\gradlew.bat $gradleTask --console=plain
$exit = $LASTEXITCODE
Pop-Location

if ($exit -ne 0) {
    Write-Host "[android] build failed (exit $exit)" -ForegroundColor Red
    exit $exit
}

Write-Host ""
Write-Host "[android] build succeeded." -ForegroundColor Green

switch ($Task) {
    "debug" {
        $apk = Join-Path $AndroidDir "app\build\outputs\apk\debug\app-debug.apk"
        if (Test-Path $apk) {
            $mb = [math]::Round((Get-Item $apk).Length / 1MB, 2)
            Write-Host "  APK: $apk ($mb MB)" -ForegroundColor Green
            Write-Host "  Install on a connected device: adb install -r `"$apk`"" -ForegroundColor DarkGray
        }
    }
    "release" {
        $aab = Join-Path $AndroidDir "app\build\outputs\bundle\release\app-release.aab"
        if (Test-Path $aab) {
            $mb = [math]::Round((Get-Item $aab).Length / 1MB, 2)
            Write-Host "  Bundle: $aab ($mb MB)" -ForegroundColor Green
            Write-Host "  Upload this to Play Console." -ForegroundColor DarkGray
        }
    }
}

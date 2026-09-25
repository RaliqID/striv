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

$frontendDir = Join-Path $AndroidDir ".."

# Inject the default server address into the bundled launcher.
#
# capacitor-shell/index.html starts with a __STRIV_DEFAULT_URL__ placeholder.
# Substituting it here is what keeps a baked-in address out of the source: a dev
# build leaves it blank so the app prompts (and therefore never goes stale when
# a tunnel restarts), while a release build with CAPACITOR_SERVER_URL set goes
# straight to production with no prompt.
#
# The edit is reverted after the build so the repo file keeps its placeholder.
$shellFile = Join-Path $frontendDir "capacitor-shell\index.html"
$shellOriginal = Get-Content -LiteralPath $shellFile -Raw

# $env:X is $null when unset, so coerce before trimming — calling .Trim() on
# $null is a terminating error under $ErrorActionPreference = 'Stop'.
$defaultUrl = if ($env:CAPACITOR_SERVER_URL) { $env:CAPACITOR_SERVER_URL.Trim() } else { "" }
if ($defaultUrl) {
    Write-Host "[android] default server = $defaultUrl" -ForegroundColor Cyan
    $patched = $shellOriginal.Replace("__STRIV_DEFAULT_URL__", $defaultUrl)
    Set-Content -LiteralPath $shellFile -Value $patched -NoNewline -Encoding utf8
} else {
    Write-Host "[android] default server = (none - app will prompt)" -ForegroundColor Cyan
}

# Resolve the Gradle task before entering try/finally: `exit` inside try skips
# the finally block in some PowerShell versions, which would leave the
# placeholder substituted in the source tree.
$gradleTask = switch ($Task) {
    "debug"   { "assembleDebug" }
    "apk"     { "assembleRelease" }
    "release" { "bundleRelease" }
    "clean"   { "clean" }
    default   { $null }
}

if (-not $gradleTask) {
    Set-Content -LiteralPath $shellFile -Value $shellOriginal -NoNewline -Encoding utf8
    Write-Host "Usage: .\build.ps1 [debug|apk|release|clean]" -ForegroundColor Yellow
    exit 1
}

$exit = 0
try {
    # Sync web assets: without this the APK keeps whatever was current the last
    # time it was synced, which reads as "my change did nothing".
    Write-Host "[android] syncing web assets..." -ForegroundColor Cyan
    Push-Location $frontendDir
    & npx cap sync android
    $exit = $LASTEXITCODE
    Pop-Location

    if ($exit -eq 0) {
        Write-Host "[android] running :$gradleTask" -ForegroundColor Cyan
        Push-Location $AndroidDir
        & .\gradlew.bat $gradleTask --console=plain
        $exit = $LASTEXITCODE
        Pop-Location
    }
}
finally {
    # Always restore the placeholder, even if the build failed mid-way.
    Set-Content -LiteralPath $shellFile -Value $shellOriginal -NoNewline -Encoding utf8
}

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

@echo off
set "JAVA_HOME=C:\Program Files\Microsoft\jdk-21.0.12.101-hotspot"
set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
cd /d "C:\Users\raso8\Striv\striv-mobile\android"
call gradlew.bat assembleDebug --console=plain > "C:\Users\raso8\Striv\striv-mobile\apk-build.log" 2>&1
echo ==== EXIT: %ERRORLEVEL% ==== >> "C:\Users\raso8\Striv\striv-mobile\apk-build.log"

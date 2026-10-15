@echo off
REM ============================================================
REM  Striv -- double-click to STOP backend + frontend.
REM ============================================================
title Striv Stop

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1" stop

echo.
echo Striv stopped.
pause

@echo off
REM ============================================================
REM  Striv -- double-click this file to run the project.
REM  Starts the Laravel backend (:8001) and the Next.js
REM  frontend (:3000), then opens http://localhost:3000
REM ============================================================
title Striv Launcher

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0run-striv.ps1"

REM If PowerShell exits immediately with an error, keep the window so
REM the message is readable instead of flashing away.
if errorlevel 1 (
    echo.
    echo Launcher exited with an error. See the messages above.
    pause
)

@echo off
title Claude Code Bridge
cd /d "%~dp0"
echo ============================================================
echo   Claude Code Bridge - http://localhost:4317
echo   Keep this window OPEN while using Claude Code.
echo ============================================================
echo.
start "" http://localhost:4317
node --use-system-ca "%~dp0server.mjs"
echo.
echo (Bridge stopped)
pause >nul

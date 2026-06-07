@echo off
title Claude Code Tunnel
cd /d "%~dp0"
echo ============================================================
echo   Claude Code Tunnel - publishes link to the dashboard
echo   Look for:  https://xxxxx.trycloudflare.com
echo   Keep this window OPEN. Close it to stop the tunnel.
echo ============================================================
echo.
node --use-system-ca "%~dp0tunnel.mjs"
echo.
echo (Tunnel stopped)
pause >nul

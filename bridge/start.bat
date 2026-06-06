@echo off
chcp 65001 >nul
title Claude Code Bridge
cd /d "%~dp0"
echo เปิด Claude Code Bridge...
start "" http://localhost:4317
node server.mjs
pause

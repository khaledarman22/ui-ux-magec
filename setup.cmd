@echo off
REM ui-ux-magec setup for Windows. Usage: setup.cmd [--yes^|--non-interactive^|--dry-run]
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 20+ is required. Install it from https://nodejs.org and run this again.
  exit /b 1
)
node scripts\setup.mjs %*

@echo off
rem Starts PrintHub on this computer. Double-click it, or run it from PowerShell: .\start-printhub.bat
rem First run takes a few minutes (it downloads what PrintHub needs). Needs Node.js 20 or newer.
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get the LTS version from https://nodejs.org and run this again.
  pause
  exit /b 1
)

echo.
echo [1/3] Getting what PrintHub needs...
call npm --prefix tools\imposition\digital-printer install --no-audit --no-fund
if errorlevel 1 goto :failed
call npm --prefix server install --no-audit --no-fund
if errorlevel 1 goto :failed

echo.
echo [2/3] Building the app...
call npm --prefix tools\imposition\digital-printer run build
if errorlevel 1 goto :failed

echo.
echo [3/3] Starting. Leave this window open while you use PrintHub.
call npm --prefix server start
pause
exit /b 0

:failed
echo.
echo Something went wrong above. Copy the red text and send it to Claude.
pause
exit /b 1

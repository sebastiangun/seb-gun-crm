@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo BlueSales v22.0 quick phrases / reminders diagnostics
echo.
echo Start START_WINDOWS.bat and log in first.
start "" "http://127.0.0.1:9050/api/quick-phrases"
start "" "http://127.0.0.1:9050/api/reminders"
pause

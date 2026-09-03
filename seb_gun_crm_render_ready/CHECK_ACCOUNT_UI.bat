@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo BlueSales account UI / quick phrases diagnostics
echo.
echo Start START_WINDOWS.bat and log in first.
start "" "http://127.0.0.1:9050/api/debug/account-ui"
pause

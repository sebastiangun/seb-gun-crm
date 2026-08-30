@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo BlueSales API diagnostics
echo.
echo 1. Start START_WINDOWS.bat first.
echo 2. Log in to the CRM site.
echo 3. This window will open the BlueSales diagnostic endpoint.
echo.
start "" "http://127.0.0.1:9050/api/debug/bluesales"
pause

@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo BlueSales UI / Quick Phrases diagnostics v22.0
echo.
echo 1. Start START_WINDOWS.bat.
echo 2. Log in on the mobile CRM site.
echo 3. Then run this file.
echo.
start "" "http://127.0.0.1:9050/api/debug/account-ui"
pause

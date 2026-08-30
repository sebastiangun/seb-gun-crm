@echo off
setlocal EnableExtensions
cd /d "%~dp0"
echo ==========================================
echo seb_gun CRM + VK v24.5
echo LOCAL SELF TEST ONLY
echo ==========================================
echo.
where node.exe >nul 2>&1 || (echo ERROR: Node.js not found.& pause & exit /b 1)
call npm run check
if errorlevel 1 (echo ERROR: syntax check failed.& pause & exit /b 1)
call npm test
if errorlevel 1 (echo ERROR: local integration tests failed.& pause & exit /b 1)
echo.
echo ALL LOCAL TESTS PASSED.
echo This test does not start the real CRM server.
echo Use START_WINDOWS.bat for normal work.
pause

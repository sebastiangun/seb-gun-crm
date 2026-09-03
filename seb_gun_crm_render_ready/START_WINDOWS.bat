@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title seb_gun CRM v24.5 Launcher
echo ==========================================
echo seb_gun CRM + VK v24.5
echo NO browser extensions
echo VK preset is loaded from server config
echo ==========================================
echo.
where node.exe >nul 2>&1 || (echo ERROR: Node.js not found.& pause & exit /b 1)
start "seb_gun CRM v24.5 Server" cmd /k "cd /d ""%~dp0"" && node server.js"
echo Starting server on port 9050...
for /l %%I in (1,1,30) do (
  powershell -NoProfile -Command "try { $r=Invoke-WebRequest -UseBasicParsing http://127.0.0.1:9050/api/health -TimeoutSec 1; if($r.StatusCode -eq 200){exit 0}else{exit 1} } catch { exit 1 }" >nul 2>&1 && goto READY
  timeout /t 1 /nobreak >nul
)
echo ERROR: Server did not start.
pause
exit /b 1
:READY
echo Server is ready.
start "" "http://127.0.0.1:9050/?v=24.5.0"
echo Keep the "seb_gun CRM v24.5 Server" window open.
pause

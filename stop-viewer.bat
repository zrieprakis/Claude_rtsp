@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080

echo Stopping RTSP viewer server on port %PORT%...
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%PORT% .*LISTENING"') do taskkill /F /PID %%p >nul 2>&1

echo Stopping go2rtc started from this folder...
powershell -NoProfile -Command "Get-Process go2rtc -ErrorAction SilentlyContinue | Where-Object { $_.Path -like '%~dp0*' } | Stop-Process -Force"

rem Close the minimized server console left by start-viewer.bat
taskkill /F /FI "WINDOWTITLE eq RTSP Viewer Server*" >nul 2>&1

echo Done.
endlocal

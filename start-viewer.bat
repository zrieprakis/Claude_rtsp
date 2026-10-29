@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set PORT=8080
set URL=http://localhost:%PORT%/

if not exist "bin\go2rtc.exe" (
  echo go2rtc not found, running setup...
  powershell -NoProfile -ExecutionPolicy Bypass -File setup.ps1 || goto :fail
)

call :listening && (
  echo Server already running on port %PORT%.
  goto :open
)

echo Starting RTSP viewer server...
start "RTSP Viewer Server" /min cmd /k "node server.js"

rem Wait up to ~15s for the server to accept connections
set /a tries=0
:wait
ping -n 2 127.0.0.1 >nul
call :listening && goto :open
set /a tries+=1
if %tries% lss 15 goto :wait
echo Server did not start on port %PORT%. Check the "RTSP Viewer Server" window for errors.
goto :fail

:open
echo Opening %URL%
start "" chrome "%URL%" 2>nul || start "" "%URL%"
exit /b 0

:listening
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
exit /b %errorlevel%

:fail
pause
exit /b 1

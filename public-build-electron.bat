@echo off
echo Building public Electron release...
cd /d "%~dp0frontend"
call npm run electron:build:public
if errorlevel 1 (
  echo.
  echo Build failed. Fix the error above, then retry.
  pause
  exit /b 1
)
echo.
echo Done! Installer published to backend\downloads\
pause

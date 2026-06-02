@echo off
echo Building Electron release...
cd /d "%~dp0frontend"
call npm run electron:build
if errorlevel 1 (
  echo.
  echo Build failed. Fix the error above, then retry.
  pause
  exit /b 1
)
echo.
echo Done! Release output: frontend\release\
pause

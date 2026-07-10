@echo off
setlocal
echo Building Electron release...
cd /d "%~dp0frontend"

call npm run electron:build
if errorlevel 1 (
  echo.
  echo Build failed.
  echo.
  echo Common fixes:
  echo   1. Close Slide.exe if it is running ^(check the system tray^)
  echo   2. Run: cd frontend ^& npm run electron:clean
  echo   3. Retry this script
  echo.
  echo For a detailed log, run:
  echo   set DEBUG=electron-builder
  echo   npm run electron:build
  echo.
  pause
  exit /b 1
)

echo.
echo Done! Installer: frontend\release\Slide_Alpha_v*.exe
pause

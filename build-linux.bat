@echo off
setlocal

set "PROJECT_DIR=%~dp0frontend"
set "DOCKER_IMAGE=electronuserland/builder:20"
set "NODE_MODULES_VOLUME=slide-frontend-node-modules"

echo Building Slide Linux release (AppImage) via Docker...
echo.

docker version >nul 2>&1
if errorlevel 1 (
  echo Docker not found or not running.
  echo On Windows, Linux AppImage builds require Docker Desktop.
  echo Install: https://docs.docker.com/desktop/setup/install/windows-install/
  echo.
  echo Alternatives: WSL/Linux with "npm run electron:build:linux", or CI on ubuntu-latest.
  pause
  exit /b 1
)

cd /d "%PROJECT_DIR%"

echo Step 1: Installing dependencies and packaging inside Linux container...
echo (first run may take a few minutes while the image and npm packages download)
echo.

docker run --rm -i ^
  -v "%PROJECT_DIR%:/project" ^
  -v %NODE_MODULES_VOLUME%:/project/node_modules ^
  -v "%USERPROFILE%\.cache\electron:/root/.cache/electron" ^
  -v "%USERPROFILE%\.cache\electron-builder:/root/.cache/electron-builder" ^
  -w /project ^
  %DOCKER_IMAGE% ^
  /bin/bash -c "npm install && npm run electron:build:linux"
if errorlevel 1 goto :error

echo.
echo Step 2: Copy AppImage to backend\downloads for website / API serving...
set "DOWNLOADS_DIR=%~dp0backend\downloads"
if not exist "%DOWNLOADS_DIR%" mkdir "%DOWNLOADS_DIR%"
for /f "delims=" %%F in ('dir /b /o-d "%PROJECT_DIR%\release\*.AppImage" 2^>nul') do (
  copy /Y "%PROJECT_DIR%\release\%%F" "%DOWNLOADS_DIR%\%%F" >nul
  echo Copied %%F -^> backend\downloads\
  goto :copied
)
:copied

echo.
echo Done! Release output: frontend\release\
echo Website serves the newest .AppImage from backend\downloads via /download/:filename
pause
exit /b 0

:error
echo Build failed!
pause
exit /b 1

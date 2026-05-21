@echo off
setlocal
pushd "%~dp0"

echo Starting Equatoria Idle desktop...

if not exist node_modules (
  echo Installing dependencies...
  if exist package-lock.json (
    npm ci
  ) else (
    npm install
  )
  if errorlevel 1 goto error
)

echo Building desktop files...
npm run build:desktop
if errorlevel 1 goto error

echo Launching Electron...
npm run electron
if errorlevel 1 goto error

echo.
echo Equatoria Idle desktop closed.
pause
exit /b 0

:error
echo.
echo Something failed. See the error above.
pause
exit /b 1

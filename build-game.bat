@echo off
setlocal
pushd "%~dp0"

echo Building Equatoria Idle...

if not exist node_modules (
  echo Installing dependencies...
  if exist package-lock.json (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto error
)

call npm run build
if errorlevel 1 goto error

echo.
echo Build complete. Static files are in the dist folder.
pause
exit /b 0

:error
echo.
echo Something failed. See the error above.
pause
exit /b 1

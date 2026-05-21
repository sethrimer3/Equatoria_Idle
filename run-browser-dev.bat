@echo off
setlocal
pushd "%~dp0"

echo Starting Equatoria Idle browser development server...

if not exist node_modules (
  echo Installing dependencies...
  if exist package-lock.json (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto error
)

echo Launching Vite dev server at http://localhost:3000 ...
call npm run dev
if errorlevel 1 goto error

exit /b 0

:error
echo.
echo Something failed. See the error above.
pause
exit /b 1

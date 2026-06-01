@echo off
setlocal
pushd "%~dp0"

echo Starting Equatoria Idle desktop...

if not exist node_modules (
  echo Installing dependencies...
  if exist package-lock.json (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 goto error
)

echo Building desktop files...
call npm run build:desktop
if errorlevel 1 goto error

echo Launching Electron...
for /f %%H in ('powershell -NoProfile -Command "Add-Type -Name ConsoleWindow -Namespace Win32 -MemberDefinition '[DllImport(\"kernel32.dll\")] public static extern IntPtr GetConsoleWindow();'; [Win32.ConsoleWindow]::GetConsoleWindow().ToInt64()"') do set EQUATORIA_CONSOLE_HWND=%%H
if defined EQUATORIA_CONSOLE_HWND (
  start "" powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\hide-console-after-delay.ps1" "%EQUATORIA_CONSOLE_HWND%"
)
call npm run electron
if errorlevel 1 goto error

exit /b 0

:error
echo.
echo Something failed. See the error above.
pause
exit /b 1

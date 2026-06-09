@echo off
setlocal
pushd "%~dp0"

for %%i in (*.png) do cwebp.exe "%%i" -q 90 -mt -o "%%~ni.webp"

popd
pause

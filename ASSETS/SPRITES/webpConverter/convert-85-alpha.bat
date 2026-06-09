@echo off
setlocal
pushd "%~dp0"

for %%i in (*.png) do cwebp.exe "%%i" -q 85 -alpha_q 100 -mt -o "%%~ni.webp"

popd
pause

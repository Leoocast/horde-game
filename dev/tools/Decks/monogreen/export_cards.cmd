@echo off
setlocal

set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
    echo No se encontro el runtime de Node de Codex:
    echo %NODE_EXE%
    echo.
    pause
    exit /b 1
)

"%NODE_EXE%" "%~dp0export_cards.cjs"

echo.
if errorlevel 1 (
    echo La exportacion fallo.
) else (
    echo La exportacion termino correctamente.
)
pause

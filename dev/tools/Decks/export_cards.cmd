@echo off
setlocal EnableExtensions

set "DECKS_DIR=%~dp0"
set "NODE_EXE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
    where node >nul 2>&1
    if errorlevel 1 (
        echo No se encontro Node.js.
        echo Instala Node.js o ejecuta este archivo desde un equipo con el runtime de Codex.
        echo.
        pause
        exit /b 1
    )
    set "NODE_EXE=node"
)

set "DECK=%~1"
if defined DECK goto validate_deck

:menu
cls
echo ==================================================
echo              EXPORTADOR DE CARTAS
echo ==================================================
echo.
echo   1. Mono Green
echo   2. Zombies
echo   3. Goblins
echo   4. Vampires
echo   0. Salir
echo.
choice /C 12340 /N /M "Elige el deck que quieres exportar: "

if errorlevel 5 exit /b 0
if errorlevel 4 (
    set "DECK=vampires"
    goto validate_deck
)
if errorlevel 3 (
    set "DECK=goblins"
    goto validate_deck
)
if errorlevel 2 (
    set "DECK=zombies"
    goto validate_deck
)
if errorlevel 1 (
    set "DECK=monogreen"
    goto validate_deck
)

:validate_deck
if /i "%DECK%"=="monogreen" goto export_deck
if /i "%DECK%"=="zombies" goto export_deck
if /i "%DECK%"=="goblins" goto export_deck
if /i "%DECK%"=="vampires" goto export_deck

echo Deck invalido: %DECK%
echo Opciones: monogreen, zombies, goblins o vampires.
echo.
pause
exit /b 1

:export_deck
echo.
echo Exportando %DECK%...
echo Destino: %DECKS_DIR%%DECK%\exported-png
echo.

"%NODE_EXE%" "%DECKS_DIR%export_cards.cjs" "%DECK%"
set "EXPORT_RESULT=%ERRORLEVEL%"

echo.
if not "%EXPORT_RESULT%"=="0" (
    echo La exportacion fallo.
) else (
    echo La exportacion termino correctamente.
)

pause
exit /b %EXPORT_RESULT%

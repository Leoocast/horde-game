#!/bin/sh

DECKS_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
BUNDLED_NODE="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
OPENED_MENU=0

if [ -x "$BUNDLED_NODE" ]; then
    NODE_EXE="$BUNDLED_NODE"
elif command -v node >/dev/null 2>&1; then
    NODE_EXE=$(command -v node)
else
    echo "No se encontro Node.js."
    echo "Instala Node.js o ejecuta este archivo desde un equipo con el runtime de Codex."
    echo
    exit 1
fi

DECK=${1:-}

if [ -z "$DECK" ]; then
    OPENED_MENU=1
    clear
    echo "=================================================="
    echo "             EXPORTADOR DE CARTAS"
    echo "=================================================="
    echo
    echo "  1. La Última Lluvia"
    echo "  2. Zombies"
    echo "  3. Goblins"
    echo "  4. Vampires"
    echo "  0. Salir"
    echo
    printf "Elige el deck que quieres exportar: "
    read -r choice

    case "$choice" in
        1) DECK="last_rain" ;;
        2) DECK="hollow_bell_procession" ;;
        3) DECK="broken_forge_mutiny" ;;
        4) DECK="crimson_court" ;;
        0) exit 0 ;;
        *)
            echo
            echo "Opcion invalida: $choice"
            exit 1
            ;;
    esac
fi

DECK=$(printf "%s" "$DECK" | tr "[:upper:]" "[:lower:]")

case "$DECK" in
    last_rain|hollow_bell_procession|broken_forge_mutiny|crimson_court) ;;
    *)
        echo "Deck invalido: $DECK"
        echo "Opciones: last_rain, hollow_bell_procession, broken_forge_mutiny o crimson_court."
        exit 1
        ;;
esac

echo
echo "Exportando $DECK..."
echo "Copia de trabajo: $DECKS_DIR/$DECK/exported-png"
echo "El juego se actualizara automaticamente bajo public/cards."
echo

"$NODE_EXE" "$DECKS_DIR/export_cards.cjs" "$DECK"
EXPORT_RESULT=$?

echo
if [ "$EXPORT_RESULT" -ne 0 ]; then
    echo "La exportacion fallo."
else
    echo "La exportacion termino correctamente."
fi

if [ "$OPENED_MENU" -eq 1 ] && [ -t 0 ]; then
    echo
    printf "Presiona Enter para cerrar..."
    read -r _
fi

exit "$EXPORT_RESULT"

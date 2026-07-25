# AGENTS.md

Guia para agentes (Codex, Claude Code, etc.) trabajando en este repo.

## La guia completa es CLAUDE.md

**Lee [`CLAUDE.md`](CLAUDE.md) antes de tocar codigo.** Ahi esta el contexto real: estructura del
proyecto, estado del juego, contratos de UI/animacion, decks, developer mode, y las preferencias
del usuario.

Este archivo NO repite ese contenido a proposito. Antes era una copia completa de `CLAUDE.md` y se
quedo varias fases atras — llego a documentar como vigentes JSONs de deck que ya no existen. Un
solo documento canonico, y este apuntando a el.

Si actualizas documentacion, actualiza `CLAUDE.md`.

## Lo minimo para empezar

Stack: React 19 + TypeScript + Vite + Tailwind + Zustand + Framer Motion.

Separacion de capas, en orden de importancia:

- `src/engine/` — reglas del juego, funciones puras. Aca van las reglas reales.
- `src/store/` — puente UI/engine: secuencias, beats de la Horda, animaciones encoladas.
- `src/components/` — visual. Coordina animaciones y overlays, no decide reglas.
- `src/data/decks/` — cartas como JSON; el vocabulario lo valida el deck lint.

Corolario que ya costo un bug: si una regla visual tiene logica de verdad (que carta va en que
stack, que slot se sostiene), se saca del componente a un modulo puro para poder testearla. Ver
`src/components/battlefieldLayout.ts`.

## Verificar

Comandos, runner de tests y que esta cubierto: [`docs/testing.md`](docs/testing.md).

Lo minimo despues de cualquier cambio:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

No corras `npm install` / `pnpm install` salvo que haga falta: `node_modules` ya esta.

No levantes dev servers ni juegues el juego para verificar — el usuario lo prueba el mismo.
Verifica por tipos y tests.

## Otros documentos

- [`docs/testing.md`](docs/testing.md) — como se verifica, que esta cubierto y que no.
- [`docs/adding_cards.md`](docs/adding_cards.md) — flujo completo para agregar e implementar cartas.
- [`docs/animation_contracts.md`](docs/animation_contracts.md) — beats de la Horda, burn, static
  activation, death reveal, y por que el campo debe quedarse quieto entre beats.
- [`docs/game_modes.md`](docs/game_modes.md) — modos de juego.
- [`docs/goblin_cards.md`](docs/goblin_cards.md) — estado del deck de goblins.
- [`docs/game_context_for_lore_ai.md`](docs/game_context_for_lore_ai.md) — contexto narrativo.

## Deuda conocida

`player_deck.json` y `horde_deck.json` siguen en la raiz del repo pero **ningun archivo de `src/`
los importa**. Son restos del MVP viejo; no los uses como referencia. Borrarlos es decision del
usuario.

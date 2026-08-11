# AGENTS.md

Guia para agentes (Codex, Claude Code, etc.) trabajando en este repo.

## La guia completa es CLAUDE.md

**Lee [`CLAUDE.md`](CLAUDE.md) antes de tocar codigo.** Ahi esta el contexto real: estructura del
proyecto, estado del juego, contratos de UI/animacion, decks, developer mode, y las preferencias
del usuario.

Este archivo no repite ese contenido a proposito: hay un solo documento canonico para evitar que
las instrucciones se contradigan.

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

Comandos, runner de tests y que esta cubierto: [`docs/guides/testing.md`](docs/guides/testing.md).

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

El índice y el estado de cada documento están en [`docs/README.md`](docs/README.md). Las rutas
principales son:

- `docs/guides/` — flujos operativos y testing.
- `docs/reference/` — vocabulario, texto de cartas, animaciones y VFX.
- `docs/content/` — identidad y contratos de los decks vigentes, más previews explícitos.
- `docs/plans/` — únicamente propuestas o validaciones todavía abiertas.
- `docs/electron/` — arquitectura desktop, seguimiento, persistencia y release.
- `docs/data/` — baselines e inventarios generados consumidos por tooling.

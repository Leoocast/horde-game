# Testing

Como se verifica este proyecto. No hay runner de UI ni snapshots: todo lo que se testea es
determinista y corre en Node, sin DOM y sin navegador.

## Comandos

El usuario no tiene node/pnpm global; se usa el runtime bundled de Codex.

Typecheck (lo minimo despues de cualquier cambio):

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

Suite completa:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

Deck lint standalone (reporte por deck: ready / vanilla / WIP):

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\lint-decks.mjs
```

Auditoría de independencia en modo informativo:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs
```

Usar `--strict` como gate de publicación y `--json` para obtener la salida estructurada. El
inventario y la interpretación del baseline viven en `docs/independence_inventory.md`.

Proyección de datos y frescura de cartas impresas:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\card-studio-data.mjs --check
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\check-card-assets.mjs
```

El primer comando detecta si un HTML consumiría una proyección vieja. El segundo valida hashes de
datos, renderer, fuentes, arte y PNG finales; también rechaza que un PNG final sea el arte fuente
de su propio generador.

Build de produccion:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

## Como corre la suite

`scripts/run-engine-tests.mjs` levanta un Vite en middleware mode y carga cada archivo de test con
`ssrLoadModule`. Eso es lo que permite que los tests importen TypeScript y JSON del proyecto
directamente, sin build previo ni configuracion de transpilacion aparte. Los tests en si son
`node:test` + `node:assert/strict`.

Agregar un archivo de test = agregar su `ssrLoadModule` en ese script. Si no se agrega ahi, el
archivo no corre nunca.

## Que hay cubierto

| Archivo | Cubre |
| --- | --- |
| `tests/engine.test.js` | Reglas del engine: determinismo por seed, Energía y autopago, estados Exhausted/Stabilizing, eventos de Invocación/Juego/Muerte, Acciones Hostfall, perfiles `hostRules`, combate, Surge por deck, compatibilidad legacy de Chaos y targeting |
| `tests/hostBeats.test.js` | Regresiones de presentación del store: cola visual bajo timers retrasados, orden compartido Chronicler/Host, curaciones y pérdida de vida/robo de hechizos. |
| `tests/deckLint.test.js` | El deck lint como test: una habilidad desconocida rompe la suite; también protege versión, side, vocabulario cerrado Hostfall, perfiles de reglas y el borde de zona reservado para el bloque restante de L4.6 |
| `tests/deckCardText.test.js` | Formato puro del texto impreso, fuente runtime única de reglas, proyecciones generadas y assets locales: Rasgos, Fuerza/Aguante, contadores, creación de fichas, párrafos y rutas de arte |
| `tests/battlefieldLayout.test.js` | Reglas puras de layout del campo: slots que se sostienen durante la secuencia de la Horda, y congelamiento del agrupado en stacks |
| `tests/cardVoiceInteractions.test.js` | Reglas de voz entre cartas, filtros por subtipo, probabilidades y conteo de ataques confirmados |
| `tests/playgroundScenario.test.js` | Construccion, validacion, snapshot y reproducibilidad de escenarios |
| `tests/playgroundActions.test.js` | Acciones del laboratorio usando reglas reales: energia, cast, muerte, movimiento de zona y eventos |
| `tests/playgroundStorage.test.js` | Round-trip del schema v4 Hostfall, import/export, parseo defensivo y rechazo sin migración de versiones retiradas |
| `tests/audioMix.test.js` | Cobertura y validacion del JSON de mezcla, import/export, conversion de dB y prohibicion de volumen escondido en `playSfx` |

`tests/engineTestUtils.js` arma game states de prueba (`createTestGame`, `customCard`,
`cardFromDeck`, `addCard`, `addForests`).

## Que NO se testea, y por que

No hay tests de React. No se montan componentes, no se mide layout real y no se conducen
animaciones. El navegador queda para el usuario, que juega el build el mismo.

La consecuencia practica: **si un bug visual depende de logica, esa logica se saca del componente
para poder testearla.** Es lo que se hizo con `src/components/battlefieldLayout.ts`, que contiene
las reglas puras de agrupado y de slots sostenidos que antes vivian dentro de `Battlefield.tsx`.
Esas funciones se manejan igual que el engine: entrada -> salida, sin React.

Los tests de `battlefieldLayout` simulan pasadas de render llamando a las funciones una vez por
"frame" y arrastrando los mismos `{ current }` entre llamadas, tal como lo hacen los refs del
componente. Incluyen un helper que replica el pruning que hace `renderCardStacks`, porque ese
pruning es justamente la parte que hace que tierras y other permanents parezcan cartas recien
llegadas en cada render.

## Regla al arreglar un bug

Cuando el bug es reproducible en logica pura, escribir el test **antes** de aplicar el arreglo y
confirmar que falla contra el codigo viejo. Un test que pasa en ambas versiones no cubre nada. El
flujo usado para el bug de reagrupado fue:

1. Escribir el test que describe el comportamiento correcto.
2. Correrlo contra el codigo sin arreglar y verificar que falla.
3. Aplicar el arreglo.
4. Correr la suite completa + `tsc -b` + build.

## Estado actual

No mantener aqui un numero fijo de tests ni una lista copiada de cartas WIP: ambos cambian con
frecuencia y fueron una fuente de documentacion atrasada.

- La suite imprime el total y el resultado vigentes.
- `scripts/lint-decks.mjs` imprime por deck las cartas `ready`, `vanilla` y `partial`, junto con
  cada habilidad marcada `engineSupport: "pending"`.
- Un WIP declarado no falla la suite; una habilidad que promete estar soportada y no coincide con
  el vocabulario del engine si la rompe.
- `tests/vocabulary.test.js` impide que regresen términos públicos retirados, valida la
  presentación localizada de todas las cartas y confirma que no quede una ruta de tutorial dormida.

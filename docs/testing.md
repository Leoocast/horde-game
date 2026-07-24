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
| `tests/engine.test.js` | Reglas del engine: determinismo por seed, mana y autopago, combate del player y de la Horda, muertes y triggers encadenados, surge por deck, chaos mode, targeting |
| `tests/deckLint.test.js` | El deck lint como test: una habilidad de un deck JSON que el engine no entiende rompe la suite en vez de quedar muda |
| `tests/battlefieldLayout.test.js` | Reglas puras de layout del campo: slots que se sostienen durante la secuencia de la Horda, y congelamiento del agrupado en stacks |

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

68 tests, todos en verde. El deck lint pasa con WIP conocidos y declarados en
`goblin_assault_horde` (`hobgoblin_bandit_lord`, `battle_cry_goblin`, `goblin_rabblemaster`,
`mogg_mob`), que estan marcados `engineSupport: "pending"` a proposito.

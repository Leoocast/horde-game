# Testing

Como se verifica este proyecto. La lógica determinista corre en Node; la vertical Electron añade un
smoke empaquetado para frontera de seguridad, protocolo y media. El layout jugable y las animaciones
completas siguen requiriendo QA manual.

## Comandos

El usuario no tiene node/pnpm global; se usa el runtime bundled de Codex. El toolchain de release
está fijado en Node 24.14.x (`.node-version`) y pnpm 11.16.x (`packageManager` y `engines`).

Typecheck (lo minimo despues de cualquier cambio):

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

Suite completa:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

Benchmark manual del Seed Explorer —no es un gate de CI—:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts/benchmark-seed-explorer.mjs
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
auditor revisa directamente el código, los datos authored, los assets locales y `dist`.

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
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js --config vite.config.ts build
```

El script equivalente y canónico es `pnpm run build:web`; `build` se mantiene como alias web hasta
que exista el build Electron. `vite.config.ts` es la única config Vite y todos los scripts la
seleccionan explícitamente.

Vertical Electron Windows x64:

```bash
pnpm electron:package
pnpm electron:verify
pnpm electron:smoke
pnpm electron:repro
pnpm electron:delta
pnpm electron:release:audit
```

`electron:verify` lee el ASAR y los nueve fuses del binario. `electron:smoke` carga el `app.asar`
real mediante Playwright, comprueba sandbox/preload, protocolo, PNG, arte fuente, font, Range/seek,
WebGL/context loss, fullscreen, preferencias/resume, window state, single-instance y cero HTTP;
después lanza el `Hostfall.exe` real con un boot probe oculto. El
arnés Playwright no usa directamente el ejecutable fusionado porque el fuse requerido
`EnableNodeCliInspectArguments: false` bloquea correctamente su canal de inspector.

`electron:repro` construye dos paquetes unsigned y exige que sus 261 archivos tengan exactamente
los mismos tamaños y SHA-256. `electron:delta` verifica que una carta sea un recurso individual y
no invalide `app.asar`. `electron:release:audit` es un gate comercial: debe seguir fallando mientras
queden fingerprints, audio, rights, licencia, icono o firma pendientes.

Para QA interactivo de desarrollo, el usuario ejecuta `pnpm electron:start`. Los agentes no levantan
ese servidor ni juegan el build como verificación automática.

## QA manual de claridad de la UI principal

El plan `docs/plans/ui_core_rules_clarity_plan.md` cerró el 2026-08-11. Cambios futuros en la UI
principal deben conservar este smoke manual:

1. Preparación muestra progreso propio y su último paso anticipa el despertar de la Hueste.
2. El Archivo del Cronista y el próximo robo coinciden con `playerDrawForecast`, incluida la Mano
   vacía y las dificultades.
3. Jugar y devolver una Fuente comparten una sola Acción de Fuente; la devolución entra al Archivo y
   el reemplazo sale visualmente de él.
4. La Mano se reorganiza sin saltos al robar, jugar o Invocar. Los drops válidos ceden a su animación
   especializada y los inválidos regresan a la Mano.
5. La Reserva generada por cartas funciona durante Preparación. La fila amarilla no se muestra
   bloqueada; su tooltip de Preparación explica que la Energía de Fuentes sin usar se guarda al
   terminar esa etapa.
6. Un pago mixto consume Reserva antes que Fuentes. Al volver del turno de la Hueste, cada orbe azul
   pendiente viaja y se transforma en su orbe amarillo sin parpadeos ni duplicados.
7. El ataque identifica al Archivo de la Hueste, anticipa `actual → restante`, usa el umbral real y
   anima exactamente el número de cartas descartadas hacia Memoria.
8. Repetir los casos relevantes en ES y EN, con Mano y Reserva vacías/parciales/llenas, teclado y
   `prefers-reduced-motion` cuando se toque alguno de esos contratos.

La cobertura automática asociada vive principalmente en `tests/engine.test.js` y
`tests/uiPresentation.test.js`; no sustituye la comprobación visual de trayectorias, solapamientos y
ritmo.

## Canon Seeds y origen de partida

`tests/canonSeed.test.js` fija el codec HF1 y contiene un golden vector manual con el orden completo
de Crónica/Hueste y `currentRandomState`. `tests/matchOrigin.test.js` cubre generación e importación,
aplicación de configuración, rechazo de una revisión determinista incompatible, separación de seeds
opaque y el contrato de copia pública. Si cambia intencionalmente el consumo de RNG, las reglas o el
contenido determinista, no se actualiza el golden de HF1: se introduce un formato nuevo.

CI corre en Windows x64, instala con `pnpm install --frozen-lockfile` y ejecuta typecheck, suite,
deck lint, proyección de Card Studio, `build:web` y auditoría offline. Los
scripts de instalación permitidos están declarados por paquete en `pnpm-workspace.yaml`, sin
aprobación interactiva.

Después de `build:web`, comprobar que no haya recursos remotos ni tooling de desarrollo en release:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-offline-runtime.mjs
```

El inventario de paths, tamaños y SHA-256 de `dist` es un diagnóstico opcional de release, no un
gate de desarrollo ni de cada pull request. Para registrar un build release aprobado, generarlo y
comprobarlo contra ese mismo `dist`:

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\runtime-asset-inventory.mjs --write
```

```bash
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\runtime-asset-inventory.mjs --check
```

El output versionado es `docs/data/generated/runtime_asset_inventory.json`. Puede quedar desfasado
durante el desarrollo normal; no regenerarlo por cada cambio de CSS o TypeScript.

## Como corre la suite

`scripts/run-engine-tests.mjs` levanta un Vite en middleware mode usando explícitamente
`vite.config.ts` y carga cada archivo de test con `ssrLoadModule`. Eso es lo que permite que los
tests importen TypeScript y JSON del proyecto
directamente, sin build previo ni configuracion de transpilacion aparte. Los tests en si son
`node:test` + `node:assert/strict`.

Agregar un archivo de test = agregar su `ssrLoadModule` en ese script. Si no se agrega ahi, el
archivo no corre nunca.

## Que hay cubierto

| Archivo | Cubre |
| --- | --- |
| `tests/engine.test.js` | Reglas del engine: determinismo por seed, Energía y autopago, estados Exhausted/Stabilizing, eventos de Invocación/Juego/Muerte, Acciones Hostfall, perfiles `hostRules`, combate, Surge por deck, compatibilidad legacy de Chaos y targeting |
| `tests/canonSeed.test.js` | Codec `HF1-PPP-HHH-XXD-XXX`: códigos de deck independientes del idioma, entropía base 36, dificultad/Preparación acopladas y paridad de la costura de shuffle con `createInitialGame` en los cuatro enfrentamientos builtin |
| `tests/seedExplorer.test.js` | Analyzer, búsqueda, runtime y persistencia: Mano/mulligan/topes exactos, recursos y curva impresa, ventanas potenciales de Hueste, cinco perfiles versionados con scoring/filtros distintos, rango base 36, top-K estable, pool verificado y selección diversa determinista, slices cancelables, progreso limitado, protección contra búsquedas obsoletas, favoritos defensivos con migración de perfil, export JSON/CSV y verificación contra el engine |
| `tests/attemptNarrative.test.js` | Prototipo aislado del relato: vocabulario cerrado de hitos directos, selección determinista e independiente del idioma, templates ES/EN sin causalidad inferida ni metadatos repetidos, terminología de Ecos, fallback diegético ante hechos técnicos, hitos desconocidos y sincronía del artefacto de revisión |
| `tests/productCapabilities.test.js` | Presets de producto y resume: la demo no lee, escribe ni borra un save sembrado; el preset de regresión Early Access conserva las operaciones vigentes; `App` y StartMenu sólo exponen Continuar detrás de la capability |
| `tests/hostBeats.test.js` | Regresiones de presentación del store: cola visual bajo timers retrasados, orden compartido Chronicler/Host, curaciones y pérdida de vida/robo de hechizos. |
| `tests/deckLint.test.js` | El deck lint como test: una habilidad desconocida rompe la suite; también protege versión, side, vocabulario cerrado Hostfall, perfiles de reglas y normalización de zonas authored |
| `tests/deckCardText.test.js` | Formato puro del texto impreso, fuente runtime única de reglas, proyecciones generadas y assets locales: Rasgos, Fuerza/Aguante, contadores, creación de fichas, párrafos y rutas de arte |
| `tests/battlefieldLayout.test.js` | Reglas puras de layout del campo: slots que se sostienen durante la secuencia de la Horda, y congelamiento del agrupado en stacks |
| `tests/targetingGeometry.test.js` | Geometría pura para selección de objetivos y solapamiento visible entre fuente y target |
| `tests/tacticalArrowGeometry.test.js` | Construcción, orientación y estabilidad de las flechas tácticas |
| `tests/attackChevronGeometry.test.js` | Forma, simetría y anclajes del chevrón de ataque |
| `tests/cardVoiceInteractions.test.js` | Reglas de voz entre cartas, filtros por subtipo, probabilidades y conteo de ataques confirmados |
| `tests/playgroundScenario.test.js` | Construccion, validacion, snapshot y reproducibilidad de escenarios |
| `tests/playgroundActions.test.js` | Acciones del laboratorio usando reglas reales: energia, cast, muerte, movimiento de zona y eventos |
| `tests/playgroundStorage.test.js` | Round-trip del schema v4 Hostfall, import/export, parseo defensivo y rechazo sin migración de versiones retiradas |
| `tests/guidedLesson.test.js` | Schema y builder de guía: recetas exactas, aliases por copia, repartos de dos/siete cartas, orden `topToBottom`, zonas/combate/Reserva, rechazo de contenido inválido y prueba con un catálogo sintético |
| `tests/guidedInteractionGate.test.js` | Gate semántico de guía: intenciones exactas, contextos/targets, receipts y cursores, doble compromiso, rechazo reintentable del engine, targeting multietapa, automatismos, robo por Mano vacía, Reserva, mill y cobertura de entradas públicas del store |
| `tests/guidedSession.test.js` | Ciclo de sesión Explicar/Actuar/Observar, barrera entre beats, tokens visuales con epochs, aborto seguro y vertical del Guidance Lab sobre el store real |
| `tests/audioMix.test.js` | Cobertura y validacion del JSON de mezcla, import/export, conversion de dB y prohibicion de volumen escondido en `playSfx` |
| `tests/vocabulary.test.js` | Vocabulario público retirado, presentación localizada de cartas y ausencia de archivos, seed mágico o cartas hardcodeadas del tutorial retirado |
| `tests/uiPresentation.test.js` | Contratos puros y estáticos de presentación: VFX compartido, Burn, presets, capas, geometría visual, gates dev-only, dock de herramientas en el home e integración de Seed Explorer como pantalla independiente con el Board real |
| `tests/contentCatalog.test.js` | Snapshot builtin inmutable, 61 identidades, aliases calificados, defaults estrictos, adapters de assets web/desktop, proyecciones de Card Studio y rechazo de candidatos external adversariales |
| `tests/electronSecurity.test.js` | Policy pura de `hostfall://`, traversal/hosts/packs adversariales, MIME, Range, roots e integración de respuestas parciales con CSP |
| `tests/electronPersistence.test.js` | Rutas cloud-worthy/local-only, escritura atómica, backup, corrupción y validación de window state |
| `tests/desktopPreferences.test.js` | Envelope v1 de idioma/audio, límites y rechazo de schemas desconocidos |
| `tests/resumeSave.test.js` | Round-trip/restore determinista, claves de deck y revisión, rechazo sin fallback, backup y checkpoints inseguros durante animaciones/combate/selecciones |
| `tests/electronRelease.test.js` | Allowlist generada, grafo Card Studio-to-runtime, audio declarativo/local, hashes del staging y comparación de manifests de paquete |

`tests/engineTestUtils.js` arma game states de prueba (`createTestGame`, `customCard`,
`cardFromDeck`, `addCard`, `addForests`).

## Que NO se testea, y por que

No hay tests que monten React. No se mide layout real ni se conducen
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
  presentación localizada de todas las cartas y bloquea específicamente las rutas legacy del
  tutorial retirado sin prohibir el nuevo framework declarativo.

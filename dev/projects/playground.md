# Playground

Pantalla de desarrollo para configurar, ejecutar, inspeccionar, reiniciar y guardar escenarios de
prueba de cartas.

Estado: **Completo (fases 1 a 6)**. Ver [Siguientes pasos](#siguientes-pasos). Ver [Fases](#fases) para el avance.

## Objetivo

Poder probar una carta sin jugar una partida entera hasta que salga. Una carta probada desde el
playground debe recorrer **exactamente el mismo flujo** que en partida real:

- mismo modelo de estado (`GameState`)
- mismo sistema de eventos (`EventQueue`)
- mismo resolvedor de efectos (`EffectResolver`)
- mismas reglas (`GameRules`, `HordeRules`, `CombatResolver`)
- misma IA de la Horda (`HordeController`)
- mismo sistema de turnos y fases (`TurnManager`, `PhaseManager`)

Prohibido: logica que simule superficialmente un efecto, tablas de cartas propias del playground,
atajos que salten el cost-check o el targeting. Si el playground necesita algo que el engine no
sabe hacer, se arregla el engine.

## Por que se puede hacer barato

Tres hechos del repo hacen que esto no requiera infraestructura nueva:

1. **El estado ya es serializable y determinista.** `GameState` es JSON plano, las acciones del
   engine hacen `structuredClone` y devuelven estado nuevo, y el RNG es un unico numero
   (`currentRandomState`) — no hay closures ni `Math.random`. Por eso un escenario **no tiene
   formato propio**: un escenario es un `GameState` mas sus deck ids. Guardar = clonar,
   reiniciar = replantar el clon. Reproducibilidad exacta sin revertir nada.
2. **Las secuencias y animaciones viven en el store, no en el engine.** Si el playground montara su
   propia vista de estado, perderia beats de Horda, overlays de targeting y animaciones de combate:
   justo lo que se quiere revisar. Por eso la pantalla es el `<Board>` real y el playground maneja
   el store real (`useGameStore`).
3. **`lastActionResult` ya existe.** El contrato engine-store de fase 4 (`{ ok, reason }`) es
   exactamente lo que necesita el requisito de "cuando una accion no sea valida, mostrar el motivo".
   No hace falta parsear el log.

## Modo desarrollo

No existia deteccion de modo desarrollo en el proyecto. El seed `"developer"` es otra cosa: trucar
el contenido inicial de una partida normal, no habilitar herramientas.

Implementacion minima en `src/utils/devMode.ts`:

```ts
export const IS_DEV = import.meta.env.DEV || new URLSearchParams(location.search).has("playground");
```

- `import.meta.env.DEV` es `false` en `vite build`, asi que la opcion desaparece del menu.
- `?playground` permite abrirlo en un build de preview cuando haga falta.
- `PlaygroundScreen` se importa con `lazy()` detras del flag: sale en su propio chunk
  (~8 kB) que produccion nunca pide. **No** se elimina del build — como `IS_DEV` lee la URL en
  runtime, no es estaticamente `false` y Rollup no puede podarlo. Es el precio del `?playground`.
  Su CSS si viaja en `index.css`.

## Arquitectura

```text
src/
  utils/devMode.ts            IS_DEV
  playground/
    scenario.ts               ScenarioDefinition -> GameState (PURO, testeable)
    scenarioStorage.ts        localStorage + export/import JSON (parseo defensivo, testeado)
    timeline.ts               TimelineStep + executeStep + deteccion de "ocupado"/"esperando input"
    actions.ts                acciones sobre juego vivo (PURAS, testeadas)
    cardCatalog.ts            catalogo de cartas derivado de DECK_REGISTRY
    PlaygroundScreen.tsx      <Board> real + dock lateral
    panels/                   Escenario / Cartas / Acciones / Timeline
  store/useGameStore.ts       + createCleanUiState(), + loadScenario()
```

### Escenario

Un `ScenarioDefinition` es la **definicion**, no el estado:

```ts
type ScenarioDefinition = {
  version: 4;
  playerDeckId: string;
  hostDeckId: string;
  seed: string;
  turnNumber: number;
  hostTurnNumber: number;
  phase: Phase;
  activeSide: "player" | "host";
  player: { life: number; energy: number; storedEnergy: number };
  host: { poisonCounters: number };
  zones: { playerHand?: ScenarioCard[]; playerField?: ScenarioCard[]; hostField?: ScenarioCard[]; ... };
};
```

`buildScenarioGame(definition)` construye siempre desde cero con `createInitialGame` +
`createCardInstance`. **Nunca** parchea el estado vivo. Eso es lo que hace que reiniciar sea
identico a iniciar.

Defaults del escenario en blanco: `setupTurnsRemaining: 0`, `openingHandAccepted: true`, mano y
campos vacios, turno 1, fase `main`, `activeSide: "player"` y **energia llena** (`energy:
MAX_PLAYER_LANDS`): un tablero desde el que no se puede castear nada no sirve para probar una carta.

### Un solo recurso: energia

El juego tiene **un** recurso y se llama energia. En el engine son dos cosas: **tierras destapadas**
en el campo (energia disponible, pista azul, tope `MAX_PLAYER_LANDS`) y el **pool colorless**
(energia guardada, pista amarilla, tope `STORED_MANA_CAP`). `ManaPool` sigue teniendo colores porque
los costes impresos son simbolos de Magic, pero el jugador nunca ve un color.

Por eso el playground **no** expone `+G`/`+R`/`+U`: meter mana verde al pool pagaba cartas sin
aparecer en ninguna parte del tablero, que es exactamente la queja de "no hay nada que me de mana".
Las acciones mueven los mismos diales que el juego:

- **Add source**: pone una tierra destapada mas (hasta el tope). La tierra sale del deck del player,
  no esta hardcodeado Forest.
- **Refill**: destapa todas las tierras y devuelve la accion de Energia del turno.
- **+1 stored**: `addStoredEnergy`, respeta el tope.
- **Drain all**: tapa todo y vacia el pool.

El escenario configura lo mismo con dos campos (`energy`, `storedEnergy`), ambos clampeados a los
topes del engine. Las tierras que el escenario liste en `playerField` cuentan contra el tope:
el campo `energy` solo rellena el hueco que quede.

### Lab y partida son dos cosas, no dos botones

El dock tiene un `mode` (`"board" | "game"`) y la pestana Setup muestra **solo** los campos del modo
activo. Un lab no tiene dificultad, ni selector de decks, ni setup turns, ni mano inicial: nada de
eso significa nada en un banco de pruebas, y tenerlo a la vista hacia que el laboratorio pareciera
una partida mal configurada. Lanzar cualquiera de los dos fija el modo, y el switch de arriba de
Setup lo cambia sin lanzar.

El lab muestra: nombre, estado inicial (turno/fase/lado, vida, poison, energia, energia guardada),
el contenido del tablero en vivo y los guardados. La partida muestra: seed, decks, dificultad, modo
de juego y setup turns.

**Jugar una carta de Horda no corre un turno de Horda.** Antes lo hacia — jugar un token de Goblin
en el lab desencadenaba el turno entero de la horda de zombies cargada: destapaba, revelaba tres
cartas suyas y atacaba. `revealHordeCardFromTop` en `HordeController.ts` revela y juega **una** carta
del tope por el mismo camino que usa el turno (`revealAndPlayOne`: ETB, triggers, parking de
Tributo de los Cuatro Pesares / `tribute_of_the_four_sorrows`) y nada mas; el store lo envuelve en `resolveHordeCardFromTop`, que reusa los mismos beats
que `runHordeMain` (aura estatica, triggers de entrada, mills, hand-off de `tribute_of_the_four_sorrows`) pero no arranca
combate. Hay test que verifica que el turno de Horda no avanza, la fase no cambia y no se declaran
atacantes.

### Un solo lugar para lanzar

El playground existe para saltar directo a un estado, pero a veces el bug solo aparece en una
partida de verdad. La barra de lanzamiento — bajo el header, **fuera de las pestanas y sin duplicado
dentro de ninguna** — tiene los dos modos, ambos reproducibles desde su propia definicion:

- **Build board**: `loadScenario(buildScenarioGame(...))`, tablero armado a mano, sin mano inicial.
- **Play game**: el `reset()` del store — el mismo que llama el menu principal — con la seed, los
  decks, la dificultad y el modo del formulario, mas sus setup turns. Mano inicial, mulligans y todo.
- **Restart**: relanza el que este vivo, sea cual sea.

Hubo una version con el boton de partida repetido dentro de la pestana Setup ademas de la barra.
Parecian dos features distintas. Un solo lugar.

### No hay borrador: el tablero es el escenario

Habia dos representaciones en paralelo: un `draft` con sus `zones` editables y el juego vivo. "Place
now" tocaba uno y "Add to scenario" el otro, la lista de zonas nunca reflejaba lo que se ponia en el
campo, y Save guardaba el borrador — o sea, algo distinto de lo que estabas mirando.

Ahora hay un solo estado. Las cartas se ponen en el juego vivo, la pestana Setup muestra el
contenido del tablero **en vivo y de solo lectura**, y `snapshotScenario(game, base)` lee ese juego
de vuelta a una `ScenarioDefinition` cuando se guarda. Hay test de ida y vuelta: fotografiar un
tablero y reconstruirlo devuelve las mismas zonas. Las librerias no se fotografian a proposito — un
escenario es una posicion inicial, no un save state.

Ojo con las tierras: viajan como entradas normales de `playerField`, asi que el snapshot pone
`energy: 0` o al recargar apareceria un segundo juego de tierras encima.

### Jugar una carta = jugarla de verdad

La pestana Cards tiene un boton **Play** que hace lo que dice, ruteado por lado:

- Carta del player: entra a la mano y se castea por el camino normal (coste cubierto). Si pide
  targets se abre el overlay real.
- Carta de la Horda: va al tope de la libreria de la Horda y corre el turno de la Horda. Es la
  **unica** forma en que una carta de Horda entra en juego en este modo — no hay un "castear" de
  Horda que imitar.

Debajo, separado, queda el "ponlo directo en" para armar tableros: silencioso, sin coste ni
triggers. Las zonas ofrecidas dependen de la carta (`destinationsFor`): un sorcery no ofrece
battlefield y la Horda no ofrece mano. Antes se podia dejar Tributo de los Cuatro Pesares en el campo de la Horda, un
estado al que el juego no puede llegar nunca.

### loadScenario

`reset` en `useGameStore` ya sabe dejar el store limpio: `resetHordeSequence()`, colas de animacion
vaciadas, `gameSessionId + 1` (que remonta el `<Board>` y mata timers colgados). `loadScenario`
necesita lo mismo salvo el `createInitialGame`. Por eso el literal de estado UI limpio se extrae a
`createCleanUiState()` y lo usan las dos.

### El dock (izquierda) es overlay puro

El dock va a la izquierda, mide 460px, tiene `z-index: 9000` y **flota sobre un Board de tamano
completo**. No desplaza nada.

Dos intentos previos, los dos malos:

1. Encoger el Board con un wrapper `transform: translateZ(0)`. El wrapper se vuelve containing block
   de los descendientes `position: fixed`, asi que con el dock a la izquierda el origen se corre y
   **toda** la matematica de `getBoundingClientRect` de `CombatArrows` y de los overlays de targeting
   queda desfasada.
2. Dejar el Board a tamano completo pero meter `padding-left` a sus contenedores
   (`.game-battlefield-stage`, `.game-command-bar`, `.player-hand-region`). Las flechas quedaban
   bien, pero movia el campo de batalla y la zona de oleadas de la Horda — o sea cambiaba el layout
   que el playground existe para inspeccionar. Una carta tiene que estar donde estaria en partida.

Conclusion: el dock tapa la izquierda del campo y ya. El `z-index: 9999` esta por encima de todas las
superficies del juego (los modales llegan a 560) y por debajo de los tooltips (10000), que son
transitorios y se anclan a lo que senala el mouse.

**El nucleo de energia es la excepcion y no se arregla con z-index.** `.player-mana-core` esta
porteado directo a `<body>`, fuera del DOM del playground, y seguia pintandose encima del dock por
alto que fuera el z-index de este: el z-index solo ordena elementos que comparten stacking context,
y estos dos no lo comparten. Como el nucleo vive abajo a la izquierda, entero dentro de los 460px
del dock, "detras del dock" y "no dibujado" se ven igual: mientras el dock esta abierto se oculta
con `body:has(.playground-dock) .player-mana-core { visibility: hidden }`. `visibility` y no
`display` para que el elemento conserve su caja — la animacion de reciclado de energia mide ese
rect. Colapsar con F2 desmonta el dock y el nucleo vuelve solo.

El chunk lazy tampoco cae en `GameLoadingScreen`: entrar a una herramienta de desarrollo mostrando
el arte de carga del juego parece que la partida arranca de cero. El fallback es un frame oscuro
(`.playground-chunk-fallback`).

### Vida de la Horda

No existe en el modelo: la Horda pierde por mill. El panel expone lo que si es su barra de vida:
cartas en el Archivo, poison counters, `hostTurnNumber` y si esta en surge.

### Agregar cartas

Dos acciones distintas porque son dos necesidades distintas (ver "Jugar una carta = jugarla de
verdad" arriba):

- **Play**: la carta entra por el flujo completo — cast o revelado de Horda, ETB, triggers, beats,
  animacion.
- **Ponlo directo en**: la carta entra silenciosa. Para armar un board sin disparar medio deck.

Los `instanceId` los genera el playground con su propio contador de sufijos
(`playground-<side>-<defId>-<n>`), verificando contra las zonas existentes hasta encontrar uno libre:
sin eso, dos "place now" del mismo id chocarian.

Ojo con el catalogo de cartas: un deck puede listar el mismo id en `cards` y en `tokens` — el deck
goblin corre fichas de Goblin como cartas reales de libreria. `findCardDefinition` ya las resuelve a
una sola definicion, asi que `cardCatalog.ts` deduplica por deck+id y expone un `key` unico. Sin eso
React recibia keys duplicadas y dejaba nodos fantasma en la lista de resultados.

### Cheats que no son cheats

- **Jugar sin coste**: inyectar en el pool exactamente el mana que pide la carta y llamar al
  `castCard` normal. No un flag de bypass — asi el cast pasa por el mismo cost-check, timing,
  targeting y triggers que en partida.
- **Kill it**: `destroyPermanent` + `drainEventQueue` del engine, con sus triggers de muerte
  reales. **Remove it** es otra cosa a proposito: movimiento crudo de zona, sin muerte y sin
  triggers. **Wipe** (`clearBattlefield`) es lo mismo por lado entero. Hay test que los distingue
  con Escupefuego de la Retaguardia (`rear_guard_firebreather`; destruir una ficha de Trasgo quema un Eco del jugador; moverla al
  cementerio o barrer el campo no).
- **Jugar sin coste**: `grantManaForCard` sube el pool exactamente al coste impreso y despues corre
  el `castCard` normal. Si la carta pide targets se abre el `SpellTargetingOverlay` de verdad, la
  misma rama que usa `Hand.tsx`.
- **Resolver un solo evento**: `drainNextEvent` en `EventQueue.ts`. Va aparte de `drainEventQueue`
  porque esa aparca los eventos diferidos hasta el final del drenaje, cosa que un solo paso no puede
  hacer sin reprocesarlos al instante.

## Timeline

Decision: el timeline es **grabar y reproducir**, no un feed de debug.

`TimelineStep` (en `timeline.ts`) es **el formato entero**: grabar es hacer push de un step,
reproducir es correrlos en orden sobre un escenario reconstruido. El futuro creador de flujos edita
esta misma lista, no una segunda representacion.

`executeStep` es el unico camino: los paneles no llaman acciones directamente, hacen `dispatch(step)`
que ejecuta y graba. Asi es imposible que lo grabado difiera de lo ejecutado.

Grabar ids de carta es seguro porque `buildScenarioGame` es determinista: un escenario reiniciado
reparte los mismos `instanceId` en el mismo orden. Hay test que corre la misma secuencia de acciones
sobre dos reconstrucciones y compara con `deepEqual`.

Reproduccion **animada, paso a paso**:

- `isPlaygroundBusy()` deriva de las colas que ya existen en el store (combate de Horda, summoning,
  triggers, mills, descartes, animaciones de ataque/quemado). El driver no avanza mientras siga en
  true. **No** se agregaron timers nuevos.
- `isWaitingForInput()` detecta targeting/descarte/selección de `tribute_of_the_four_sorrows` abiertos: el auto-play se **pausa** en vez
  de contestar por el jugador.
- Nada se graba mientras se reproduce (`replayCursor !== undefined`), o el replay se copiaria a si
  mismo.

Limitacion actual: solo se graba lo que sale del dock (acciones del panel + "place now"). Jugar una
carta arrastrandola desde la mano en el tablero **no** queda grabado, y un `play` con targets abre el
overlay real y espera al usuario — la eleccion de targets todavia no es parte del step. Ese es el
siguiente incremento natural hacia el creador de flujos: guardar los targets en el propio step.

## Persistencia

localStorage separado para boards (`hostfall-playground-boards:v3`) y replays
(`hostfall-playground-replays:v3`), mas export/import `.json` con `ScenarioDefinition` v4.

Los JSON de versiones anteriores se rechazan y los namespaces retirados de localStorage se limpian
al acceder. Estos datos son artefactos de prueba del Playground, no partidas del usuario.

Un escenario guardado **lleva su flujo grabado dentro** (`{ definition, steps }`): un flujo sin su
estado inicial no es reproducible, asi que viajan juntos siempre — al guardar, al exportar y al
cargar. Guardar hace upsert por nombre, no acumula copias.

`parseScenarioFile` trata el archivo como input hostil: acepta tanto un export completo como una
`ScenarioDefinition` pelada, y ante cualquier otra cosa devuelve problemas en vez de cargar medio
escenario. Rechaza JSON invalido, objetos que no son escenarios, cartas inexistentes y cualquier
version de esquema distinta de la vigente. Todo eso esta en `tests/playgroundStorage.test.js`.

Leer localStorage tambien es defensivo: una entrada corrupta se descarta en vez de tumbar la
pantalla.

El JSON exportado sirve tal cual como fixture para `tests/engine.test.js`.

## Fases

- [x] **Fase 1 — Plomeria.** `src/utils/devMode.ts`; `createCleanUiState()` extraido de `reset`;
      `loadScenario()` en el store; `src/playground/scenario.ts` + `tests/playgroundScenario.test.js`
      (registrado en `scripts/run-engine-tests.mjs`). El test de reproducibilidad compara dos
      construcciones del mismo escenario con `deepEqual` y ademas corre un turno de Horda sobre cada
      una: mismo estado, mismo `currentRandomState`.
- [x] **Fase 2 — Pantalla y acceso.** Boton flotante `Playground` a la derecha del menu principal,
      fuera del nav, solo con `IS_DEV` (`onOpenPlayground` opcional: sin la prop no se puede
      renderizar). Pantalla `lazy()` en `App.tsx`. `src/playground/PlaygroundScreen.tsx` =
      `<Board>` real + dock izquierdo colapsable (F2 o boton), barra de lanzamiento fija y pestanas
      Setup / Cards / Board / Actions / Flow, renglon de estado al pie. Al montar carga
      `BLANK_SCENARIO` para no heredar la partida que tuviera el store.
- [x] **Fase 3 — Configurar e inspeccionar.** `panels/ScenarioPanel.tsx` (Identity: nombre, seed,
      decks, dificultad, modo, setup turns y Save/Import con la lista de guardados; Starting state:
      turno/fase/lado, vida, poison, energia + energia guardada; y `BoardContents`, el contenido del
      tablero en vivo de solo lectura), `panels/CardsPanel.tsx` (buscador por nombre/ID + filtro por
      deck, boton Play y destinos validos por carta), `cardCatalog.ts` (derivado de `DECK_REGISTRY`)
      y la tira `LiveState` siempre visible (turno, fase, lado, vida, energia, guardada, libreria de
      Horda, poison, `eventQueue`, beats en vuelo; el ganador es un renglon aparte que solo sale
      cuando lo hay). Marca de sucio cuando el formulario cambio despues de lanzar: Restart reproduce
      lo lanzado, Build board adopta las ediciones.
- [x] **Fase 4 — Controles rapidos.** `playground/actions.ts` (funciones puras sobre `GameState`,
      todas escriben `lastActionResult`) + `panels/ActionsPanel.tsx`, con solo dos grupos: **Turn
      flow** (fase, turno, turno de Horda, robar) y **Energy** (add source, refill, +1 stored, drain
      all) con su medidor de pips. Se quito el grupo de Event queue: es contabilidad interna del
      engine y no significaba nada mirandola. Quitar cartas del tablero vive en su propia pestana
      `panels/BoardPanel.tsx`: la seleccion sale del store (`selectedHandId` /
      `selectedPlayerCreatureId` / `selectedHordeCreatureId`), o sea que se elige la carta
      clickeandola en el tablero real, y de ahi salen **Kill it** (`destroyPermanent`, muerte real
      con sus triggers), **Remove it** (movimiento crudo de zona, sin muerte) y el wipe por lado
      (`clearBattlefield`, silencioso: limpiar la mesa entre pruebas no puede disparar doce
      triggers). Hay test que distingue los tres con Escupefuego de la Retaguardia (`rear_guard_firebreather`).
- [x] **Fase 5 — Timeline: grabar y reproducir.** `timeline.ts` (`TimelineStep`, `executeStep`,
      `describeStep`, `isPlaygroundBusy`, `isWaitingForInput`), `panels/TimelinePanel.tsx` (toggle de
      grabacion, lista de pasos con borrar, Step / Auto / Stop) y el driver de reproduccion en
      `PlaygroundScreen`. Los paneles ya no llaman acciones directamente: todo pasa por `dispatch`.
- [x] **Fase 6 — Persistencia.** `scenarioStorage.ts` + Save / Import / Load / Export / Delete
      dentro del grupo Identity de la pestana Setup. Save fotografia el tablero vivo con
      `snapshotScenario`, no un borrador.

## Siguientes pasos

Lo que falta para el creador de flujos completo:

1. **Targets dentro del step.** Hoy un `play` con targets abre el overlay real y el replay espera al
   usuario. El siguiente incremento es guardar los targets elegidos en el propio step para que
   "entra esta carta, en su resolve targetea esta" se reproduzca solo.
2. **Grabar acciones hechas en el tablero.** Ahora solo se graba lo que sale del dock; arrastrar una
   carta desde la mano no queda registrado. Requiere un hook en el store, no diffear estado.
3. **Editor de pasos.** La lista ya se puede borrar por paso; falta reordenar e insertar a mano.

## Riesgos conocidos

1. **Saber cuando termino un paso.** Reproducir depende de detectar el fin de cada paso, y hoy eso
   esta repartido en timers dentro del store. Probablemente haga falta un `isBusy` **derivado** de
   las colas que ya existen (`summoningAnimationCount`, `hostAutoTriggerCount`,
   `hostMillAnimationQueue`, `resolvingHostCombat`...), no timers nuevos.
2. **Estado de presentacion fuera de `GameState`.** Los epochs y colas del store no viajan en el
   escenario. Cargar un escenario tiene que limpiarlos con la misma disciplina que `reset`, o
   quedan callbacks de la partida anterior apuntando al escenario nuevo.
3. **Tentacion de bypass.** Cada atajo que se salte el engine convierte al playground en un
   simulador distinto del juego, que es justo lo que no debe ser.

## Ver tambien

- `docs/testing.md` — como se verifica el proyecto
- `docs/animation_contracts.md` — contratos de animacion que el timeline debe respetar
- `CLAUDE.md` — contexto general del proyecto

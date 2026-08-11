# CLAUDE.md

Guía canónica para trabajar en este repositorio. Describe el producto y sus contratos vigentes; el
historial de la conversión a Hostfall no forma parte de esta guía.

## Producto

Hostfall es un juego PvE de cartas 1 contra Hueste. El Cronista reconstruye un Capítulo con una
Crónica; la Hueste automatizada revela su Archivo y ataca según reglas deterministas.

Stack:

- React 19 + TypeScript + Vite
- Zustand
- Framer Motion
- Tailwind/CSS
- engine y tests deterministas en Node

La pantalla principal es el juego, no una landing page. El tono es dark-medieval, táctil y cercano
a un juego de estrategia/cartas para PC de principios de los 2000. Evitar estética SaaS o glass
moderna.

## Verificación

El usuario no tiene Node global. Usar el runtime bundled:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

Según el cambio, completar con:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\lint-decks.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\card-studio-data.mjs --check
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\check-card-assets.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\audit-independence.mjs --strict
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js --config vite.config.ts build
```

La config web canónica es `vite.config.ts`; para builds manuales pasar siempre
`--config vite.config.ts`. El release toolchain está fijado en Node 24.14.x y pnpm 11.16.x mediante
`.node-version`, `packageManager` y `engines`.

No ejecutar `npm install` ni `pnpm install` salvo necesidad real: `node_modules` ya existe. No
levantar un servidor ni jugar para verificar; el usuario prueba el juego. Detalle en
`docs/guides/testing.md`.

## Estructura

```text
src/
  engine/       reglas puras y deterministas
  store/        puente engine/UI, secuencias y beats
  components/   presentación, overlays y coordinación visual
  data/         registro, normalización, lint y JSON de decks
  i18n/         vocabulario y presentación localizada
  playground/   escenarios, boards y replays de desarrollo
dev/
  tools/Decks/  Card Studio y exportación de cartas
docs/           contratos operativos, lore y procedencia; índice en docs/README.md
scripts/        verificadores y tareas vigentes
tests/          regresiones del engine, datos y herramientas
```

Separación obligatoria:

- Las reglas reales pertenecen a `src/engine/`.
- El store secuencia reglas ya resueltas y sus animaciones.
- Los componentes no deciden resultados de juego.
- Si una regla visual contiene lógica —stacking, slots, orden o elegibilidad— extraerla a una
  función pura y probarla. `src/components/battlefieldLayout.ts` es el ejemplo de referencia.
- Las acciones del engine comunican éxito o fallo mediante `game.lastActionResult`; nunca parsear
  strings de `game.log` para decidir comportamiento.

## Migración a Electron

La migración desktop necesaria para el desarrollo diario está completada. Las Fases 0-4 están
cerradas; la Fase 5 conserva validaciones comerciales pendientes y la Fase 6 se hará al preparar el
release de la demo. El documento canónico de arquitectura es `docs/electron/migration_plan.md` y
el cierre se registra en `docs/electron/migration_tracking.md`.

Contratos desktop vigentes:

- Conservar el build web hasta estabilizar Steam.
- El congelamiento de contenido terminó: se pueden volver a modificar los JSON authored y añadir
  cartas/decks. Un cambio de schema debe seguir siendo deliberado, versionado y cubierto por lint y
  tests; no hacerlo incidentalmente dentro de otro cambio.
- Playground sigue siendo tooling de desarrollo y no entra al paquete Steam.
- Card Studio sigue siendo una herramienta local bajo `dev/tools/Decks/`; Electron consume sus
  outputs runtime, no reemplaza ni empaqueta el estudio.
- Preservar `studio.config.json`, `game-art.config.json`, `deck-data.generated.js`,
  `cardStudioGameArt.generated.json`, `cardRuntimeLayout.generated.json`, los PNG finales y el arte
  fuente referenciado.
- El staging de release excluye Card Studio, `exported-png` y fuentes no usadas, pero debe demostrar
  que incluye todo PNG, arte recortado y metadata generada que consume el juego.
- No implementar fuentes Local/Workshop hasta que la identidad calificada y la validación external
  estén terminadas.
- El contenido runtime nace en `src/content/bootstrap.ts`: sólo `BuiltinContentSource` está activo,
  `ContentCatalog` es un snapshot inmutable y `src/data/decks.ts` es una fachada temporal.
- Los IDs authored siguen intactos. Usar `hostfall.core/<deckId>` y
  `hostfall.core/<deckId>/<cardId>` cuando se necesite una clave canónica; los aliases legacy
  permanecen durante la migración.
- Los paths `/cards/...` son referencias lógicas del pack builtin. El adapter web conserva esas
  URLs y el build Electron activa `hostfall://content/...`; main sólo sirve archivos indexados de
  roots registrados.
- El renderer release no puede contener recursos remotos, `?playground`, `PlaygroundScreen` ni
  `AudioLabScreen`. Verificarlo con `scripts/audit-offline-runtime.mjs` después de `build:web`.
- `docs/data/generated/runtime_asset_inventory.json` es la proyección reproducible del contenido de `dist`; se
  regenera sólo después de un build release intencional.
- Fase 3 usa Electron 43.3.0 + Forge 7.11.2 exactos. El código está en ASAR, cards/fonts son
  `extraResources`, Card Studio/Playground no se empaquetan y los gates automáticos son
  `electron:verify` + `electron:smoke`.
- La carga llama `prewarmGameVfx`: crea el único renderer WebGL, reserva el framebuffer y compila
  Burn, Phong, Basic, Sprite y Line antes del primer efecto visible. Sus escenas mínimas quedan
  retenidas para conservar los programas GPU; no crear renderers nuevos en los animadores.
- Fase 4 separa `profile/preferences-v1.json`, `profile/saves/resume-v1.json` y el local-only
  `local/window-state-v1.json`. El contrato, backups, recuperación, Cloud-worthy data y checkpoints
  seguros están en `docs/electron/persistence.md`.
- El resume guarda sólo `GameState` estable y claves calificadas; nunca Zustand, UI, timers,
  animaciones o Playground. `backgroundThrottling: true` es final y el lifecycle pausa/reanuda audio.
- Pantalla completa se controla desde ambos menús o F11 y se persiste con el estado local de
  ventana. No implementar otro canal IPC para esta función.
- Fase 5 genera `.electron-staging/resources` exclusivamente desde manifests runtime: 61 PNG,
  61 artes de campo, 57 audios y 6 fuentes. `app.asar` no contiene audio ni source maps; Card Studio,
  Hunters y autoría no entran. El contrato y los blockers comerciales viven en
  `docs/electron/release.md`.

## Vocabulario Hostfall

Leer `docs/reference/game_vocabulary.md` antes de cambiar nombres, tipos, zonas, fases, Rasgos, reglas o
tooltips. Leer también `docs/reference/card_text_rules.md` antes de redactar o modificar texto impreso,
puntuación de reglas o elecciones de objetivos.
La gramática de cartas es propia de Hostfall y no depende de convenciones o reglas externas.

Contratos principales:

- Cronista / Chronicler; Crónica / Chronicle; Hueste / Host; Capítulo / Chapter.
- Zonas authored: `ARCHIVE`, `HAND`, `FIELD`, `MEMORY`, `OBLIVION`.
- Zonas runtime: `archive`, `hand`, `field`, `memory`, `oblivion`.
- Tipos: `ECHO`, `SOURCE`, `SPELL`, `SUPPORT`, `TOKEN`.
- Modificadores: `QUICK`, `CHRONICLE`.
- Recurso único: Energía, con `energyPool.available` y `energyPool.stored`.
- Estadísticas: Fuerza y Aguante (`power`, `endurance`).
- Estados: `exhausted`, `stabilizing`, attacking y defending según el contexto.

La UI española no muestra nombres ingleses de identidad. No agregar proveedores remotos de cartas,
metadata externa ni arte no local.

`scripts/audit-independence.mjs` es una guarda permanente contra regresiones, no un migrador.

## Estado jugable

Decks vigentes:

| Bando | Id | Nombre | Estado |
| --- | --- | --- | --- |
| Cronista | `pact_of_elarion` | El Pacto de Elarion | Jugable |
| Cronista | `court_of_the_crimson_eclipse` | La Corte del Eclipse Carmesí | Jugable |
| Hueste | `uprising_of_the_graveless` | El Alzamiento de los Sinsepulcro | Jugable y predeterminada |
| Hueste | `legion_of_varka` | La Legión de Varka | Jugable |

Cazadores es sólo un preview de Card Studio: no tiene deck runtime ni lote final de PNG.

Contratos particulares de la Corte: Paje de la Sed exige estar preparado en la primera pérdida
de Vida del turno; Duelista del Eclipse no puede actuar mientras está Estabilizándose; Mirevna
paga la mitad de la Vida actual redondeada hacia arriba.

Contratos particulares de la Legión: Todos contra uno cuenta sólo Trasgos atacantes con Fuerza 2
o menos; Vardek crea Esbirros atacando según su Fuerza después de recibir el contador; el daño de
entrada de Varka se resuelve como un único evento; la antigua Acción de sacrificio del Forjador
está retirada y no debe reintroducirse.

Chaos Mode está deprecated y oculto. Se conserva únicamente por compatibilidad y pruebas; no debe
recibir features sin una decisión explícita.

El Playground usa `ScenarioDefinition` v4 y namespaces v3 para boards/replays. JSON de versiones
anteriores se rechaza; no hay ruta de conversión. Las preferencias activas usan namespaces
`hostfall-*`.

## Reglas base

### Cronista

Tiene Vida, Archivo, Mano, Campo, Memoria, Olvido y Energía. Puede Jugar Fuentes, Ecos, Apoyos y
Hechizos según la fase; atacar a la Hueste y defender sus ataques.

El pago automático consume primero Energía almacenada y luego Agota sólo las Fuentes necesarias.
Las Fuentes restantes pueden convertirse en reserva al terminar el turno. El límite de Energía
almacenada es 3.

### Hueste

No tiene Vida ni Mano. Usa Archivo, Campo, Memoria y Olvido. Su `rulesProfile`, authorizado en el
JSON del deck, define revelados, Mini Oleada, Oleada, descarte por daño/Veneno e Ímpetu.

- Revela automáticamente y se detiene según el perfil del deck.
- Ataca con todos los Ecos capaces; no toma decisiones tácticas.
- El daño recibido descarta cartas de su Archivo a su Memoria según
  `damagePerArchiveDiscard`.
- Veneno acumula presión y descarta según `poisonPerArchiveDiscard`.
- Gana el Cronista cuando la Hueste se queda sin amenazas/Archivo; pierde al llegar a 0 de Vida.

No implementar un parser general de texto ni precisión completa de otro TCG. Cada regla debe ser un
efecto explícito y determinista.

## Decks y cartas

Los decks viven únicamente bajo `src/data/decks/`. `DECK_REGISTRY` es el único punto de registro.
El schema authored vigente es `1.0.0`.

Flujo de datos:

```text
JSON authored
  -> authoredDeckNormalizer (casing de zonas y defaults de autoría)
  -> normalizeDeck (modelo runtime)
  -> engine/store/UI
```

El JSON runtime es la fuente de verdad de identidad y reglas. Toda carta tiene `flavorText.en`,
`flavorText.es` y `showFlavorText`; ocultar flavor en el layout no permite borrarlo de los datos.

Las habilidades con `engineSupport: "pending"`, `"ignored"` o `"custom"` no se ejecutan a medias.
El deck lint informa las pendientes y rechaza cualquier efecto o handler desconocido sin marcador.
`EffectResolver` contiene el registro genérico de efectos y su metadata de presentación.

No programar cartas por nombre. La excepción bespoke actual es `tribute_of_the_four_sorrows`, declarada
`engineSupport: "custom"`, cuya secuencia vive en `src/store/tributeOfTheFourSorrowsSequence.ts` y
`src/components/TributeOfTheFourSorrowsSelectionOverlay.tsx`.
Su texto impreso debe describir también los pasos de la Hueste que ejecuta esa secuencia custom.

Para agregar o implementar cartas, seguir `docs/guides/adding_cards.md`. Documentación específica:

- `docs/reference/card_text_rules.md`
- `docs/content/chronicle_pact_of_elarion.md`
- `docs/content/host_uprising_of_the_graveless.md`
- `docs/content/host_legion_of_varka.md`
- `docs/content/goblin_cards.md`

## Arte y Card Studio

Los manifests de imagen usan sólo `source: "local"`. El arte fuente está separado del PNG de carta
completa, normalmente en `public/cards/<deck>/art/`. Nunca apuntar un generador al PNG final de su
propia carpeta.

Card Studio consume `deck-data.generated.js`, generado desde el JSON runtime. La proyección contiene
ES/EN y el Taller elige el idioma sin duplicar reglas, nombres o flavor en HTML/configuración.
Español es el valor predeterminado. `export_cards.cjs <deck> --lang en` escribe sólo en
`exported-png/en/`; únicamente la exportación española actualiza `public/cards/`, el layout runtime
y la huella de `check-card-assets.mjs`. Los idiomas futuros se registran de forma central; chino
requiere una fuente CJK local antes de habilitarse.
Los contadores `+1/+1` declarados en `entersWithCounters` se suman a los stats base impresos, para
que la carta muestre las estadísticas con las que entra realmente al Campo.

Los cinco estudios usan `deck-card-studio.js` y `deck-card-studio.css`: existe una sola estructura
de carta y los decks sólo aportan variables de tema, motivo e insignia. El diseño común usa marco
metálico, panel de reglas y motivo. El diseño *full art* no usa marco metálico ni motivo y se aplica
por defecto a todo Eco `CHRONICLE`, a toda Energía `SOURCE` y a los tokens cuyo manifest de
imágenes declare `fullArt: true`; el taller permite sobrescribirlo con `fullArt` por carta. Las
Energías no imprimen coste, reglas ni flavor. Los tokens no imprimen reglas ni flavor y llevan los
stats más abajo. No crear variantes copiadas por deck.

El fade superior de las cartas comunes se controla por carta con `headerFade`; no modifica las
variantes *full art* ni su fade inferior.

Los Ecos recortados del campo usan directamente el arte fuente cargado en Card Studio. Su encuadre
independiente (`battlefieldArtFrame`) vive en `dev/tools/Decks/<deck>/game-art.config.json` y se
proyecta a `src/data/cardStudioGameArt.generated.json`. La referencia canónica es 488×434 px. Este
sidecar no forma parte de la huella de impresión: mano, hover, detalles, colección y animaciones
siguen usando el PNG completo.

Cada carta imprimible declara un `collectorId` global en el JSON runtime. El Acto I usa la serie
continua `HFA1xxx`; `studio.config.json` sólo aporta `defaultArtist` o una excepción `artist` por
carta. El renderer imprime un icono de ilustración seguido del nombre del artista dentro del marco.

`showFullCardImage` permite que mano, targeting y previews usen la carta completa. Los stats y
Estados runtime deben seguir superponiéndose cuando cambian durante la partida.

## Campo, targeting y combate

- Las copias pueden agruparse visualmente, pero el grupo y el slot deben permanecer estables durante
  una secuencia de la Hueste. Sólo Ecos sostienen o heredan slots.
- `battlefieldCardOrder`, `battlefieldGroupKeys` y `battlefieldGroupMeta` protegen el orden visual.
- Los targets válidos deben ser claros sin bordes finales exagerados.
- Una Reacción manual de Invocación con target es obligatoria; no depende del id de Aelyra.
- El ataque del Cronista y la defensa contra la Hueste usan overlays y estados explícitos. No
  resolver reglas de combate dentro de animadores.
- Las presentaciones personales de pelea y ataque directo se registran en
  `src/store/combatAnimation.ts` por identidad estable y contexto ya resuelto. El preset de Vaelor
  reemplaza el movimiento por una bola de fuego esmeralda a escala 1.8 cuando defiende, mata al
  atacante y sobrevive, o cuando ataca directamente el panel de vida de la Hueste. En ataques con
  proyectil, la reacción de golpe del panel espera el `impactMs` del preset. El Rasgo canónico de
  Vaelor es `FLYING` (Volar), no `SKYGUARD` (Guardia aérea).
- Los efectos de daño causado por una carta y las peleas iniciadas por efectos consultan el mismo
  registro de ataques personales. Choque de Ecos reutiliza la presentación del aliado elegido y
  aplica el daño en su `impactMs`; Escudo de la Heredera termina primero su beat de buff y aplica
  ambos daños simultáneos en el `impactMs` del preset, usando la fuerza ya aumentada. La Hidra de la
  Fronda Negra registra una mordida de vampiro con paleta verde venenosa, tanto al atacar
  directamente como cuando un efecto la hace infligir daño a otra carta.
- Si una pelea con dos presentaciones personales deja una sola carta viva, sólo la ganadora puede
  reclamar la animación bespoke. Si no tiene preset, se usa la pelea normal; cuando ambas sobreviven
  o ambas mueren, el atacante conserva la prioridad visual sin cambiar el impacto simultáneo.
- Varka usa dos bolas de fuego amarillo-doradas simultáneas a escala 1.3 cada vez que ataca:
  nacen de los bordes izquierdo y derecho de su carta, convergen sobre el defensor asignado o, si
  no tiene defensor, sobre el panel de Vida del Cronista, y producen un solo impacto de reglas.
  Todo evento Burn cuyo origen sea Varka usa su material amarillo-dorado y escala 1.3, incluida su
  descarga de entrada contra el Cronista y cada enemigo. Esa descarga muestra una ruta por cada objetivo sin
  tope visual: el límite de seis pertenece a cada pasada del shader y las descargas mayores se
  reparten en varias pasadas sobre el mismo canvas y reloj.
  Vaelor, al ser Invocado, captura todos los enemigos actuales y lanza a la vez una bola esmeralda
  a cada uno con el mismo material y escala 1.8 del preset de su defensa; sólo esta descarga de
  entrada conserva una trayectoria curva. Todas las demás bolas de fuego viajan en línea recta.
  El impacto
  coloca un contador -1/-1 sobre cada objetivo como un único evento simultáneo, sin daño adicional.
- Todos contra uno usa el renderer procedural de fuego a escala 1.2. Todos los Burn registrados
  usan el shader procedural; el renderer clásico DOM/CSS queda sólo como implementación legada.
- El Burn procedural no monta el destello DOM de pantalla completa del renderer clásico. Su
  impacto se comunica con la explosión WebGL, la chamusquina del objetivo y el número de daño.
- `sharedVfxRenderer.ts` crea el único contexto WebGL de forma diferida al primer efecto y lo
  conserva durante el resto de la sesión. Burn reutiliza ese contexto compartido: los ataques
  consecutivos, incluidas varias Varkas apiladas, no deben forzar su pérdida ni recrearlo entre
  beats. Su canvas 2D de destino debe permanecer oculto mientras no exista un Burn activo y durante
  cada handoff hasta que el nuevo efecto haya copiado su primer frame WebGL válido.
- Reflejos se resuelve antes del daño normal; el daño simultáneo se confirma como un solo resultado
  aunque los impactos visuales se escalonen.

Consultar `docs/reference/animation_contracts.md` antes de tocar combate, revelados, muerte, buffs, Burn o
activaciones estáticas.

## Contrato de animación

Las animaciones son beats en cola. El orden observable es parte de la UX:

1. se resuelve la regla;
2. se identifica la fuente y los targets;
3. se reproduce un beat legible;
4. sólo entonces continúa la siguiente reacción.

No lanzar efectos relacionados todos a la vez. No recentrar el campo entre beats. Un pulso de
fuente no debe repetirse cuando el mismo evento continúa inmediatamente con líneas, proyectiles o
impactos. Los resets incrementan `hostSequenceEpoch` para invalidar callbacks viejos.

VFX y Three.js: consultar `docs/reference/vfx_and_threejs.md` y reutilizar materiales/animadores existentes
antes de crear otra implementación.

## UI y audio

- Paneles oscuros, bordes dorados/café, botones redondeados y materiales físicos.
- Evitar copy técnico cuando puede expresarse como acción de juego.
- `CardPreview` y Details deben reflejar reglas, Rasgos, stats y estados reales.
- Badges de Rasgo y Estado no comparten semántica visual.
- Overlays y previews deben respetar los z-index documentados en los propios componentes/CSS.
- El audio pasa por el sistema central y respeta mute/volumen. No crear `Audio` dispersos en
  componentes.
- Los SFX del pase nuevo permanecen registrados en el Taller de Sonidos y se activan de forma
  individual mediante `AUDIO_FEATURE_FLAGS`; apagar un flag no debe ocultar su clip del Taller.
- La música cambia al tema de clímax cuando la Vida del Cronista baja del umbral configurado.

## Developer mode

El seed literal `developer` activa una preparación determinista para probar cartas y secuencias.
Es una herramienta, no parte del lore. Si se añade una carta que necesita setup especial, preferir
preparación genérica por tipos/efectos antes que un puente permanente por `definitionId`.

## Dirección narrativa futura

Las seeds podrán presentarse dentro del mundo como **Semillas del Destino**: líneas temporales que
el Cronista contempla, reescribe y finalmente preserva. El tutorial, el historial de intentos y la
posible opción de menú asociada están bosquejados en `docs/plans/seeds_of_destiny.md`. Es una dirección de
diseño pendiente, no una funcionalidad implementada. El seed `developer` queda expresamente fuera
de esta narrativa.

Antes de implementar el tutorial obligatorio, la claridad permanente de Preparación, robo, Acción de
Fuente, Reserva y ataque al Archivo debe seguir el plan de diseño e implementación de
`docs/plans/ui_core_rules_clarity_plan.md`. Cada fase empieza con una conversación de UI y requiere
aprobación del usuario antes de editar código; la preparación técnica queda subordinada al diseño
aprobado y el plan no autoriza por sí solo cambios de reglas ni la implementación del tutorial.

Estado vigente de ese plan: las Fases 1 (Preparación), 2 (Archivo y próximo robo), 3 (Acción de
Fuente) y 4 (Reserva y orden de pago) están cerradas; la Fase 5 (ataque al Archivo de la Hueste)
está implementada y pendiente de QA visual del usuario. Su contrato es: panel **Archivo de la
Hueste**, conteo `actual → restante`, resultado físico reducido a siluetas y `N`, y tooltip secundario
**Cálculo del ataque** con la operación compacta `Fuerza ÷ umbral → resultado`. El preview usa
`hostRules.damagePerArchiveDiscard`, se limita al Archivo restante y desaparece cuando comienza la
resolución animada. Los CTA son **Elegir atacantes**, **Atacar el Archivo** y **Pasar el combate**.
`playerDrawForecast` en
`src/engine/TurnManager.ts` es la fuente única para el robo real y su previsión. La devolución
conserva el gesto amplio hacia la derecha y sólo expande visualmente el Archivo durante un arrastre
que `canPlayerRecycleEnergy` considera válido; la UI no debe volver a duplicar esas condiciones.

La esquina inferior derecha es una sola fila `[Memoria][Archivo][Vida]` de altura común
(`.player-vitals-row`). Memoria y Archivo son la misma caja de cartas —`.card-pile`, con su tapa
superior dentro del marco y su nombre impreso en la base— y sólo la Vida conserva el panel de
vitals. La Memoria de
la Hueste usa esa misma caja en fila con su panel; ninguna de las dos vuelve a ser un botón que
asome por detrás del marco. El Archivo del Cronista no
debe volver a presentarse como una estadística apilada sobre la Vida: la Hueste sí muestra su
Archivo como barra de vida y esa lectura no debe contagiarse al Cronista. El robo normal no se
imprime nunca; sólo aparece una insignia `+1` cuando `playerDrawForecast` supera una carta. Durante
un arrastre válido de Devolver Fuente la caja del Archivo se enciende y crece; el texto de la acción
pertenece a la etiqueta flotante del arrastre y no vuelve a un panel propio.

## Preferencias de trabajo

- Cambios pequeños y verificables.
- Explicar un flujo confuso antes de rediseñarlo ampliamente.
- UI orientada al gameplay, no a diagnósticos internos.
- Feedback visual fuerte pero legible; targets claros sin exageración.
- Conservar balance y mecánicas actuales salvo aprobación explícita para rebalancear.
- No reabrir fases o rediseños terminados sólo porque la arquitectura permita hacerlo.
- No reintroducir features retiradas.

Al arreglar un bug reproducible en lógica pura, escribir primero la regresión y confirmar que falla
contra el código anterior. Después aplicar la corrección.

## Antes de tocar algo

Leer el archivo específico y sus consumidores. Como rutas de entrada:

- Reglas: `src/engine/GameTypes.ts`, `GameActions.ts`, `EffectResolver.ts`.
- Secuencias: `src/store/useGameStore.ts`, `hostBeats.ts`, `presentationEffects.ts`.
- Cartas: `docs/guides/adding_cards.md`, `docs/reference/card_text_rules.md`, JSON del deck, `normalizeDeck.ts`,
  `deckLint.ts`.
- Campo: `Battlefield.tsx`, `battlefieldLayout.ts` y sus tests.
- Targeting: `Targeting.ts` y el overlay correspondiente.
- Combate: `CombatResolver.ts` y `docs/reference/animation_contracts.md`.
- VFX: `docs/reference/vfx_and_threejs.md`.
- Modos: `docs/plans/game_modes.md`.

La prioridad del proyecto es una experiencia PvE clara, animada y determinista: reglas explícitas,
datos genéricos, feedback visual fuerte y ninguna identidad ajena en el producto final.

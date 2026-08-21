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
- El renderer release no puede contener recursos remotos, `?playground`, `PlaygroundScreen`,
  `AudioLabScreen`, `SeedExplorerScreen` ni `UIReferenceScreen`. Verificarlo con
  `scripts/audit-offline-runtime.mjs` después de `build:web`.
- `docs/data/generated/runtime_asset_inventory.json` es una captura diagnóstica del último build
  release aprobado. No es un gate de desarrollo ni del CI básico y puede quedar desfasada entre
  releases; se regenera sólo después de un build release intencional.
- Fase 3 usa Electron 43.3.0 + Forge 7.11.2 exactos. El código está en ASAR, cards/fonts son
  `extraResources`, Card Studio/Playground no se empaquetan y los gates automáticos son
  `electron:verify` + `electron:smoke`.
- La carga llama `prewarmGameVfx`: crea el único renderer WebGL, reserva el framebuffer y compila
  Burn, el vórtice del Destino, el vidrio y la onda de la derrota, Phong, Basic, Sprite y Line antes
  del primer efecto visible. El vidrio se monta justo cuando la Vida llega a 0, así que compilarlo
  entonces costaría un tirón en el peor momento. Sus escenas mínimas quedan retenidas para conservar
  los programas GPU; no crear renderers nuevos en los animadores.
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
- Letal se describe como «Si este Eco hace cualquier cantidad de daño a otro Eco, ese Eco muere»;
  no se usa «daño positivo» ni se define el Rasgo con la propia palabra «letal».

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
- La derrota normal rompe la pantalla con `DefeatShatterAnimator.tsx` y su referencia canónica es la
  maqueta `dev/mockups/vfx/future-shattered-3d.html`. Cada triángulo del plan estable por seed de
  `defeatShatterGeometry.ts` es un **prisma extruido** —cara frontal, trasera y tres muros—, y toda
  la animación vive en el vertex shader de `defeatGlassShader.ts`: una malla y una llamada de dibujo.
  Cada cara recibe mediante UV globales el recorte exacto del último frame visible.
- `Board` no inicia la derrota sólo porque `resolvingHostCombat` volvió a `false`: drena toda la
  presentación finita que ya estaba en curso. La barrera incluye ataques, habilidades de entrada,
  muertes, invocaciones, colas, buffs y VFX locales registrados (impacto de Vida y aterrizaje
  pesado); el disco de grados hace snap bajo epsilon y confirma la revisión monotónica exacta de su
  objetivo, de modo que `0 → 7 → 0` no puede confundirse con un disco que nunca se movió. Después espera dos
  paints consecutivos sin una animación finita del documento, ejecuta una única limpieza global y
  vuelve a comprobar el compositor. Recién entonces pide una captura nativa mediante
  `webContents.capturePage()`, limitada en el proceso main a
  2560×1440 y decodificada de forma asíncrona. Es una captura de los píxeles ya pintados: no clona
  el DOM, no recalcula estilos y no vuelve a resolver URLs de cartas, fuentes ni portales. La placa
  es deliberadamente opaca e incluye la composición completa de ese instante; la transparencia la
  abren después los huecos entre los prismas. En web o si falla el bridge se usa vidrio limpio, sin
  serializador DOM ni color opaco de reserva. Un watchdog de 15 s existe sólo como salida de
  emergencia para un token defectuoso: invalida la presentación huérfana y fuerza el frame exacto
  del disco; no acorta ningún beat de la ruta normal.
- El overlay sólo se monta cuando esa preparación termina. Antes de arrancar el reloj visible, el
  animador hace un render oculto que crea/reutiliza el contexto, sube la textura fullscreen y
  completa la primera copia WebGL→2D. Así ningún coste de captura, decodificación o primera subida
  cae dentro del cuarteado. Tras pintar la placa, el frame siguiente aplica
  `body.is-defeat-plated`: retira el tablero vivo, pero conserva `TemporalBackdrop` y
  `.game-screen-ambience` renderizando debajo. Los trozos llevan el espacio congelado del instante
  capturado y los huecos revelan inmediatamente el espacio vivo; no hay handoff a negro. Si no hay
  captura nativa, el tablero permanece visible hasta el golpe.
- Nada cambia de color antes de que el vidrio se rompa. No hay sello frío sobre la captura, ni capa
  de hielo en el DOM, ni viñeta encendida de salida: la pantalla se ve igual que un instante antes
  y lo primero que ocurre es el cuarteado. Reintroducir un tinte previo es una regresión.
- El reloj de la derrota conserva el ritmo de la maqueta salvo por el anclaje a la presentación:
  el cuarteado empieza en el primer frame visible tras terminar todos los beats anteriores, la onda y el impulso
  llegan en el golpe, y el desenlace se nombra 1340 ms después. El desenlace se cuelga
  del golpe real mediante `onBurst`, no de un reloj propio del modal. La lámina entera tiene
  espesor cero —los muros vecinos coinciden y en escorzo asomarían como aristas doradas en
  z-fighting— y sólo gana grosor al separarse. Las magnitudes del diseño se dieron sobre un plano de
  alto 1 y llegan al shader escaladas por `uScale`; no reajustarlas convierte la tensión del
  cuarteado en un salto visible.
- Lo que se rompe es el último frame visible y lo que queda detrás es el **espacio exterior del
  propio juego**, no un fondo aparte. La escena de la derrota no dibuja fondo: su lienzo queda
  transparente fuera de los prismas y lo que asoma por cada hueco es el `TemporalBackdrop` vivo,
  sin teñir. El espacio ya no se enrojece al perder: ese intento quedó retirado y no debe
  reintroducirse. `body.is-defeat-plated` retira el tablero vivo y el retículo; sólo el cielo y la
  capa de ambiente permanecen animados debajo. No existe un abismo procedural ni un oscurecimiento
  de CSS detrás del vidrio. El golpe
  tampoco monta destello DOM ni temblor de pantalla: lo cuenta la onda WebGL aditiva. En el DOM sólo
  quedan el hielo, las quebraduras SVG, la viñeta y el texto. Vidrio y onda comparten escena porque
  `renderSharedVfxFrame` dibuja una escena con una cámara, y el fotograma se pide en
  `LinearEncoding`: la conversión sRGB aclara la captura y enfría mal el Fresnel. Reutiliza el
  renderer WebGL compartido y conserva una fractura SVG quieta para movimiento reducido o falta de
  WebGL; ese respaldo también retira el tablero y deja ver el espacio.
- El desenlace no lleva mancha propia detrás y la viñeta cierra a 0.42, no a 0.72: ahora cae sobre
  el espacio real y apretarla más lo deja negro por los bordes.
- El desenlace se centra con una capa a pantalla completa y su bloque no lleva `transform` propio.
  Dos cosas lo pisarían: la regla genérica `.game-screen [role="dialog"]`, que impone
  `game-surface-in` y termina en `translateY(0) scale(1)`, y la succión del vórtice al Reescribir,
  que anima `transform` sobre cada pieza de la escena. Con un `translate` propio, el texto se
  descuelga hacia abajo y a la derecha justo antes de la transición.
  Las líneas **Lost Future** y el CTA de `learn-to-play` compensan además el espacio terminal de su
  `letter-spacing`, de modo que su centro óptico coincida con el centro geométrico.
- El desenlace es el bloque de la maqueta, ampliado un paso: etiqueta **Derrota** con reglas
  laterales, título en dos líneas que se abren desde el centro con su corte de luz, subtítulo y
  placa de **Futuro**. Copiar identidad vive en el canto de la placa. **Contemplar otro futuro** no
  lleva icono y comparte una única fila, sin partir texto, con **Reescribir este futuro**; no vuelve
  a envolverse en un panel de resultado genérico.
- La victoria normal no rompe nada: su referencia canónica es `dev/mockups/vfx/destiny-constellation.html`
  y la resuelven `VictoryConstellationAnimator.tsx`, `destinyConstellationGeometry.ts` y
  `destinyConstellationShader.ts`. Motas de luz entran desde puntos deterministas fuera de los
  cuatro bordes, encienden el corazón y una a una las ocho puntas, y el contorno se traza detrás;
  cada hilo espera a sus **dos** extremos. Al cerrarse, el corazón suelta una única onda circular y
  la figura se queda encendida: no se desvanece.
- La constelación **no tiene geometría propia**. Es la misma rosa cardinal de
  `chronicleSigilGeometry.ts` construida sobre el radio del aro del disco de grados, así que se
  enciende exactamente encima del instrumento que ya está en el tablero. Darle un tamaño propio la
  convierte en otra estrella pegada sobre la pantalla. La semilla cambia el reparto y el fraseo de
  las motas, nunca el giro. Lo único que añade la victoria es el reloj de construcción.
- Como la rosa es cardinal y fija, el disco vuelve a **000°·N arriba** mientras las motas todavía
  viajan: `northUprightDialDegrees` da el múltiplo de 360 más cercano, de modo que el recorrido es
  el mínimo y no se lee como un aparato reiniciándose. Es sólo presentación —`Board` pasa el ángulo
  recolocado a `TemporalBackdrop`— y no toca el ángulo acumulado del store ni la revisión, así que
  la barrera del desenlace no se reabre.
- El interior de la rosa se dibuja con las **incisiones sin área** del signo (`axis * 0.24` a
  `axis * 0.68`), no con cuñas rellenas. Las cuñas se ensanchaban hacia el centro y sus ocho áreas
  se sumaban ahí, dibujando una segunda estrella dentro de la rosa que le quitaba el protagonismo
  al corazón y a las puntas. Volver a rellenar el interior es una regresión, y el guard cubre
  también la maqueta.
- La construcción es muda: no lleva un cue por punta. La acompaña el tema de victoria.
- No hay captura, ni placa, ni tinte: `body.is-victory-clearing` retira el HUD y las cartas con el
  espejo de su propia entrada —arriba hacia arriba, abajo hacia abajo, el Campo creciendo un
  punto— y conserva `TemporalBackdrop` completo, incluido el retículo, más `.game-screen-ambience`.
  Cada salida termina en `visibility: hidden`: la succión del vórtice al Reescribir anima
  `transform` y `opacity` con la API de animaciones y devolvería el tablero ya retirado a la vista.
- La barrera de presentación es común a los dos desenlaces (`outcomePresentationActive`,
  `outcomeOutroReady` y el watchdog de 15 s en `Board`): la derrota la drena para capturar su frame
  exacto y la victoria para no empezar a retirar el tablero encima de un beat en curso. El tema de
  victoria entra con el desenlace, no con el último golpe.
- El desenlace reutiliza la estructura de la derrota con la paleta dorada: etiqueta **Victoria** con
  reglas laterales, título en dos líneas que se abren desde el centro con su corte de luz, subtítulo
  y placa de **Futuro** con los dos rombos del canto. Copiar identidad vive en el canto de la placa
  y las dos salidas son las mismas. El estandarte y el panel genéricos de resultado quedaron
  retirados: sólo la Oleada los conserva.
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

La Mano separa tres transformaciones que no deben volver a compartir el mismo nodo: el slot exterior
anima entrada/salida y reorganización; una capa intermedia posee el drag; la carta interior posee el
abanico y el hover. Toda carta robada después del reparto inicial nace en el centro DOM del Archivo
del Cronista (`data-player-archive-origin`), y un robo múltiple comparte ese origen con entradas
escalonadas. `AnimatePresence` mantiene el hueco fuera del layout mientras la carta sale para que las
restantes se reorganicen con spring en vez de saltar. El contrato completo está en
`docs/reference/animation_contracts.md`.

VFX y Three.js: consultar `docs/reference/vfx_and_threejs.md` y reutilizar materiales/animadores existentes
antes de crear otra implementación.

## UI y audio

- Paneles oscuros, bordes dorados/café, botones redondeados y materiales físicos.
- Evitar copy técnico cuando puede expresarse como acción de juego.
- `CardPreview` y Details deben reflejar reglas, Rasgos, stats y estados reales.
- Badges de Rasgo y Estado no comparten semántica visual.
- Overlays y previews deben respetar los z-index documentados en los propios componentes/CSS.
- Los botones contextuales de Acción de una carta conservan el contenido semántico propio de su
  coste y efecto; sólo su placa e interacción reutilizan el material del botón **Continuar** del
  tutorial, sin volver a la placa recortada legacy.
- El audio pasa por el sistema central y respeta mute/volumen. No crear `Audio` dispersos en
  componentes.
- Los SFX del pase nuevo permanecen registrados en el Taller de Sonidos y se activan de forma
  individual mediante `AUDIO_FEATURE_FLAGS`; apagar un flag no debe ocultar su clip del Taller.
- La música cambia al tema de clímax cuando la Vida del Cronista baja del umbral configurado.

## Sistema de UI player-facing

La referencia canónica está en `docs/reference/ui_system.md`. `src/ui-system.css` contiene los
tokens y primitivas runtime; `src/ui-reference/UIReferenceScreen.tsx` monta componentes reales y
`uiReferenceCatalog.ts` documenta para cada uno el archivo y **Dónde se usa**.

La sección **Modales y diálogos** abre una sola muestra a tamaño real. Si un modal necesita estado
controlado, la vista presentacional debe ser la misma que usa su wrapper runtime; los resultados
exponen el panel de UI sin ejecutar sus animadores. Los diálogos anclados a una sesión viva de Board
se registran como **Revisar en contexto**.

Sólo el juego ejecutable decide esta referencia. No usar `dev/mockups`, VFX, animadores ni el estilo
de Playground/Audio Lab/Seed Explorer para diseñar UI player-facing. No añadir `old-*` a UI nueva:
esas clases son compatibilidad legacy dependiente de contexto. Toda pieza reutilizable nueva o
alterada debe actualizar su specimen o quedar marcada para revisión en su pantalla real; nunca
crear una réplica exclusiva del catálogo.

UI Reference es dev-only y se abre desde el dock del home. El release no puede contener su módulo,
ruta, etiqueta ni chunk. Su CSS sólo organiza la herramienta bajo `.ui-reference-*`; los estilos
canónicos siempre viven en código compartido por el runtime.

## Developer mode

El seed literal `developer` activa una preparación determinista para probar cartas y secuencias.
Es una herramienta, no parte del lore. Si se añade una carta que necesita setup especial, preferir
preparación genérica por tipos/efectos antes que un puente permanente por `definitionId`.

El Playground incluye una pestaña dev-only **Guide**. Monta un fixture exacto de Elarion sobre el
Board real y diagnostica el ciclo de pausa, la intención autorizada, receipts, tokens visuales y
beats retenidos. No es el guion ni el copy de la Primera Semilla y no entra al bundle de release.

## Semillas del Destino

Las seeds normales se presentan dentro del mundo como **Semillas del Destino**: líneas temporales
que el Cronista contempla, reescribe y finalmente preserva. Cada seed recibe una identidad
cosmética determinista **Futuro `NNN·NNN`**; ese código compacto puede colisionar y nunca reemplaza
la seed real. **Copiar identidad** copia la seed completa aunque la UI sólo muestre el Futuro.

Las **Canon Seeds** usan el contrato `HF1-PPP-HHH-XXD-XXX`. `PPP` y `HHH` son códigos estables de
deck (`ELA`/`CEC` para Cronista y `GRV`/`VRK` para Hueste); los cinco caracteres repartidos alrededor
de `D` son entropía `A-Z`/`0-9`. El dígito de dificultad no entra al RNG: `1`, `2` y `3` resuelven
Fácil/Normal/Difícil y derivan 4/3/2 turnos de Preparación respectivamente. El código no se traduce,
no contiene checksum y una entrada válida escrita manualmente es una Canon Seed comunitaria. Sólo
un catálogo bundled externo al código puede marcarla como oficial.

`src/content/CanonSeed.ts` es el codec y registro vigentes de `HF1`. Sólo su entropía alimenta
`hashSeed`. `src/engine/InitialDeckOrder.ts` prepara los pools y conserva el stream único de RNG:
primero baraja la Crónica y después la Hueste. `createInitialGame` consume esa misma costura; las
seeds técnicas `developer`, `devlost` y `devwin` permanecen fuera de Canon y conservan sus ramas.
Un cambio incompatible de códigos, contenido o reglas deterministas exige otro prefijo, no puede
reinterpretar silenciosamente una Canon Seed `HF1` publicada.

El Seed Explorer interno tiene ya su núcleo puro en `src/playground/seedExplorer.ts` y
`seedExplorerSearch.ts`. Enumera la entropía base 36 sin `Math.random`, proyecta Mano, un mulligan,
robos de Preparación y cinco ventanas potenciales de Hueste. Sus perfiles versionados son
`first-approach-v1`, `balanced-v1`, `experienced-v1`, `high-pressure-v1` y
`progressive-pressure-v1`; todos conservan métricas crudas comunes y sólo cambian filtros, pesos y
objetivo de presión. El analyzer conserva un heap top-K acotado. Sus finalistas se reconstruyen con `createInitialGame` y
`mulliganOpeningHand`; sólo después pasan de `unchecked` a `structurally-valid`. No simula acciones,
no usa Zustand y nunca declara una seed ganable, imposible o divertida. La proyección de Hueste usa
stats impresos y reglas de revelado/Mini Oleada/Oleada, pero no ejecuta efectos que alteran el
Archivo. El benchmark manual vive en `scripts/benchmark-seed-explorer.mjs`; sus tiempos son
diagnóstico local, no assertions de CI.

El resultado conserva un `candidatePool` verificado más ancho que el top visible. **Mejores** toma
el ranking puro; **Variadas**, que es el default de UI, siempre conserva la primera y completa la
lista con una selección greedy max-min sobre apertura, recursos, curva, presión, escalada y
mulligan. Esta capa no modifica score, filtros ni identidad Canon.
Las etiquetas de variación son una clasificación estable e independiente del pool: Más estable,
Mejor curva, Inicio suave, Mayor escalada, Mulligan útil o Equilibrada. El dropdown **Variación
buscada** aplica esa clasificación durante la enumeración completa, antes del heap y del ranking;
no filtra únicamente el shortlist visible. Elegir Mulligan útil habilita la proyección de mulligan.
El playtest del creador eligió `HF1-ELA-GRV-082-QC5` como Canon Seed de primer acercamiento el
2026-08-19; conservarla como referencia aprobada mientras se corrigen bugs antes de retomar el
tutorial.

`src/playground/seedExplorerRuntime.ts` envuelve ese núcleo en slices cooperativos de renderer y
parte también la verificación exacta final. Usa un scheduler, reloj y `AbortSignal` inyectables,
limita publicaciones parciales y conserva el último resultado completo. Cada ejecución recibe un
`runId`: una búsqueda cancelada o reemplazada no puede publicar encima de la vigente. No usa Web
Worker; introducir uno exige una decisión separada porque la CSP desktop mantiene
`worker-src 'none'`.

La UI vive en `src/seed-explorer/SeedExplorerScreen.tsx`: es una pantalla dev independiente,
hermana de Playground y Audio Lab, con acceso desde el dock dev abajo a la derecha del home.
Playground no la importa ni la monta. Favoritos viven en `seedExplorerStorage.ts` como Canon Seeds
versionadas junto con el perfil que produjo su score y se reconstruyen defensivamente; favoritos
anteriores sin perfil migran a `first-approach-v1`. Cada favorito admite una nota local opcional,
editable y vinculada al Canon Seed exacto. Los exports JSON/CSV no incluyen timestamps
variables. **Probar en tablero** crea un juego nuevo con la entropía, decks, dificultad y
Preparación de la identidad, llama `loadScenario` y alterna la propia herramienta al Board real.
Volver desde el Board conserva shortlist, selección y último resultado. La búsqueda nunca muta
Zustand; sólo ese handoff explícito toca el Board.

Durante una partida normal, la barra superior coloca **Reescribir** antes de Música y Ajustes. Su
acción principal vuelve al origen de la misma seed, con los mismos decks, dificultad y modo;
**Contemplar otro futuro** abandona el intento y abre la preparación con los decks actuales y una
seed nueva. Ajustes in-game no vuelve a mostrar, editar ni regenerar la seed. Victoria y derrota
reutilizan la misma identidad y las mismas dos salidas. El reset o cambio de pantalla ocurre cuando
el vórtice global ya cubrió el tablero; la transición vive sobre `App` para sobrevivir al remount de
`Board` y tiene fallback de movimiento reducido.

El vórtice es un agujero negro dibujado por el renderer WebGL compartido: `destinyVortexShader.ts`
resuelve en un solo plano el horizonte, el disco de acreción, el anillo de fotones, la materia que
cae en espiral y la descarga de brasas de la liberación. Su reloj llega en dos tiempos separados,
`uCollapse` y `uBurst`, para que cubrir, reescribir y liberar sigan siendo momentos distintos. El
lienzo permanece oculto hasta copiar su primer frame válido. `uSeed` recibe una firma normalizada de
la seed: materia, brasas y quiralidad se repiten al reescribir el mismo Futuro y cambian entre
Futuros. Con movimiento reducido o sin un canvas utilizable queda la silueta quieta
`.destiny-vortex-still`. El velo de cobertura es radial: no debe añadir `repeating-conic-gradient`
ni haces que nazcan artificialmente desde el centro.

La escena no se traga como un bloque rígido y tampoco gira entera. `destinyShardSuction.ts` da la
geometría pura y la transición recorre el DOM para repartir la escena en piezas: cada una cae hacia
el centro por una curva propia, se estira en el eje que apunta al horizonte y arranca más tarde
cuanto más lejos estaba, de modo que todas terminan en el mismo instante. Su avance sale de una
sola función continua ya muestreada, y las animaciones se reproducen `linear`: repartir la caída en
tramos con easing propio deja uno terminando lanzado y el siguiente arrancando parado, y esa
costura se ve como un frenazo a mitad de la succión. El recorrido es genérico
—reparte por área, no por nombres de clase del tablero— y las animaciones se cancelan al pasar a
revelar. `destiny-scene-collapse` y `destiny-scene-return` sólo apagan y devuelven el fondo, y
animan únicamente `transform` y `opacity` sobre una capa promocionada. La escena nueva llega pasada
de tamaño y se asienta; hacerla crecer desde una miniatura la devuelve a leerse como un bloque
rígido. Volver a animar
`filter: blur()` o `saturate()` sobre la pantalla completa es una regresión de rendimiento, porque
obliga a repintar todo el árbol en cada frame.

El historial de intentos y la futura biblioteca de Semillas siguen bosquejados en
`docs/plans/seeds_of_destiny.md`; no están implementados. El seed literal `developer` queda
expresamente fuera de esta narrativa: oculta el control de Futuro y conserva su reinicio técnico
dentro de las opciones de desarrollo.

Antes de implementar el tutorial obligatorio, la claridad permanente de Preparación, robo, Acción de
Fuente, Reserva y ataque al Archivo debe seguir el plan de diseño e implementación de
`docs/plans/ui_core_rules_clarity_plan.md`. Cada fase empieza con una conversación de UI y requiere
aprobación del usuario antes de editar código; la preparación técnica queda subordinada al diseño
aprobado y el plan no autoriza por sí solo cambios de reglas ni la implementación del tutorial.

Estado vigente de ese plan: las Fases 1 (Preparación), 2 (Archivo y próximo robo), 3 (Acción de
Fuente), 4 (Reserva y orden de pago) y 5 (ataque al Archivo de la Hueste) están cerradas tras QA
visual del usuario; la Fase 6 y el plan completo quedaron cerrados el 2026-08-11 tras la revisión
global. El tutorial es trabajo posterior y debe reutilizar esta UI sin reabrir sus decisiones
implícitamente. El contrato de la Fase 5 es: panel **Archivo de la
Hueste**, conteo `actual → restante`, resultado físico reducido a siluetas y `N`, y tooltip secundario
**Cálculo del ataque** con la operación compacta `Fuerza ÷ umbral → resultado`. El preview usa
`hostRules.damagePerArchiveDiscard` y se limita al Archivo restante. La placa de `N` emerge por la
izquierda y desplaza Memoria; durante la resolución es el origen de cada carta, desciende con cada
salida y conserva `1` durante el último vuelo. Al aterrizar la última carta se retrae sin mostrar `0`
y Memoria vuelve junto al Archivo. Los CTA son **Elegir atacantes**, **Atacar el Archivo** y
**Pasar el combate**.

La infraestructura del tutorial obligatorio se gobierna por
`docs/plans/guided_tutorial_system_plan.md`, que sigue abierta y no autoriza implementar fases en
bloque. Antes de cada fase se explica al usuario qué experiencia se construirá y para qué le sirve;
sólo se implementa tras su aprobación explícita. El sistema debe ser independiente de nombres e IDs
de decks en su núcleo: las lecciones declaran recetas exactas, aliases de copias y referencias
calificadas de `ContentCatalog`. Añadir un deck no debe exigir ramas nuevas en el
overlay, el gate de acciones ni el orquestador. La sesión activa nunca se reanuda a mitad: sólo se
persiste la finalización versionada; cerrar o salir obliga a empezar el recorrido desde el primer
paso.

El contenido futuro del onboarding se diseña en
`docs/plans/learn_to_play_tutorial.md`. La decisión de producto vigente es conservar la lección
guiada actual como tutorial específico **Preparación** y crear un tutorial principal
**Aprender a jugar**: un prólogo determinista semi-guiado, seguido más adelante por una partida real
de Elarion contra los Sinsepulcro con seed preparada y ayudas contextuales. **Aprender a jugar** será
el tutorial obligatorio y **Preparación** será opcional; ambos podrán repetirse desde **Cómo jugar**.
El recorrido authored todavía no está completo y no se activará como gate de primera apertura
hasta completar su handoff. Las Fases técnicas 1 a 3 y la implementación de la Fase 4 hasta el
comienzo real de la primera Oleada quedaron entregadas el 2026-08-17:
existe un stream semántico pasivo por sesión que observa también
partidas normales, y el motor tipa los rechazos necesarios para límite de Fuentes, Acción de Fuente
usada, Estabilizándose, Agotado, Volar/Guardia aérea, Furtivo, defensor ya asignado y fase
incorrecta. El
prólogo queda diseñado desde el cold open hasta una derrota predeterminada: la primera Oleada usa
ramas equivalentes de Ladrones, Titán y Soldado; el turno posterior enseña Mano vacía y Devolver
Fuente; y el cierre authored calcula el mejor resultado defensivo antes de Invocar un Titán y los
Soldados necesarios para que el ataque sea letal. Tres Soldados dentro del Archivo protegen al Titán
terminal de los descartes opcionales; Choque conserva su ventana legal y la posición del Titán puede
variar. Esa Invocación terminal no redefine la regla normal de Oleada y cada llegada se presenta una
a una mediante el revelado normal, sin agrupación visual. El CTA único se llama **Contemplar otro
futuro**. El corte provisional actual registra la finalización al activarlo y carga una partida
normal aleatoria de Elarion contra los Sinsepulcro. El vórtice y la seed real preparada pertenecen
a una fase posterior. La
relación exacta entre buena Mano y mulligan sigue abierta. Si no queda un atacante
estabilizado, la enseñanza del ataque no bloquea el flujo, permanece como no vista y reaparece en
una partida posterior. La preferencia global de no repetir ayudas sólo suprime conceptos ya
mostrados: un concepto no visto conserva siempre su primera aparición. Está activa por defecto, se
marca al cerrar/aceptar la ayuda y las repeticiones se limitan a una por concepto y partida.
**Continuar** permanece deshabilitado globalmente por ahora. No traducir escenas aisladas a código
fuera de las fases aprobadas.

La auditoría y el plan técnico de esa extensión viven en
`docs/plans/learn_to_play_implementation_plan.md`. La decisión arquitectónica vigente es conservar
el schema guiado v1 para **Preparación** y separar: observaciones semánticas siempre activas,
runtime/progreso por concepto, director efímero de **Aprender a jugar** y catálogo de producto. El
builder exacto, anchors, barrera de presentación y overlay estricto se reutilizan. Los receipts
guiados ahora alimentan el stream mediante un adaptador y las transiciones comprometidas proyectan
turno, robo, Reserva, Fuentes preparadas, revelados, Oleada, orden de ataque, Vida y resultado sin
leer el log. `ContextualTutorialRuntime` evalúa un registro de conceptos, ordena por prioridad,
deduplica por partida y revalida el contexto antes de presentar. Su callout reutiliza anchors,
geometría y glosario sin instalar el escudo global; las ayudas informativas y reactivas no bloquean,
las preventivas interceptan sólo la acción relevante y nunca compiten con una sesión guiada
estricta. El progreso `hostfall-guided-progress` v2 migra v1, conserva finalizaciones de lecciones y
añade conceptos, recorridos y la preferencia global de repetición. En partidas normales el concepto
se confirma al cerrar la ayuda; el modo provisional permite commit atómico o rollback total para el
futuro prólogo. El registro de producto contiene ya los conceptos contextuales del primer tramo:
defensa y orden de izquierda a derecha, Volar/Guardia aérea, Vida, Reserva y Fuentes preparadas,
Estabilizándose, ataque al Archivo, agotamiento del atacante y Oleada. Las ayudas no vistas pueden
aparecer en una partida normal compatible y se confirman globalmente; los fixtures sintéticos del
Playground siguen aislados en development. Las acciones estructurales imprescindibles reutilizan la
guía actual. El plan se ejecuta fase por fase con
aprobación explícita. **Cómo jugar** ya consume un catálogo y presenta **Aprender a jugar** antes de
**Preparación**; `first-seed` conserva su ID pero ahora es opcional. El recorrido tiene lifecycle
efímero independiente, rollback de conceptos provisionales, reinicio total, autosave apagado,
políticas explícitas de tablero e intervenciones estrictas adjuntas al `GameState` vivo. Su launcher
está activo desde **Cómo jugar**. Antes de iniciar el lifecycle muestra una antesala temporal de
cinco diálogos localizados: Evy pide ayuda, el Cronista decide contemplar ese futuro sin anticipar
que sus protagonistas morirán y Evy entrega el combate tras preparar tres Fuentes antes de que la
Hueste rompa su línea y la obligue a retroceder. Cerrar la
antesala conserva **Cómo jugar**; sólo el CTA del quinto diálogo carga el recorrido. Este copy es
una maqueta para la futura cinemática con voz, no lore definitivo. Los parlamentos del Cronista
muestran como speaker el nombre elegido por el jugador; «El Cronista» es sólo el fallback si
estuviera vacío. Después carga el snapshot avanzado exacto: Vida 31, Maela y tres Fuentes,
Vaelor/Aelyra/Río en Mano, Flor como próximo robo, Retorno/Acechador/Engendro/Cosechadora en ese
orden y la segunda copia de Acechador como siguiente revelado. Evy presenta la llegada del
Cronista y la cuarta Fuente que completa el contenedor de Energía inferior izquierdo antes de que aparezca la instrucción actual
**Juega Río de Elarion**. La guía exige la cuarta Fuente y
Aelyra con objetivo libre; el director deja defensa libre, exige Vaelor, hace obligatoria una única
inspección de la Cosechadora y permite Flor antes, después o nunca. Las pruebas enumeran todas las
defensas legales y esas ramas, que convergen en Cosechadora 7/9, y certifican cero o un descarte
opcional antes de la primera Oleada. El recorrido ya continúa después de `host.surgeStarted`: los
Ladrones vacían la Mano, la regla real roba Choque + Río —Río queda a la derecha—, y jugar la quinta Fuente o intentar
avanzar activa una intervención estricta breve para **Devolver Fuente**. Ciudad, Choque, Flor y el
ataque posterior permanecen libres. Tres Soldados authored absorben los descartes opcionales antes
del Titán terminal.

El lenguaje visible del tutorial distingue objetos de reglas: **Fuente** aporta Energía al
contenedor inferior izquierdo y **Energía** se canaliza para **Invocar Ecos** y activar Acciones;
nunca se enseña que se «Invocan cartas». El glosario usa términos separados para **Archivo de la
Hueste** —la pila de Ecos aún no Invocados— y **Archivo del Cronista** —la pila de Ecos y Fuentes aún
no robados—, de modo que el subrayado cubre la frase completa. Vida se define sólo como la
supervivencia del Cronista y Reserva explica que conserva hasta 3 de Energía para el turno siguiente
y la utiliza antes que las Fuentes. En la primera Oleada el orden es contractual: termina la
animación, aparece su ayuda contextual sobre el tablero asentado y sólo al aceptarla se revelan los
Ecos. La ayuda de Mano vacía no ilumina la Mano. En el desenlace de Aprender a jugar, tanto
**Futuro perdido** como **Contemplar otro futuro** quedan centrados horizontalmente.

El cierre terminal calcula desde el tablero vivo el mínimo de llegadas que vuelve inevitable la
derrota, verifica la mejor defensa con el resolutor real y presenta cada carta mediante su llegada
normal, una a una. La Vida llega a 0 por el combate real; `learn-to-play` reutiliza el quiebre de
derrota y muestra sólo **Contemplar otro futuro** con copy narrativo propio. Tras aceptar la
narración, el botón registra el recorrido como completado y abre provisionalmente una partida
normal con seed aleatoria; ejecutar el vórtice y cargar la partida preparada pertenecen a la Fase
6B aplazada. **Continuar** está deshabilitado globalmente. Para una fase
posterior siguen pendientes
la Mano/mulligan, seed, dificultad y
Preparación de la partida real; el comportamiento de primera apertura y perfiles existentes; y la
persistencia exacta si la aplicación se cierra durante el vórtice.

La Fase 0 quedó cerrada el 2026-08-11. La Primera Semilla obligatoria será canónica y usará **El
Pacto de Elarion** como deck del Cronista; la Hueste y el escenario pertenecen al futuro diseño de
contenido. El ciclo aprobado es **Explicar → Actuar → Observar → checkpoint estable**. Sólo la
intención solicitada puede llegar al engine; una animación iniciada termina durante Observar y nunca
se congela a mitad. Se permiten ajustes prácticos menores de layout, intensidad, copy y timing
durante QA, pero cambiar deck canónico, política sin resume, acciones permitidas o pausa entre beats
requiere nueva aprobación. El framework quedó cerrado con las Fases 0 a 5 y 7; las antiguas Fases 6
y 8 fueron eliminadas por decisión explícita del usuario. La Primera Semilla tiene ya una primera
versión jugable registrada; su ritmo y contenido siguen abiertos a QA e iteración con el usuario.

La Fase 1 quedó cerrada el 2026-08-11 y fija que **cada tutorial es un escenario completamente
predefinido**: decks, copias exactas, Mano o reparto inicial, Archivo del Cronista en orden,
apariciones de la Hueste, Campos, Memorias, Fuentes y Reserva. El runtime no busca cartas por
capacidades, no rellena el resto del deck y no baraja una receta. Las claves calificadas de
`ContentCatalog` viven en la receta; cada copia recibe un alias semántico que se enlaza a su
`instanceId`, y los pasos apuntan a ese alias. El reparto inicial puede contener dos, siete o la
  cantidad que diseñe la lección. Los contratos, validador, registro release y builder puro viven
  en `src/guidance/`; no importan Playground y no contienen lógica particular de una lección. Una
  receta
inválida falla antes de crear el `GameState`, y el builder descarta todo el reparto normal para dejar
únicamente las cartas declaradas en el orden `topToBottom` authored.
Mulligan no es una intención authorable en schema v1: una lección puede pedir aceptar su Mano exacta,
pero enseñar a reescribirla requerirá una versión que predefina también cada Mano de reemplazo.

La Fase 2 quedó cerrada el 2026-08-11. `src/guidance/interactionGate.ts` es la frontera semántica
única para las acciones deliberadas del jugador: recibe `GameplayIntent` tipados, compara aliases
contra `instanceId`, bloquea todo durante pasos Explicar/Observar y deja pasar sólo la carta,
objetivo, habilidad, selección o asignación authored durante Actuar. Fuera de una guía es un no-op.
Cada entrada pública clasificada en `GUIDED_GAMEPLAY_ENTRY_POINTS` debe llamar
`gameplayIntentAllowed`; una regresión estática lo exige. Un receipt aceptado consume el compromiso
del paso y evita dobles clics, mientras que un rechazo del engine no publica receipt y permite
reintentar. `runGuidedSystemAction` es la excepción acotada para terminar continuaciones automáticas
ya autorizadas; nunca debe envolver el primer compromiso de un handler ni autorizar input nuevo.

Los receipts son efímeros, tienen cursor monotónico y conservan `sessionId`/`stepId`. El store los
emite por resultados semánticos reales —incluidos targeting multietapa, fin de Preparación, robo con
cantidad y motivo, Reserva liberada y descartes del Archivo de la Hueste— sin leer logs. El registro
de rechazos tipados será la fuente del futuro pulso visual. El runtime de sesión existe desde la
Fase 3; el overlay comienza en la Fase 4.

La Fase 3 quedó cerrada con QA manual aprobada por el usuario el 2026-08-11. `GuidedSessionStore`
vive fuera de `GameState` y coordina
**Explicar → Actuar → Observar → checkpoint** usando los receipts del gate y el estado real de
presentación. `GuidedBeatBarrier` sólo retiene el inicio del siguiente beat automático: nunca
congela una animación o un commit ya iniciado. `GuidedPresentationActivityRegistry` usa tokens con
epoch para las entradas de Mano, la transferencia a Reserva y los beats de reacciones; junto con
los flags del store forma `isGuidedPresentationSettled`. Reset, carga y salida invalidan callbacks,
tokens y continuaciones retenidas.

La Fase 4 del framework quedó cerrada con QA manual aprobada por el usuario el 2026-08-11.
`GuidedAnchorRegistry` enlaza superficies
semánticas y aliases resueltos a refs reales, con varios propietarios durante transiciones de zona;
el overlay no consulta selectores ni identidades de deck. `GuidedTutorialOverlay` vive en un portal
de capa 20000, mide con `ResizeObserver` y seguimiento por frame, admite varios recortes y roles
`focus`/`origin`/`destination`, coloca el cuadro evitando objetivos y falla cerrado si falta una
ancla. Su escudo capture bloquea pointer, clic, contexto, drag y teclado antes del handler; durante
Actuar sólo atraviesan las anclas authored y el gate semántico vuelve a validar el compromiso.
Tooltips/previews quedan suprimidos, los intentos incorrectos producen feedback visual y textual,
el foco queda contenido y las cartas admiten Enter/Espacio. La pestaña dev **Guide** es la vertical
de QA; no es contenido de release ni el guion de la Primera Semilla. El QA final fijó el dimmer en
55%, alineó el cuadro al azul carbón de Settings y bloqueó también el hover del tablero durante
Explicar y Observar.

La Fase 5 quedó cerrada con QA manual aprobada por el usuario el 2026-08-11.
`GuidedLessonOrchestrator` inicia una lección
registrada por ID, construye y carga su receta exacta, entrega aliases al `GuidedSessionStore`, y
ofrece reinicio total y salida segura sin conocer decks o cartas. Las precondiciones declarativas
`card.inZone`, `phase.is`, `side.isActive`, `setup.remaining`, `energy.available` y `energy.stored`
se validan en autoría y se comprueban contra el `GameState` real al entrar a cada paso; un fallo
aborta cerrado sin propagarse por el handler de gameplay. Sus eventos efímeros de inicio, reinicio,
salida y error son observables, pero nunca determinan progreso. Guidance Lab usa ya este orquestador
en lugar de construir y arrancar la sesión manualmente; sigue siendo sólo una fixture dev.

La antigua Fase 6 de herramientas de autoría fue eliminada por decisión explícita del usuario; no
queda como mejora futura. La Fase 7 usa `GuidedProductLifecycle` y una pantalla `tutorial` separada:
sólo las políticas de sesión normal activan autosave. Web persiste el envelope
`hostfall-guided-progress:v2`; desktop lo guarda dentro de `profile/preferences-v1.json`. El registro
contiene finalizaciones de lecciones y recorridos, conceptos vistos y la preferencia contextual;
nunca paso, escenario, bindings, timers o `GameState`. Entrar, reiniciar, salir o completar una
lección preserva cualquier resume normal. Onboarding de
nombre y tutorial completado son estados independientes. Settings en tutorial conserva idioma,
audio, pantalla, reinicio total y salida, y oculta toda mutación o inspección del escenario. El
modal de Settings es una superficie global por encima de gameplay, tutoriales y transiciones. Las
confirmaciones que abre —incluida la salida del recorrido— aparecen por encima de Settings sin
cerrarlo; cancelar debe devolver al mismo Settings. Ambos portales reutilizan el tema vigente
mediante `.game-settings-popover`, sin una apariencia paralela. Durante una guía estricta, también
el launcher de Settings vive en una capa global inmediatamente superior al escudo del tutorial:
debe seguir accesible en Actuar, Explicar y Observar sin abrir el resto del tablero.
registro release contiene la revisión jugable de `first-seed`, presentada como **Preparación** y
marcada opcional. El menú **Cómo jugar** lista además **Aprender a jugar** con identidad propia. No
hay un gate tutorial activo mientras ese recorrido principal siga incompleto.

La revisión 4 de **La Primera Semilla** usa **El Pacto de Elarion** contra **El Alzamiento de los
Sinsepulcro** y empieza al inicio de Preparación 1/3. Su Mano inicial exacta contiene dos Fuentes,
Liora y Vaelor. En 1/3 juega una Fuente, enseña la Acción de Fuente y su límite por turno, y compara
Liora y Vaelor en grande para mostrar que ninguno puede Invocarse con una sola Energía. En 2/3 roba
a Maela, nombra el robo de cada turno, juega la segunda Fuente e Invoca a Liora; un solo checkpoint
explica que las Fuentes quedaron Agotadas y que Liora está Estabilizándose. En 3/3 roba Escudo de la
Heredera, muestra Fuentes listas y Liora ya estabilizada, usa su Acción para añadir Energía a la
Reserva y canaliza hacia Maela esa Reserva más la Energía de las dos Fuentes. Cierra con Guardia aérea y la defensa
terminada. La lección se detiene ahí, antes de terminar el turno: su cierre no debe prometer el
despertar de la Hueste mientras no exista contenido posterior.

El ritmo es parte del contrato de esta revisión: 15 pasos visibles, nunca más de dos explicaciones
seguidas, y los pares de acciones que forman una sola idea —colocar Fuente e Invocar a Liora, crear
Reserva e Invocar a Maela— encadenados con un checkpoint `callout: "hidden"` en medio, nunca con
texto. Las explicaciones dicen por qué importa la regla, no sólo qué ocurrió. Sigue abierta a QA de
copy y ritmo, pero volver a intercalar un cuadro de texto entre acciones encadenadas o superar esos
límites es una regresión: `tests/guidedLesson.test.js` los verifica.

La revisión 4 mantiene cada cuadro visible en un solo párrafo breve y traslada las definiciones a
un glosario contextual authored por paso. Los términos indicados aparecen en dorado y subrayados;
hover o foco de teclado muestra una explicación localizada sin desbloquear el tablero. El renderer
sólo enriquece los términos que declara la lección, una vez por párrafo, y no infiere vocabulario a
partir de nombres de cartas o del estado del juego.
El copy pedagógico habla de **reunir, canalizar, liberar y consumir Energía**, no de pagarla. Este
tramo tampoco formula una regla general sobre Energía que pasa de turno: los pasos tempranos de
Preparación son la excepción y el comportamiento normal de Fuentes sin usar se enseñará en su
contexto correspondiente.

Un paso `observe` se entra en cuanto llega el receipt de la acción, así que sus preconditions se
evalúan **antes** de que su propio beat resuelva. No puede afirmar estado que produce ese beat —la
Energía llega con `energy.flow`, no con el receipt—; eso pertenece al siguiente paso authored, que
sólo se entra tras el settle. Un paso `explain` no tiene ese problema porque siempre espera.

La Preparación tiene un solo nombre por idioma en toda la superficie visible: `phase.setup` y su
banner, el botón `orb.extraTurn` y el copy de la lección deben coincidir. El inglés ya no mezcla
*Setup*, *Preparation* y *Extra Turn*. La lección tampoco puede enseñar que la Energía sin gastar se
pierde como regla general: durante la Preparación se pierde, pero en turno normal una Fuente sin usar
se convierte en Reserva, y el texto debe distinguirlo.

Las comparaciones grandes de cartas son una presentación genérica declarada por alias mediante
`presentation.cardComparison`; el runtime resuelve las instancias predefinidas y enfatiza su coste
sin conocer nombres de cartas ni selectores de la UI. La comparación se centra en pantalla y el
énfasis reutiliza directamente `CardCostBadge`, el orbe azul que la Mano y el preview superponen en
la esquina superior izquierda; no se mantiene una representación paralela de Energía. Las cartas
se muestran al 80 % del tamaño de la primera versión, sin repetir sus nombres debajo; el recuadro se
ensancha para quedar claramente por encima y las cartas se elevan bajo él. El coste conserva su
opacidad mientras pulsa y brilla. Cuando `player.reserve` y `player.sources` producen spotlights
anidados, sólo el marco exterior conserva el ornamento superior.
Durante una
lección, `PhaseBanner` permanece suspendido para no destellar entre checkpoints del guion.

En los pasos de Fuente, la acción apunta de la carta en Mano a `player.field`; sólo después de que
termine su entrada se ilumina `player.sources` para explicar la Energía obtenida. Una Fuente en
Campo se representa como orbe y ya no conserva una carta individual visible, por lo que ningún paso
posterior debe intentar iluminar su alias. Las Invocaciones de Liora y Maela incluyen además un paso
`observe` explícito sobre `player.field` antes de cambiar de explicación. El ancla visual
`player.sources` mide la unión real de las dos pistas de orbes, no el panel decorativo de la esquina.
Los checkpoints `observe` breves pueden declarar `callout: "hidden"`: conservan la espera estable
entre acciones, pero no renderizan texto, fade, spotlight, anclas ni conectores y tampoco cuentan en
la numeración visible. Las anclas de carta ocultan el marco dorado del spotlight y conservan la
indicación propia de la carta; si aparece
una acción contextual fuera de sus límites, el descendiente marcado con
`data-guided-anchor-extension="true"` amplía el hueco interactivo y la zona evitada por el recuadro.
El orbe de coste forma parte explícita de esos límites visuales para que el dimmer no lo recorte.
Las dos primeras acciones del prólogo —jugar Río de Elarion e invocar a Aelyra— declaran
`dimmer: "hidden"`: conservan el recuadro, la flecha direccional y el bloqueo de acciones, pero no
oscurecen el tablero. Los pasos posteriores mantienen el dimmer por defecto.
Al activar `phase.continueSetup`, el overlay retira el recuadro del paso de Acción desde el
`pointerdown` o teclado aceptado; así no sobrevive un frame mientras comienza el robo automático.
El oscurecimiento del tutorial usa 35 % de opacidad y el texto admite párrafos separados para evitar
bloques densos.

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

Durante Preparación la Reserva no está bloqueada: los efectos de Ecos que generan Energía la llenan
de inmediato y puede gastarse en ese mismo paso. Lo que espera al turno de la Hueste es sólo la
conversión automática de Fuentes sin usar. La pista amarilla debe conservar sus orbes y colores
activos y no añade ningún icono o mensaje permanente. Durante Preparación, el tooltip de la fila
amarilla dice solamente que la Energía de Fuentes sin usar se guarda cuando termina la Preparación;
nunca vuelve a presentar la Reserva completa como sellada.

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

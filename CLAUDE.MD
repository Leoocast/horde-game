# CLAUDE.MD

Guia de contexto para otras IAs trabajando en este proyecto.

## Que estamos construyendo

Este repo es un prototipo de juego PvE de cartas inspirado en Horde Magic.

Stack:
- React 19
- TypeScript
- Vite
- Tailwind
- Zustand
- Framer Motion
- lucide-react

La regla mas importante: la logica del juego debe vivir en `src/engine`, no dentro de componentes React. Los componentes pueden coordinar animaciones, sonidos, overlays y estado de UI, pero las reglas reales deben quedar en funciones puras del engine cuando sea posible.

## Como correr/verificar

El usuario suele usar el runtime bundled de Codex porque no tiene node/pnpm global.

Comando de TypeScript:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

Tests deterministas del engine:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts/run-engine-tests.mjs
```

Deck lint (valida los JSON de decks contra el vocabulario real del engine y reporta cartas WIP):

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\lint-decks.mjs
```

Build completo:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

Dev server normal, si se necesita:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js --host 127.0.0.1
```

No uses `npm install` o `pnpm install` salvo que sea necesario. Ya hay `node_modules`.

## Estructura importante

```text
src/
  engine/
    GameState.ts          setup inicial, developer seed, instancias de cartas
    GameTypes.ts          tipos centrales
    GameActions.ts        jugar tierra, castear, activar habilidades
    PhaseManager.ts       fases del player, poison tick
    CombatResolver.ts     ataque player, defensa horda, dano, death checks
    HordeController.ts    revelado/turno de la Horda
    EffectResolver.ts     efectos genericos
    Targeting.ts          candidatos de target
    Keywords.ts           keywords dinamicas/static grants
    ManaSystem.ts         mana y autopago con tierras
    StaticEffects.ts      stats y filtros

  store/
    useGameStore.ts       puente UI/engine: acciones, targeting, secuencia de combate del player
    hordeBeats.ts         sistema de beats de la Horda (handlers, aura estatica, epoch de secuencia)
    smallpoxSequence.ts   secuencia interactiva bespoke de Smallpox
    presentationEffects.ts helpers compartidos: uiText/uiCardName, toasts, SFX policy, buff/flash beats, discard/mill diffs
    useAudioStore.ts      SFX y musica
    useToastStore.ts      notificaciones

  components/
    Board.tsx
    Battlefield.tsx       layout principal del campo
    battlefieldLayout.ts  reglas PURAS de layout del campo: agrupado en stacks, orden de fila y
                          slots sostenidos durante la secuencia de la Horda (testeado)
    Card.tsx              render visual de carta, badges y hover
    Hand.tsx              mano, drag-to-play
    PhaseOrb.tsx          boton central de accion
    SpellTargetingOverlay.tsx
    CounterTargetingOverlay.tsx
    CombatArrows.tsx
    HordeAttackAnimator.tsx
    PlayerAttackAnimator.tsx
    SpellFightAnimator.tsx
    HordeMillAnimator.tsx
    PlayerDiscardAnimator.tsx
    CardPreview.tsx       side preview + CardDetailsModal compartido
    DeckInspector.tsx

  data/
    decks/
      player/
        mono_green_ramp/  deck del player en schema Hostfall 1.0.0 (JSON + manifest de imagenes)
        vampire_preview/  Crónica de Vampiros en schema Hostfall 1.0.0
      horde/
        zombies/          deck Hostfall 1.0.0 activo por defecto de la Hueste
        goblins/          segundo deck Hostfall 1.0.0 de la Hueste, seleccionable y menos maduro en reglas
    decks.ts              DECK_REGISTRY: registro unico de deck, imagenes y metadata visual
    deckCatalog.ts        tipos del esquema de deck + derivacion de inspectableDecks desde DECK_REGISTRY
    normalizeDeck.ts      normaliza el esquema authoring al vocabulario del engine (total: lo que no entiende lo atrapa el lint)
    deckLint.ts           lint de decks: valida cada habilidad contra el vocabulario del engine

  engine/
    effectVocabulary.ts   vocabulario del engine para el lint; los effect types derivan del registro de EffectResolver
    HordeRules.ts         DEFAULT_HORDE_RULES + buildHordeRules: reglas por deck de horda (reveal, surge, mill, haste, swarm)

scripts/
  run-engine-tests.mjs    corre los tests via vite ssrLoadModule + node:test; agregar un archivo
                          de test = agregar su ssrLoadModule aca, o no corre nunca
  lint-decks.mjs          corre el deck lint standalone con reporte por deck (ready/vanilla/WIP)

tests/
  engine.test.js          tests deterministas del engine (seed, mana, combate, etc.)
  deckLint.test.js        el lint como test: un hueco silencioso en un deck JSON rompe la suite
  battlefieldLayout.test.js  layout del campo: slots sostenidos y agrupado congelado
  engineTestUtils.js      helpers para armar game state de prueba
```

Detalle de testing en `docs/testing.md`. Para agregar o implementar una carta, seguir
`docs/adding_cards.md`.

## Vocabulario e independencia de producto

La fuente canonica para retirar de la superficie del producto el vocabulario y contenido heredados
de Magic vive en `docs/game_vocabulary.md`. Tambien define la ontologia narrativa de las cartas:
fragmentos de memoria que reconstruyen un Capitulo. Leerla antes de agregar o cambiar nombres,
tipos de carta, zonas, fases, keywords/Rasgos, texto de reglas o tooltips.
El proceso fase por fase para limpiar contenido, assets y vocabulario interno del engine se registra
en `docs/independence_cleanup_plan.md`. Leer su estado antes de comenzar cualquier fase y no
adelantar trabajo sin aprobación explícita del usuario.
El baseline reproducible de L0 vive en `docs/independence_inventory.md` y se actualiza con
`scripts/audit-independence.mjs`; el modo normal reporta y `--strict` funciona como gate final.
La Parte 1 de ese vocabulario esta cerrada como diseno en v1.0; `Echo / Eco` es el tipo de carta
que reemplaza a `Unit / Unidad`, y `Chronicle Echo / Eco de Cronica` distingue figuras centrales
del relato sin agregar una regla de unicidad.
En reglas impresas, `aliado` y `enemigo` funcionan como sustantivos de Eco; no repetir `Eco` salvo
que identifique el tipo de carta, una Ficha o una distincion necesaria. Los disparos de entrada se
redactan `Al ser invocado/a` con concordancia respecto al sujeto visible.

La Parte 2 centralizó la presentación en `src/i18n/gameVocabulary.ts` y
`src/i18n/rulesText.ts`. Los ids legacy siguen permitidos dentro del engine, pero toda salida
visible debe pasar por esos bordes. `tests/vocabulary.test.js` protege traducciones, tipos, texto
de cartas y la ausencia del tutorial. El botón `How to Play` permanece visible y deshabilitado en
el menú; no existe implementación, estado ni ruta de tutorial.

Durante la migracion pueden sobrevivir ids legacy dentro del engine, pero no deben filtrarse a UI,
cartas impresas, logs, ARIA ni assets de produccion. No agregar proveedores remotos de cartas ni
arte, nombres, metadata o texto heredado de Magic. Todo recurso final necesita procedencia y
derechos de uso comercial documentados.

## Estado actual del juego

### Modos legacy

Chaos Mode está **deprecated** y oculto del menú principal. Su implementación se conserva por
compatibilidad y pruebas existentes, pero no debe recibir features ni mantenimiento activo hasta
que se decida retomarlo explícitamente.

### Player

Tiene:
- life
- library
- hand
- battlefield
- graveyard
- exile
- manaPool

Puede:
- jugar tierras
- castear criaturas, instants y sorceries segun fase
- atacar a la Horda
- bloquear ataques de Horda
- usar habilidades activadas genericas con costes de tap, mana, sacrificio propio o vida
- pagar vida como coste sin poder bajar de 1; el pago es atomico con el mana, emite `LIFE_LOST`
  ademas de `LIFE_PAID`, y se acumula por separado en `player.lifeLostThisTurn` y
  `player.lifePaidThisTurn` hasta el siguiente turno
- una habilidad activada puede declarar `requiresNoSummoningSickness`; engine y UI la mantienen
  inactiva mientras su criatura tenga fatiga, sin cobrar costes

### Horde

Tiene:
- library
- battlefield
- graveyard
- exile
- poisonCounters

No tiene:
- mano
- vida
- mana normal

La Horda pierde por mill/estado sin amenazas, y el player pierde si llega a 0 vida.

La Horda revela cartas automaticamente en su turno:
- revela hasta 3 cartas
- se detiene si revela una carta no-token
- si esta en Surge, revela 2 extras

La Horda ataca con todas las criaturas posibles.

## Developer mode

Seed especial: `developer`.

En `src/engine/GameState.ts`:
- `DEVELOPER_SEED = "developer"`
- player inicia con 999 vida
- player inicia con 4 Forest en battlefield
- player roba 2 Broken Wings forzadas mas 5 cartas aleatorias
- la Horda fuerza `goblin_token_1_1_red` y `rundvelt_hordemaster` al frente
- `graf_harvest` se mantiene fuera de esas dos posiciones protegidas

Actualmente se usa para testear rapido:
- cartas concretas en mano
- tierras listas en campo
- una apertura Goblin reproducible para probar triggers y muertes

Si el usuario pide "ponme X en mano/campo en developer", hacerlo en `GameState.ts`, no hackear componentes.

## UX / visual style

El estilo buscado es fantasy PC game de los 2000, tipo Age of Empires / Path of Exile antiguo:
- dark medieval
- paneles old UI
- bordes dorados/cafe
- botones redondos/orbitales
- no glass moderno limpio
- evitar que la UI se vea SaaS

No hacer landing page. El juego es la pantalla principal.

El usuario cuida mucho:
- que no haya saltos bruscos
- que las cartas no se teleporten
- que las animaciones esten en queue cuando hay varias
- que el campo sea claro, con poco ruido
- que los overlays no bloqueen targets validos

## Layout actual del campo

`Battlefield.tsx` es delicado.

Player:
- criaturas en una fila
- lands en fila separada
- other permanents en el mismo bloque de lands, a la derecha

Horde:
- no tiene lands
- criaturas en la fila principal
- other permanents NO deben crear una tercera fila
- other permanents deben ser una zona extra dentro de la fila principal, a la izquierda, como overlay, sin empujar ni recentrar a los zombies
- si un other permanent es target valido durante un spell, esa zona debe subir sobre el fade negro

Graf Harvest:
- esta en `src/data/decks/horde/zombies/horde-zombies.json`
- es Enchantment
- va en Other permanents de Horde
- da `MENACE` a zombies via `STATIC_GRANT_KEYWORD`

## Card badges

En `Card.tsx`:
- `Tapped`, `Atk`, `Blk` son badges arriba-izquierda
- keywords de zombies se muestran debajo en columna
- `HASTE` no se muestra para zombies porque es regla implicita del modo
- keywords visibles deben parecer badges de estado como `Tapped`/`Atk`, no pills grandes

## Targeting y overlays

Hay dos sistemas de target importantes:

### CounterTargetingOverlay

Usado por efectos tipo Sunshower Druid:
- carta fuente grande a la derecha
- fade negro
- targets validos quedan sobre el fade
- flecha sigue el mouse
- confirm/cancel
- click derecho deselecciona si hay target, cancela si no

### SpellTargetingOverlay

Usado por spells con targets:
- Giant Growth
- Ruthless Predation
- Cosmic Hunger
- Broken Wings

Flujo:
- carta de la mano queda invisible dejando hueco
- overlay con carta grande fuente
- si la carta fuente se superpone con un objetivo valido o ya elegido, al pasar el cursor sobre
  ella baja a 34% de opacidad y deja pasar el click; al salir recupera su opacidad, mientras el
  preview y los botones siguen interactivos
- elegir targets en orden
- flechas lockeadas visibles
- confirm resuelve
- cancel devuelve carta a mano

Importante:
- mientras se targetea, no debe aparecer CardPreview por hover de targets
- no ocultar globalmente `CardPreview` durante targeting si rompe overlays
- solucion preferida: al iniciar targeting limpiar `focusedCardId`/`hoveredCardId`, y en `Card.tsx` no disparar hover cuando `suppressHoverOverlay` esta activo

## CardPreview / Details

`CardPreview.tsx`:
- panel lateral de preview
- usa `CardDetailsModal`
- `CardDetailsModal` debe ser compartido por juego, deck inspector y graveyard viewer cuando sea posible
- el boton `Details` solo aparece cuando una carta esta pinned/focused
- en el juego, el click normal en carta ya no debe pinear CardInfo para activaciones; se ha movido mucho hacia overlays/context menus

Keywords:
- se muestran arriba como badges
- la descripcion no debe repetir keywords si ya se muestran arriba
- si una carta no tiene reglas adicionales, `gameText` debe decirlo de forma breve
- las descripciones de reglas visibles usan `gameText` del JSON del deck y deben explicar el
  comportamiento real de Hostfall; no usar oracle text de Magic como descripción de gameplay

## Decks e imagenes

El formato viejo fue eliminado junto con `player_deck.json`, `horde_deck.json` y
`cardImageLookups.json`. Los tres decks vigentes usan el mismo esquema authoring (cards con
`abilities` de kind STATIC/TRIGGERED/ACTIVATED/SPELL) y pasan por `normalizeDeck`:

- player: `mono_green_ramp` (`DEFAULT_PLAYER_DECK_ID`)
- horde: `horde_zombies` (`DEFAULT_HORDE_DECK_ID`) — migrado al esquema nuevo
- horde: `goblin_assault_horde` — seleccionable; sus habilidades de lords sin handler estan marcadas `engineSupport: "pending"`

Reglas de horda por deck: el engine construye `game.hordeRules` con `buildHordeRules(deck.rulesProfile)` (ver `HordeRules.ts`). Los defaults reproducen el modo zombie clasico (revela 3 y para en no-token, mini surge turno 6 +1, surge turno 10 / chaos 8 +2, mill cada 3 de dano, mill por cada 3 poison, HASTE implicito). El `surgeBonus` (+1/+0 a Zombies en surge) NO es default: viene solo del `rulesProfile` del deck zombie. `swarmTokenSubtypes` define que fichas se agrupan por oleada. Cambiar la personalidad de una horda = editar su `rulesProfile`, no el engine.

`src/data/decks.ts` tiene `DECK_REGISTRY`: agregar un deck = una llamada
`register(label, raw, images, presentation)`. De ahi derivan el deck del engine, el inspector
(`deckCatalog.ts`), los lookups de imagenes (`cardImages.ts`) y su presentacion en selectores.
`presentation` declara `keyCardId`, `theme`, `descriptionKey` y, para Hordas, `encounterTone`; no
volver a resolver esos valores por id dentro de componentes. Cada deck lleva su manifest de
imagenes junto al JSON.

Marcador `engineSupport` por habilidad (ver `deckCatalog.ts`):
- `"pending"`: aun no implementada; el normalizador la salta y el lint la reporta como WIP. Es el estado normal del flujo "primero jugable, luego efectos".
- `"ignored"`: deliberadamente no implementada en este modo (p.ej. dar HASTE a la Horda).
- `"custom"`: resuelta por un camino bespoke fuera del resolver generico (p.ej. Smallpox).

Sin marcador = la habilidad debe validar completa contra el vocabulario del engine, o el lint (y la suite de tests) fallan. Nunca dejar que una carta "no haga nada" en silencio.

## Cartas / efectos ya tratados

### Llanowar Elves / Druid of the Cowl / Tithe Acolyte

Efecto generico de tap:
- texto interno legacy: `{{T}}: Add {G}.`
- texto impreso Hostfall: `Agota: Gana {E}.`
- se activa con UI de efecto
- animacion:
  1. carta se agranda/levanta
  2. boton de efecto aparece
  3. al confirmar hace pulse dorado + `activate_effect.wav`
  4. luego se tapa con animacion + sonido land
  5. para Llanowar y Druid of the Cowl, una semilla dorada con ribbon ambar y hojas viaja
     hasta el siguiente socket amarillo vacio; el mana almacenado se compromete al impacto. El
     ribbon muere antes de llegar y la semilla termina sola el recorrido para no leerse como rayo
  6. Tithe Acolyte reutiliza ese flujo dorado sin reemplazar su pago de vida: la mordida y el viaje
     corren en la misma activacion, pero la Energia almacenada tampoco se acredita hasta que la
     semilla alcanza el socket

Reglas:
- solo en turno del player
- solo main phase
- solo una vez por turno
- si tiene summoning sickness no puede activar tap

### Sunshower Druid

Trigger manual al entrar:
- targetea criatura valida del player, puede targetearse a si mismo
- pone counter/buff y gana vida segun JSON
- usa `CounterTargetingOverlay`
- debe bloquear invocaciones mientras el trigger no se resuelva
- sonido `monogreen_buff.mp3` al aplicar buff porque Sunshower pertenece a Mono Green

### Beast-Kin Ranger

Trigger cuando entra otra criatura:
- aumenta stats correctamente
- solo debe mostrar animacion de buff azul una vez
- no debe mostrar efecto amarillo de activacion

### Ichorspit Basilisk / Toxic

Toxic se normaliza como `TOXIC_1` y se muestra como `TOXIC {1}`.

Regla custom de este modo:
- si una criatura con toxic hace dano de combate a la Horda, agrega poison counters a la Horda
- cada 3 poison counters, al pasar turno, la Horda millea 1
- el icono de poison solo aparece si la Horda tiene poison counters

### Ruthless Predation

Sorcery, main phase:
- target 1: criatura aliada
- target 2: criatura enemiga
- requiere ambos targets disponibles
- usa el mismo sistema de target que spells
- seleccionar objetivos no reproduce hojas ni ningun preview de crecimiento
- al confirmar, primero compromete el +1/+2 y reproduce completa la animacion compartida de
  Giant Growth; despues inicia la animacion de batalla existente y el dano se compromete en su
  impacto
- debe aplicar deathtouch si corresponde

### Giant Growth

Instant:
- puede jugarse en main, battle y defend phase
- target aliado
- seleccionar target no reproduce la animacion; al confirmar debe aplicar inmediatamente, quitar
  la carta de mano y reproducir el crecimiento compartido en ese mismo momento

### Crecimiento mono-green

Los buffs organicos comparten un beat de presentacion sin meter nombres de carta en el engine.
`buffAnimationVariantForCard` envia Sunshower Druid, Beast-Kin Ranger, Giant Growth y Ruthless
Predation a la misma animacion fuerte de Giant Growth. `GrowthBuffAnimator` extiende primero una
base de raices por todo el ancho inferior, las hace atravesar la carta hacia arriba, abrirse hacia
los lados y brotar hojas ancladas. Una segunda capa de hojas sueltas asciende casi recta, con deriva
leve pero sin remolino, antes de que todo se desvanezca. No cierra el contorno: debe leerse como crecimiento, no
proteccion. El efecto vive en un canvas Three.js local que sigue a la criatura sin tomar su
`transform`. La version que envuelve el borde se conserva sin uso en `NatureShieldAnimator.tsx`
para un futuro efecto defensivo. `BuffSurgeAnimator` adapta `might-surge` / "Oleada de fuerza" del
VFX Lab dejando sus columnas ascendentes y un pulso compacto: no usa chevrons, motas ni luz de
base. El canvas excede ampliamente la carta y el pulso termina cerca de su ancho, para que nunca
revele un borde rectangular. Conserva del original 9 columnas con posicion, delay, velocidad,
largo y grosor variables, mas 24 motas ascendentes alrededor del marco. La semilla combina evento
e `instanceId`: varias criaturas buffeadas a la vez nunca repiten la misma composicion. Los buffs
de otros decks usan la paleta dorada; Mono Green superpone la variante verde detras de las raices
y hojas.

### Cosmic Hunger

Instant:
- target aliado y enemigo
- el enemigo no debe moverse como atacante; la carta del player es la que "golpea"
- debe mostrar dano visual antes de desaparecer si muere
- debe usar sonido de golpe

### Broken Wings

Instant:
- destruye artifact/enchantment/flying creature segun targets del JSON
- debe poder targetear `Graf Harvest`
- target valido en Other permanents debe quedar sobre fade negro
- CardPreview no debe bloquear la vista mientras eliges target
- al confirmar, dos cortes verdes atraviesan el target sin moverlo; hojas, plumas oscuras y
  astillas caen desde el corte antes del fade normal de destruccion

### Magnigoth Sentry / Colossadactyl / Timberland Ancient

No requieren reglas extra. Al terminar su entrada al campo comparten un impacto visual de criatura
pesada inspirado por `smoke-blast` + `blunt-impact` del VFX Lab: un anillo toroidal de humo terroso
rodea la carta, una onda circular centrada en su cara cubre toda su huella junto con lineas radiales y escombros con
gravedad. La carta no tiembla ni se comprime. La cortina central del laboratorio se mantiene tenue
para no tapar la criatura recien jugada. Los tres usan `play_monster_heavy` al entrar; Magnigoth es
una excepcion explicita a la regla automatica de estadisticas porque su cuerpo 4/4 no supera el
umbral general. El canvas Three.js tiene margen suficiente para que el humo
no corte contra sus bordes y empieza 225 ms antes de que termine la caida, incluyendo cualquier
delay de reacomodo, para que el frente ya este naciendo al aterrizar. El conjunto visual se ancla
56% de la altura de la carta por encima de su centro geometrico; el canvas extiende su margen
superior para conservar completo el humo con ese desplazamiento.
El VFX comienza en el `onfinish` real de la invocacion para mantenerse sincronizado incluso cuando
la fila de criaturas debe reacomodarse antes de recibir la carta.

No implementar Forestcycling; no aporta en este modo.

## Horde specifics

### Graf Harvest

Debe:
- entrar como Other permanent de la Horda
- aparecer en zona overlay izquierda dentro de la fila principal de zombies
- no empujar ni recentrar criaturas
- dar MENACE a zombies via `STATIC_GRANT_KEYWORD`
- ser destruible con Broken Wings

### Crow of Dark Tidings y triggers de Horda

Flujo deseado:
1. Horda invoca cartas.
2. Cuando todas entran, acciones bloqueadas.
3. Triggers de la Horda se activan en secuencia.
4. Se muestra pulse/tooltip/toast del efecto.
5. Se resuelve el efecto.

No resolver triggers invisiblemente si hay animaciones importantes.

### Zombie discard/mill

Horde mill animation:
- cuando se millea carta de Horda, animar carta desde zona de Horde Deck hacia la derecha/descartar
- debe suceder en tiempo real durante secuencias de ataque, no todo al final
- si un atacante millea varias cartas, esperar lo justo para que se vean antes del siguiente atacante

Player discard:
- debe animar carta saliendo de mano/campo al graveyard
- sonido drawOne/card
- toast en tono horde

## Combate

### Ataque player

Durante Battle:
- cartas atacantes pueden seleccionarse por click o drag
- al seleccionarse se tapan y aparece flecha naranja hacia el cuadro de Horde deck
- boton principal cambia a Confirm
- hay boton All y Cancel
- attackers se resuelven en orden izquierda a derecha
- cada atacante anima hacia adelante
- sonido attack por atacante
- dano a Horda millea cada 3 dano
- poison se agrega por toxic

### Defensa contra Horda

Durante Defend:
- la Horda resuelve atacantes estrictamente en orden de invocacion (`horde.battlefield`); el
  agrupado visual por copias/stacks nunca puede reordenar el combate
- criaturas no-token iguales de la Horda solo comparten stack si entraron durante el mismo turno
  de Horda; una copia posterior conserva su nueva posicion aunque haya una copia antigua en campo
- seleccion del defensor puede hacerse por click/drag
- flechas azules de defensor a atacante
- si una criatura atacante tiene MENACE, defender debe bloquearse si solo hay 1 blocker; el boton muestra tooltip explicando
- si no hay bloqueos, boton dice algo tipo "No defend"
- orden de bloqueadores contra un mismo zombie:
  - debe respetar izquierda/derecha segun regla actual
  - cada blocker muestra su orden real (1, 2, ...) en el badge azul, incluso si es el unico
- cada atacante de la Horda con bloqueadores asignados muestra su cantidad en un badge azul con
  escudo anclado top-left, la zona expuesta de los stacks; aplica por igual a Zombies y Goblins,
  y el header cutted reserva ese espacio

Animacion:
- atacante y defensor se mueven un poco hacia adelante en queue
- si defensor muere, desaparece en ese momento
- si atacante muere, desaparece y su flecha se va
- flechas desaparecen con fade out
- stats de vida deben bajar visualmente en tiempo real durante la secuencia

## Audio

Sistema en `useAudioStore.ts`.

Objetivos:
- SFX superpuestos
- musica de fondo
- volumen de SFX y musica separados
- no reiniciar cancion al mutear/desmutear
- musica empieza al 60% del slider por defecto

Mezcla por archivo:
- `src/audio/audioMix.json` es la unica configuracion de volumen individual que lee el juego
- guarda trims en dB: `0` conserva el archivo y hasta `-30` atenúa los archivos demasiado fuertes
- el volumen final es master del jugador x trim del JSON; no hay multiplicadores de volumen en
  stores, componentes, voces ni animadores
- el jugador no ve sliders por archivo; conserva solo los controles master de SFX y musica
- `playSfx` solo acepta `rate`; si una presentacion debe ser muda usa un booleano explicito, y si
  el mismo archivo necesita dos niveles autorales se registran dos cues/ids en el manifest y el JSON
- `Audio Lab` aparece debajo de `Playground` en el menu principal de desarrollo
- el laboratorio permite escuchar cada SFX, reproducir grupos de variantes, comparar canciones,
  importar una mezcla y exportar `audioMix.json`; para conservarla se reemplaza el JSON del repo y
  se recarga el juego
- agregar un SFX o una coleccion musical exige agregar su entrada al JSON; `tests/audioMix.test.js`
  detecta huecos, claves obsoletas, valores fuera del rango permitido y modificadores de volumen
  escondidos en llamadas `playSfx`

SFX usados:
- click valido
- skip_next_battle para cambios/fases
- play_monster
- play_monster_effect
- play_monster_heavy
- play_land
- draw
- draw_one
- attack
- defend
- activate_effect
- buff

Reglas interesantes:
- click valido en casi todo debe sonar
- seleccionar target de Sunshower usa sonido land, no play_monster
- las variantes organicas de raices/ramas usan `monogreen_buff.mp3`; los buffs visuales default,
  las ganancias de vida, Vampiros, otros decks y todos los buffs de la Horda conservan `buff.wav`
- horda entrando al campo usa draw/draw one segun contexto

## Musica dinamica

Hay musica por colecciones/numeros.
- Battle Theme se reproduce al iniciar.
- Cuando player life <= 10, entra el climax correspondiente a la misma coleccion.
- Si suena climax de #1, UI debe seguir mostrando Battle Theme #1.
- Mini reproductor tiene atras, pausa, siguiente, mute, volumen y lista.

No reiniciar cancion al mutear/desmutear.

## Toasts

`ToastStack` abajo/derecha.

Se usan para:
- no puedes jugar carta
- ya jugaste tierra
- no puedes bloquear flying sin reach
- discard por efecto de Horda
- efectos de Horda
- copiar seed

Tonos:
- horde debe verse negro/gris
- warning para accion invalida

## Start menu

Debe tener:
- seed random por defecto
- boton copiar seed con toast
- boton regenerar seed
- toggle Developer mode
- selector de deck
- boton View para deck inspector

Developer mode usa seed literal `developer`.

## Deck Inspector

Pagina para revisar cartas del deck:
- usa header comun del juego
- dropdown custom, no native select
- zoom de cartas guardado en localStorage
- no mostrar duplicadas como cartas separadas; usar badge xN
- click abre detalles
- modal de detalles debe ser el mismo estilo/estructura del juego
- next/anterior cerca del modal, no en extremos de pantalla
- cerrar modal limpia seleccion
- tooltips de keywords deben quedar encima del grid

## Graveyard viewer

Se puede abrir desde:
- contador de graveyard de Horda en HUD
- contador de graveyard del player en HUD

Modal:
- debe estar por encima de mano
- grid de cartas en graveyard
- click abre detalles
- next/anterior

## Z-index / overlays importantes

Hay varios overlays con z-index altos:
- CardDetailsModal: z 300
- Tooltips: z 360
- SpellTargetingOverlay arrows: z 104
- Counter/Spell target source panel: z 108
- targetable cards: z 95
- effect lifted card: z 96
- backdrop targeting: z 83/84

Cuando una carta target valida queda debajo del fade, usualmente el problema es un stacking context padre con z bajo. No subas todo el battlefield a ciegas; sube el contenedor concreto solo cuando tiene target valido/locked.

## Reglas de implementacion

1. Mantener cambios pequenos y verificables.
2. Preferir engine para reglas, store para secuencias/animaciones, components para visual.
3. No programar cartas por nombre salvo developer seed o bridges temporales claramente marcados.
4. Para efectos nuevos, preferir JSON generico + `EffectResolver`.
5. No romper animaciones existentes por refactors grandes.
6. No usar parser de texto de Magic.
7. No reintroducir features viejas de MVP si el usuario las limpio.
8. Probar con `tsc -b` despues de cambios.
9. Si una regla visual tiene logica de verdad (que carta va en que stack, que slot se sostiene), sacarla del componente a un modulo puro y testearla. Ver `battlefieldLayout.ts` y `docs/testing.md`.
10. Al arreglar un bug reproducible en logica pura: escribir el test primero y confirmar que falla contra el codigo viejo antes de aplicar el arreglo.

## Cosas que el usuario suele preferir

- Ir poco a poco.
- UI menos tecnica y mas gameplay.
- Explicar si un flujo es confuso antes de cambiarlo mucho.
- Animaciones en queue, no todo a la vez.
- Los targets validos deben estar claros, pero sin bordes exagerados en estado final.
- Si algo queda raro visualmente, hacer ajustes chicos iterativos.

## Cambios recientes que importan

- L3 migró los cuatro decks uno por uno al schema Hostfall `1.0.0`. `mono_green_ramp` usa `CHRONICLER`,
  `energyCost`, `kinds`, `modifiers`, `endurance`, `traits`, `FIELD`, `INVOKED`, `exhaust` y
  `GAIN_ENERGY`. `src/data/hostfallDeckAdapter.ts` es el único puente temporal hacia los aliases
  que todavía consume el engine; Mono Green, Vampiros, Zombies y Trasgos ya están migrados.
  El deck lint rechaza campos legacy dentro de cualquier deck `1.0.0` y una regresión comprueba la
  equivalencia de los cuatro decks migrados. No extender el adaptador fuera de L3/L4 ni leer el JSON authored
  directamente desde UI.
- `DECK_REGISTRY` es el único punto de registro y el deck lint
  (`scripts/lint-decks.mjs` + `tests/deckLint.test.js`) rechaza cualquier reintroducción del schema
  authored legacy.
- `EffectResolver.resolveEffect` es un registro (`EFFECT_HANDLERS`): agregar un efecto = agregar un handler ahi; el vocabulario del lint deriva de las keys automaticamente. La metadata de presentacion (`hasEffectPresentation`, `EFFECT_ANNOUNCEMENTS`) vive junto al registro — el store ya no re-aprende tipos de efectos para elegir animacion/toast.
- Reglas de horda como data: `game.hordeRules` viene del `rulesProfile` del deck JSON. El +1/+0 de surge es exclusivo del deck zombie (test lo cubre); goblins usa la misma base sin bono.
- Puentes por nombre eliminados: `wildwood_scourge`/`biogenic_upgrade`/`elvish_archdruid` eran codigo muerto (cartas ya no existen); `sunshower_druid` en CounterTargetingOverlay se generalizo a "todo trigger manual de entrada es obligatorio" via `findManualEnterTargetTrigger`. El unico bridge por definitionId vigente es `smallpox` (marcado `engineSupport: "custom"`); el seed de developer conserva su preparación genérica.
- Fix de stacking/reorden en combate: `groupBattlefieldCopies` congela la key de grupo previa de cada carta (`battlefieldGroupKeys`) durante TODA la secuencia de Horda (combate + beats, `holdCasualties`), y cada grupo recuerda su orden/suborden/ancla (`battlefieldGroupMeta`) mientras exista — una muerte dentro de un stack nunca reordena la fila ni remonta el stack.
- Layout del campo extraido a `src/components/battlefieldLayout.ts` (funciones puras + tests). Ahi vive la regla que arreglo el bug de reagrupado: **solo criaturas sostienen slot y solo criaturas pueden heredar uno**. `battlefieldCardOrder` es el registro de la fila de criaturas y `renderCardStacks` purga de el todo lo demas en cada render, asi que tierras y other permanents (Graf Harvest, los Forest del player) parecen recien llegados siempre; sin ese guard, el primero de ellos se comia el slot sostenido apenas moria una carta y toda la fila se recentraba a mitad de la secuencia de ataque. Por eso pasaba con zombies (Graf Harvest) y en defensa (tierras), pero no con un campo de goblins pelado.
- Contratos engine-store (fase 4): las acciones del engine (playLand/castCard/recycleEnergy/activateAbility/declareBlocker) escriben `game.lastActionResult = { ok, reason }`; el store lee eso, NUNCA compara strings de `game.log`. Los toasts de descarte se derivan del diff mano->cementerio (`notifyDiscardEffects`), no de parsear texto de log. El log es solo display.
- `useGameStore.ts` quedo fragmentado: beats de Horda en `hordeBeats.ts` (con `resetHordeSequence`/`hordeSequenceEpoch` para invalidar callbacks al resetear), Smallpox en `smallpoxSequence.ts`, y helpers compartidos en `presentationEffects.ts` (`startBuffBeat`/`startLifeBuffBeat`/`flashAutoPaidLands` reemplazan los bloques de timers copy-pasteados). Hay imports circulares deliberados store<->modulos (solo se usan en runtime, nunca en evaluacion de modulo).
- `goblin_assault_horde` paso de deck solo-inspector a deck de Horda seleccionable via `getHordeDeck` en `decks.ts`. Mogg Mob se simplifico a criatura vanilla 3/3; la obligacion de atacar de Goblin Rabblemaster esta marcada `ignored` porque la regla global de la Horda ya la satisface.
- Hobgoblin Bandit Lord ya no tiene su burn pendiente: al entrar cuenta los Goblins que entraron
  este turno y usa el beat Burn contra una criatura del player. Cuando su aura estatica ya hizo
  el pulso dorado, el ETB se resuelve despues en cola sin volver a iluminar la carta. La entrega
  entre ambos beats es corta (160ms) y la cola se libera 360ms despues de aterrizar el buff; las
  lineas pueden terminar mientras comienza el Burn para no frenar los efectos posteriores.
- Battle Cry Goblin se simplifico para este modo: al entrar da +1/+0 a los Goblins de la Horda
  hasta fin de turno. Haste y Pack tactics se omiten; el ETB pulsa una vez y el beat de buff no
  vuelve a iluminar la fuente.
- Raid Bombardment cuenta una sola vez cada Goblin atacante de fuerza 2 o menos y guarda el dano
  hasta que termina toda la secuencia animada de ataque. Entonces pulsa una vez y dispara una
  rafaga Burn compacta hacia la vida del player con un unico impacto por el total.
- Siege-Gang Commander conserva solamente su ETB de tres tokens; se elimino el modo activado de
  sacrificar un Goblin para hacer dano. Pashalik Mons conserva solamente el Burn cuando muere otro
  Goblin; se elimino su modo activado de sacrificar para crear tokens.
- Goblin Chainwhirler usa FIRST_STRIKE real en combate. Su ETB pulsa una sola vez y luego dispara
  una rafaga Burn con una ruta, salida, impacto y sonido por cada objetivo (vida del player y cada
  criatura). Los impactos se escalonan visualmente, pero todo el dano se aplica simultaneamente
  en el ultimo.
- Las keywords inglesas de varias palabras se presentan con espacios (`FIRST STRIKE`), nunca con
  el identificador interno `FIRST_STRIKE`; carta, preview y tooltip comparten esa localizacion.
- Diregraf Captain conserva perdida de vida (no dano), pero la difiere hasta el impacto de
  `BURN_PLAYER_LIFE_LOSS`: una bola Burn negra, aceitosa y con brillo violeta usa temporalmente
  los mismos sonidos de lanzamiento e impacto que el fuego normal.
- General Kreat conserva la regla natural: uno o mas Goblins atacando crean exactamente un token
  tapped y atacando. Cada otra criatura que entra encola su propio Burn de 1 a la vida; no se
  agrupan danos. El token creado por el propio General encadena ese Burn sin volver a iluminarlo,
  usando `causeSourceId` para reconocer que ambos beats pertenecen a la misma cadena.
- `LIFESTEAL` es una keyword real de combate del player: recupera vida igual al dano de combate
  que la criatura hace al Host o a una criatura mientras bloquea. La recuperacion del ataque se
  aplica por atacante en el punto de impacto de `PlayerAttackAnimator`; la defensa lleva
  `playerLifeGain` en cada `HordeAttackEvent` y aterriza en el mismo frame que su dano. Una criatura
  muerta por FIRST_STRIKE antes de responder no recupera vida; una que muere en dano simultaneo
  si. El HUD usa `startLifeBuffBeat` y `buff.wav`, sin pulso de habilidad activada. Murcielago
  Carmesi usa esta regla generica en ataque y defensa. Condesa del Banquete Eterno la recibe
  mediante una condicion estatica solo durante el turno del player, de modo que recupera vida al
  atacar pero nunca al bloquear; Centinela de Sangre conserva solo `VIGILANCE`.
  Cada impacto de ataque con Robo de vida reutiliza los mismos colmillos y splash visual, anclados
  al emblema de vida/deck de la Horda y sincronizados con el inicio visual del descarte. Por ahora
  esa mordida no reproduce sonido para no confundirse con el pago de vida; no se dispara al
  defender. Las mordidas activas se conservan como lista para que atacantes consecutivos no corten
  la cola de gotas de la anterior.
- Guardian de la Cripta tiene `REACH` y usa el evento generico `SURVIVED_DAMAGE`: cada instancia positiva de dano,
  de combate o no, lo encola solamente si sigue en campo despues del impacto. No tiene limite por
  turno, por decision del usuario; varios impactos que sobreviva crean varios triggers. El evento
  queda antes de las muertes causadas por el mismo impacto. El dispatcher compartido alterna
  automaticamente runners por controlador, incluso cuando el trigger nace de un Burn de la Horda,
  para que ninguna reaccion del player se consuma de forma invisible. El beat pulsa al Guardian,
  resuelve sus 2 vidas y anima el HUD con `startLifeBuffBeat`.
- Paje de la Sed obtiene +2/+0 la primera vez que el player pierde vida en cada turno solamente
  si el Paje esta enderezado cuando ocurre la perdida. La condicion generica
  `SOURCE_IS_UNTAPPED` evita que una fuente agotada entre siquiera a la cola de reacciones. Por
  decision del usuario, esta restriccion es una regla interna y no se agrega al texto impreso. Toda ruta
  de perdida —dano de combate, Burn, efectos `LOSE_LIFE` y pagos— pasa por `losePlayerLife`, que
  emite `LIFE_LOST` y acumula `player.lifeLostThisTurn`; el contador se reinicia al comenzar tanto
  el turno del player como el de la Horda. Los pagos ademas conservan su evento especifico
  `LIFE_PAID`. Los impactos animados posteriores se recalculan contra el board actual, de modo que
  dejar pasar un atacante puede buffear al Paje antes de que haga dano como bloqueador de otro.
- Pacto de Sangre muestra `Coste adicional: Paga 5 vidas.` en una sola linea antes de robar 2. El pago es atomico con el
  mana, no se permite si dejaria al player en cero y emite `LIFE_LOST` y `LIFE_PAID`; por eso puede
  consumir la primera perdida de cualquier turno y activar al Paje de Sangre. En el store el Paje
  queda diferido hasta terminar su presentacion dedicada `BLOOD_PACT`: la carta real sale desde su
  posicion en la mano hacia un punto entre el centro y el lateral derecho, el mordisco golpea el
  emblema de vida con `blood_splash2.mp3` y `punch.mp3` superpuestos,
  `countess/countess_laugh_short.mp3` entra a los 0.2 s, y el flujo Three.js mancha y disuelve la
  carta. La simulacion usa delta time normalizado para conservar la forma de los orbes en monitores
  de alta frecuencia. El
  fade queda debajo del HUD de vida y de la sangre. La mano sigue su sistema normal, sin copiar la
  reorganizacion ni las cartas dummy del laboratorio; las dos cartas robadas se mantienen ocultas
  hasta que Pacto termina de consumirse y entonces entran juntas con `draw_one.wav`.
- Todo pago de vida que no usa la presentacion completa de Pacto dispara el beat reutilizable
  `lifePaymentAnimation`: colmillos y splash de gotas sobre el emblema, ola roja en el HUD,
  `blood_splash.mp3` a volumen 0.2058 y el numero `-N` con contorno oscuro; este beat no reproduce
  `punch.mp3`. Se detecta por el incremento real de `lifePaidThisTurn`, asi que dano de combate,
  Burn y efectos `LOSE_LIFE` conservan su presentacion normal.
- Condesa del Banquete Eterno usa un coste de vida `CURRENT_LIFE_FRACTION` 1/2 con redondeo `UP`.
  `lifeCostAmount` lo calcula contra la vida justo antes de pagar: con 11 paga 6 y queda en 5.
  Sigue respetando la regla de conservar al menos 1 vida, y el pago dinamico dispara las mismas
  reacciones y beats de presentacion que los pagos numericos. La carta omite el redondeo para
  mantener el texto corto. El estudio imprime primero `Coste adicional: Paga la mitad de tus
  vidas.`, despues `Volar. Vigilancia.` en una sola linea y al final aclara que tiene Robo de vida
  durante tu turno. La regla conserva el tamano normal del texto de Vampiros; para ganar espacio
  solamente se reduce el lore. El titulo de la Condesa usa un tamano intermedio mayor que el
  preset normal de nombres largos. Sus voces se resuelven mediante las reglas reutilizables de
  `cardVoiceInteractions.ts`: `enter` siempre al entrar; `humans` cuando otra criatura con subtipo
  `Human` entra mientras ella ya esta en campo; `third_attack` siempre en su tercer ataque
  confirmado, con maximo una reproduccion por combate aunque varias Condesas lleguen juntas a ese
  conteo; y al bloquear tiene 50% de silencio, mientras el 50% hablado se reparte por igual entre
  `pour` y `weak`. Estas frases usan 49% del volumen base; la risa corta de Pacto de Sangre
  conserva su volumen normal. Cada permanente conserva `attacksMade`, que solo avanza cuando el
  combate del player se confirma. Centinela de Sangre tiene los subtipos `Human`, `Vampire` y
  `Knight`, de modo que la interaccion no depende de su nombre y se extiende automaticamente a
  futuros Humanos.
- Impulso Carmesi es Instant `{1}` con `Coste adicional: Paga 2 vidas.` en una sola linea: solo puede elegir una criatura
  aliada y le da +2/+2 y `FLYING` hasta fin de turno, de modo que tambien puede convertirla en
  bloqueador de voladores durante el combate de la Horda. `castCard` valida cada objetivo contra
  `targetCandidatesWithSelectedTargets` antes de gastar mana o vida, asi que llamadas directas al
  engine tampoco pueden saltarse el controlador/filtros declarados en JSON. En el flujo dirigido,
  un `LIFE_LOST` del spell queda diferido para que el Paje pulse y luego reciba su buff, incluso
  durante el turno de la Horda, igual que con habilidades activadas.
- Drenar la Esencia es Instant `{2}` y, por decision del usuario, puede elegir cualquier criatura,
  no solo una de la Horda. Le hace 3 de dano no de combate y luego recupera 2 vidas aunque la
  criatura sobreviva; esto permite usarlo sobre criaturas propias, incluido el Guardian de la
  Cripta, que ademas dispara su propia recuperacion si sobrevive: son 4 vidas en total. El dano
  dirigido por un spell usa `DEAL_DAMAGE_TO_TARGET`, conserva el dano marcado si no es letal y
  entrega las muertes letales a la cola compartida de reacciones. La recuperacion activa el beat
  generico de vida del HUD.
- Sed Depredadora conserva su nombre, arte, coste `{2}` y tipo Instant, pero ya no elige objetivo:
  concede `LIFESTEAL` a todas las criaturas aliadas hasta fin de turno. Reutiliza
  `GRANT_KEYWORD_UNTIL_END_OF_TURN` con el target generico `ALL_CREATURES/SELF`; el diff de
  presentacion detecta keywords temporales nuevas y pulsa todas las criaturas afectadas.
  `cleanupEndStep` elimina la keyword.
- Banquete Final es Instant `{3}`: solo elige una criatura de la Horda, registra su fuerza efectiva
  (incluidos contadores, auras y buffs temporales), la destruye y despues hace perder esa cantidad
  de vida al player. `ResolveContext.lastKnownStats` conserva esa informacion entre los efectos
  `DESTROY_TARGET` y `LOSE_LIFE`. Es perdida, no pago: puede llevar al player a cero y no incrementa
  `lifePaidThisTurn`, pero si activa al Paje cuando es la primera perdida del turno. El store difiere
  la resolucion bajo `FINAL_BANQUET`: la carta queda visible y fija en la posicion del targeting,
  absorbe hacia si una corriente de gotas de sangre desde la vida del player y dispara desde su
  centro un proyectil compacto y veloz de humo procedural: una cabeza densa, trail corto y chispas
  viajan juntos, en vez de llenar toda la ruta como un rayo. Al alcanzar al objetivo estalla en una
  nube de humo sin overlays rectangulares; la criatura usa el fade de muerte normal del campo y
  solo al terminar se comprometen la destruccion y la perdida de vida. Los triggers de muerte y la
  reaccion del Paje conservan el orden real de la cola antes de presentar cada beat.
- Las entradas de la Horda cuentan como animacion pendiente real: `runHordeMain`, el Play
  individual del Playground y los beats que crean permanentes incrementan
  `summoningAnimationCount`; `Battlefield` lo decrementa al terminar cada entrada. Auras, ETBs,
  reacciones y combate esperan a cero. `animatedHordeIds` se inicializa con el board montado para
  que el primer Execute no vuelva a animar permanentes viejos.
- Los cinco generadores bajo `dev/tools/Decks/` comparten las reglas de texto de
  `deck-card-text.js`, incluso Mono Green aunque conserve su layout propio. Keywords, modificadores
  de stats, frases de contadores y `crea/crear/invoca/invocar ... N/N` se imprimen siempre en negrita con el color
  de la faccion; umbrales `fuerza N o menos` y cantidades `N de dano` se resaltan en rojo. Cada
  frase explicita `Paga N de Vida.` tambien se imprime en rojo y negrita. En Vampiros, los Hechizos con
  pago adicional mantienen `Coste adicional: Paga N de Vida.` en una sola linea y separan el efecto; Acólito usa
  `Agota y paga 5 de Vida: Gana {E}.`. Las cartas imprimen `Agota` como texto en negrita y con el
  acento de su faccion, no el reloj de arena. Cada `{E}` representa una unidad; las cartas repiten
  el icono en lugar de anteponerle un número.
  Cada
  oracion/habilidad ocupa su propio parrafo y los efectos secuenciales unidos por `y luego
  crea/lucha` tambien se separan. Una causa y su consecuencia directa permanecen juntas: Noosegraf
  usa `quita ... e Invoca ...`, y Sunshower `pon ... y ganas ...`. La regresion pura vive en
  `tests/deckCardText.test.js`.
- Los estudios ya no mantienen copias editables de reglas. Para cada deck jugable,
  `scripts/card-studio-data.mjs` deriva nombre, texto, coste, stats y cantidad del JSON runtime y
  los combina con `studio.config.json`, que contiene solamente arte, línea de tipo, lore y
  decisiones visuales. Cada índice consume `deck-data.generated.js`; el archivo es generado y no
  se edita. Los mirrors anteriores y los arreglos embebidos fueron eliminados. Cazadores es la
  única excepción porque sigue siendo preview sin deck runtime: su configuración contiene las
  definiciones completas.
  `export_cards.cjs` sincroniza la proyección, exige arte local separado, exporta a
  `public/cards/` y actualiza `dev/tools/Decks/generation-manifest.json`. Ese manifest prueba frescura
  con hashes del deck, configuración, renderer, fuentes, arte y PNG. Los estudios no dependen de
  CDN. El flujo y los comandos están en `dev/tools/Decks/README.md`.
- El estudio de Zombies y `horde-zombies.json` comparten vocabulario visible Hostfall para sus 17
  definiciones: `Eco`, `Eco · Ficha`, `Apoyo`, `Hechizo`, `Hueste`, `Archivo`, `Memoria`,
  `Cronista`, `Imponente`, `Letal` y `Furtivo`. Crear fichas se redacta con `Invoca`; enviar cartas
  del Archivo a la Memoria se escribe completo y no recibe keyword. `Apoyo` conserva el glifo del
  tipo Support. Habilidades todavia inactivas, como regresar los Stitchwing desde la Memoria, y las
  activaciones pendientes de Graf Harvest permanecen en los datos internos pero no se imprimen.
  La regresión compara cantidad, coste, stats, tipos y texto del estudio contra el deck runtime, y
  rechaza vocabulario visible retirado. Sus 17 PNG todavía no fueron regenerados: no existe arte
  fuente separado y el exportador bloquea sus rutas circulares antes de sobrescribirlos.
  Smallpox imprime `sacrifica una Fuente`: la Fuente es la carta permanente elegida, mientras que
  Energía es el recurso que genera. Su prompt runtime también pide `Elige una Fuente para
  Sacrificar`. El índice usa el mismo header mínimo de los decks migrados y su glifo de Eco mide
  56px, el doble del icono legacy. Todos los generadores activos imprimen `© HOSTFALL 2026` en el
  footer en lugar de `Hostfall TCG`.
- El estudio de Goblins y `goblin_assault_horde.json` mantienen alineadas sus 17 definiciones con
  vocabulario visible Hostfall: `Eco`, `Eco · Ficha`, `Apoyo`, `Hechizo · Rápido`, `Hueste`,
  `Archivo`, `Cronista`, `Imponente` y `Reflejos`. Las fichas usan `Invoca`; Rundvelt mira la
  primera carta del Archivo, Invoca un Eco Trasgo y manda cualquier otro tipo al fondo. No usa el
  Olvido. Maestro Chatarrero imprime solamente su
  aura: la activación para destruir artefactos permanece modelada, pero no se muestra porque la
  Hueste todavía no tiene una política para usarla. La obligación de atacar del Agitador continúa
  omitida porque la regla global de la Hueste ya la cumple. El header es mínimo, el glifo de Eco
  mide 56px y la regresión compara cantidad, coste, stats, tipo y reglas contra el deck runtime.
  Sus 17 PNG tampoco fueron regenerados: no existe arte fuente separado y el exportador bloquea
  sus rutas circulares antes de sobrescribirlos. El usuario aceptó conservar esta excepción hasta
  que el arte definitivo los sustituya en L6. No se cambiaron nombres, arte, balance, ids ni
  aliases del motor.
- Cazadores sigue siendo un estudio preview de 13 definiciones y 40 cartas, sin deck runtime ni
  mecánicas registradas. `hunters/studio.config.json` es su única fuente editable y genera la
  proyección que consume el índice. La presentación usa
  `Fuente`, `Eco`, `Eco · Ficha`, `Eco de Crónica`, `Apoyo`, `Hechizo` y `Hechizo · Rápido`;
  `Trampa` es subtipo de Eco, no tipo adicional, y conserva su glifo propio. Lyra es el Eco de
  Crónica. `Marcado`, `Aturdido` y `Atado` están definidos en `docs/game_vocabulary.md` solamente
  como Estados preview y no deben anunciarse como implementados. El header es mínimo, los Ecos
  Cazador usan el glifo de 56px y los estados nombrados se resaltan aparte de los Rasgos. Este pase
  no exporta ni regenera PNGs bajo `public/cards/hunters/`.
- El generador de Vampires toma sus WebP de arte recortado desde
  `public/cards/vampires/art/`. Los PNG completos exportados que consume el juego permanecen en
  `public/cards/vampires/` y el manifest `vampire_preview_images.json` debe seguir apuntando a esos
  PNG de la raiz, no a los WebP de `art/`. La Corte Carmesi ya es un deck jugable de 40 cartas;
  su estudio imprime el vocabulario Hostfall (`Eco`, `Fuente`, `Hechizo`, `Hechizo · Rápido` y
  Rasgos canónicos). `Eco` usa un glifo propio de resonancia, al doble del tamaño del icono legacy,
  en vez de la huella; Fuente usa el mismo diamante que Mono Green y la Condesa se presenta como
  `Eco de Crónica`. Las cartas imprimen `Agota` como verbo; Energía conserva el rayo dorado dentro
  del orbe de 64px de Mono Green, con el mismo material oscuro, reflejo superior, borde de latón y
  sombra. La gota del sello del header está centrada ópticamente
  dentro de su círculo.
  conserva el id interno `vampire_chronicle_preview` para no romper escenarios guardados, pero su
  metadata visible ya no dice Preview/Early Access. El manifest activa `showFullCardImage` para que
  mano, targeting y previews usen la carta completa. `cardThemeForDefinition` deriva el tema
  `vampire` desde `DECK_REGISTRY`; el header recortado, los stats dinamicos y los badges de keywords
  usan la paleta borgona del generador. El motivo del header/runtime es
  `dev/tools/Decks/vampires/motivo.avif`, una copia optimizada del JPG fuente; el generador conserva
  el JPG de resolucion completa para exportar. Developer Mode coloca cuatro tierras del player deck
  seleccionado, asi que Vampires inicia con cuatro Energias Carmesi en vez de Forests. El primer
  pase de balance subio `gameplayLandCount` a 12 (Mono Green conserva el default de 9), hizo
  1/3 al Paje, 2/2 al Murcielago, 3/3 al Duelista y 3/5 al Centinela. El ajuste siguiente dejo
  Acólito en coste 1, stats 1/2, pago de 5 vidas y dos copias; dejo al Duelista en 3/3 con buff
  +3/+1, retiro Robo de vida y bajo a 3/4 al Centinela, subio la Condesa a dos copias y la hizo
  5/5 con `FLYING`, `VIGILANCE`, Robo de vida solo durante el turno del player y pago adicional de
  media vida redondeada hacia arriba.
  El mismo ajuste bajo Impulso a coste 1 con
  +2/+2 y Volar, bajo Drenar a coste 2 y convirtio Sed en Robo de vida global hasta fin de turno.
  Pacto e Impulso permanecen en dos copias, Sed en una y Banquete Final cuesta 3. La regresion del
  estudio compara coste, stats, cantidad y texto contra el deck runtime. `export_cards.cjs`, tanto desde `.cmd` como desde
  `.command`, escribe cada PNG en `exported-png/` y tambien lo sincroniza directamente con la
  carpeta correspondiente bajo `public/cards/`; ya no se copian los exports manualmente. Los 14
  PNG de Vampiros fueron regenerados con el vocabulario vigente y tienen huella válida en el
  manifest de generación.
  El Duelista usa `PUMP_UNTIL_NEXT_PLAYER_TURN`: su +3/+1 sobrevive la limpieza del turno del
  player, aplica al bloquear durante el combate de la Horda y se elimina al comenzar el siguiente
  turno del player. Banquete Final es Instant y Pacto de Sangre cuesta 1 mas el pago de 5 vidas.
- Las cartas mono-green usan sus PNG completos de 976x1360 desde
  `/cards/mono_green_ramp/*.png` en todas las superficies del juego: mano, mulligan, battlefield,
  targeting, previews, cementerio, animadores, inspector y selectores de deck. El manifiesto
  `mono_green_ramp_images.json` es la fuente unica de esas rutas. Los renderers runtime de caras
  HTML (`MonoGreenHandCardFace`, `HostfallCardFace`, `DeckCardVisual` y el prototipo Sunshower)
  fueron eliminados: las cartas vigentes se producen con los generadores bajo `dev/tools/Decks/`
  y el juego consume exclusivamente sus imagenes completas.

  Los 13 PNG de Mono Green fueron regenerados con el vocabulario vigente y tienen huella válida
  en el manifest de generación.

  El estudio Mono Green y su JSON runtime único imprimen el vocabulario Hostfall (`Eco`, `Fuente`,
  `Hechizo`, `Hechizo · Rápido`, `Guardia aérea`, `Letal` y `Veneno 1`) sin cambiar los ids,
  tipos o keywords internos del motor. `Eco` usa el mismo glifo grande de resonancia de Vampires;
  la detección de carta full-art del estudio reconoce `Fuente` en lugar de `Tierra`. `TRAMPLE`
  sigue funcionando internamente y permanece oculto en la presentación vigente; no se imprime
  `Desborde` hasta que esa keyword se exponga deliberadamente. Esta fase tampoco cambia nombres,
  arte ni regenera los PNG de `public/cards/mono_green_ramp/`. La regresión
  compara las 13 cartas del HTML, ambos JSON del generador y el texto visible del deck runtime.
  Sus productores de Energía usan un rayo dorado dentro del mismo orbe material de Agotar y
  `Veneno N` presenta N en un badge holgado. El texto usa `gana` para modificadores temporales y `pon un contador ... sobre` para
  contadores permanentes; `obtiene` queda fuera del vocabulario de reglas nuevo.
  Los índices de Mono Green, Vampires, Zombies, Goblins y Hunters usan un header mínimo común con
  título y línea temática, sin controles, estado ni mensajes de exportación; Vampires abre sus
  cartas al 35%.

  Todas las imágenes runtime se resuelven exclusivamente desde los manifests locales hacia
  `public/cards`. No existe fallback remoto, consulta de metadata ni caché de respuestas de un
  proveedor de cartas. Los JSON runtime tampoco conservan set codes, números de coleccionista o
  bloques de lookup heredados.

  El rombo de disponible pertenece a
  `.hand-card`, pero su render
  esta detras de `showPlayerHandActionableGems`, actualmente inactivo. Los PNG de mano deben usar
  `image-rendering: auto`: `-webkit-optimize-contrast` vuelve punteados los bordes dorados finos al
  reducirlos y rotarlos en el abanico. El exportador apaga la sombra exterior de `.tcg-card` al
  capturar para que las cuatro esquinas terminen con alfa cero. La ruta `showFullImage` no debe
  heredar el fondo/sombra base de `Card` y la imagen se recorta con el radio equivalente
  `4.918% / 3.529%`. El hover de mano escala `.hand-card` completa mediante Framer Motion; no debe
  animar su ancho/alto reales porque obliga a recalcular por subpixel las unidades `cqw` del coste
  y las keywords, que entonces parecen brincar. El contenedor transparente de `Card` conserva ese
  mismo radio para que el glow naranja de drag siga la silueta redondeada y no dibuje un panel
  rectangular detras. Los previews fuente de targeting
  (`CounterTargetingOverlay` y `SpellTargetingOverlay`) tambien deben consultar
  `shouldShowFullCardImage`; si no, cartas como Sunshower Druid y Giant Growth heredan el recorte
  generico de `Card`. Cuando usan la imagen completa tambien deben activar
  `preferNativeImageRendering`, igual que la mano, para conservar el mismo sampling CSS. Las cartas
  mono-green recortadas dentro de `Battlefield` tambien activan ese sampling nativo, pero NO
  `showFullImage`: el recorte del battlefield se conserva. Su badge dinamico adapta el
  `tcg-stats-badge` impreso al espacio chico (espada dorada, slash gris, corazon rojo y numeros
  blancos), usando la paleta vegetal del generador `dev/tools/Decks/monogreen/index.html` como
  fuente de verdad. `stats.buffed` debe leerse
  solamente dentro del badge dinamico; no debe agregar marco verde ni veladura sobre el arte de la
  carta recortada. En battlefield, el badge cutted es una adaptacion compacta de la pestana impresa:
  conserva `ataque / resistencia` sin iconos, la silueta redondeada, el degradado vegetal, el grano
  tenue y el filete dorado interior; el buff sube claramente la luminosidad, el contraste y el glow
  sin llegar a verde fosfo. En esas mismas
  criaturas cutted, el titulo horneado dentro del PNG se cubre con un header HTML localizado,
  nitido y del mismo lenguaje HUD; esta capa es exclusiva del battlefield y no se propaga a mano,
  previews, mulligan, targeting ni deck. El mismo
  `CardStatsBadge` dinamico cubre el badge impreso en mano,
  mulligan, sources de targeting y `CardPreview`; en carta completa usa proporciones `cqw` para
  quedar exactamente sobre la pestana horneada en el PNG. Esa variante full replica las medidas
  198x90 del `index` sobre el ancho fuente de 976px, oculta espada/corazon y muestra solamente
  `ataque / resistencia`. La paleta se deriva del `index` del deck: mono-green conserva su
  degradado vegetal, Zombies usa verde petroleo y Goblins rojo forja tanto en el header cutted
  como en stats, dano y buff. En targeting vienen del estado vivo.
  El preview fijado con click derecho muestra el PNG limpio, sin superponer stats; el hover conserva
  los stats vivos y su estado buffed. En el hover queda unos pixeles elevado; preview, mano y
  targeting comparten la pestana del `index` correspondiente, con variantes legibles para dano y
  buff. El preview compacto de stats que aparece debajo al fijar el objetivo de una carta de buff
  usa la misma pestana redondeada y la paleta de stats del arquetipo objetivo; no vuelve al
  rectangulo verde generico con esquinas cortadas. Las cartas full art se marcan con `fullArt` en el manifest: su badge dinamico replica el
  desplazamiento del generador (58px desde la derecha y 136px desde abajo sobre 976px) para cubrir
  los stats horneados encima de la banda de tipo. No inferir esa composicion por nombre.
  Mano, mulligan, targeting y `CardPreview` tambien cubren el coste impreso con
  `CardCostBadge`: un socket proporcional inspirado directamente en el HUD de energia, desplazado
  fuera de la esquina superior izquierda. Replica el nucleo del HUD de energia: esfera azul con
  liquido giratorio y respiracion de brillo, sin socket metalico ni arco cian exteriores. El nucleo
  usa azules contenidos y el remolino tiene brillo tenue para no competir con el numero. Tanto el
  giro del liquido como el pulso minimo de escala y brillo duran nueve segundos. El numero se
  dibuja directamente sobre la energia con contorno oscuro, sin disco ni fondo central. El orbe
  sobresale ligeramente hacia arriba y a la izquierda de la carta y no recibe una corona adicional
  cuando la carta esta disponible. Las animaciones respetan `prefers-reduced-motion`.
  La Hueste no paga Energía: sus cartas nunca muestran `CardCostBadge`, aunque el JSON conserve
  `energyCost` como metadata de balance. Rasgos y explicaciones de Zombies y
  Goblins usan tambien la paleta de su `index`, no la paleta aliada ni una variante enemiga
  generica. Cuando un enemigo tiene dano marcado, el valor de resistencia visible gana el rojo
  de dano incluso sobre las reglas de color mas especificas de Zombies/Goblins; el ataque permanece
  blanco. Los manifests locales de ambas Hordas son la unica fuente de sus PNG; no conservar
  composicion ni cantidades duplicadas dentro del manifest visual.
  `DeckInspector` muestra el PNG completo limpio, sin `CardCostBadge` ni `CardStatsBadge` en grid,
  preview lateral o modal; `xN` permanece a la derecha.
- Las criaturas cutted del battlefield usan siempre `--battlefield-card-width: 212px`, que era el
  maximo anterior del `clamp`; no deben reducirse segun `vw` ni la altura del panel. El alto
  recortado sigue siendo `0.89 * ancho`. Tierras y otros permanentes conservan el slot compacto
  independiente de `92-118px`.
- El orden de ataque de la Horda ya no se deriva de familias visuales: sigue el orden real de
  invocacion. Dos grupos de tokens separados por un lord atacan grupo 1, lord, grupo 2 aunque el
  layout siga apilando copias iguales. La secuencia de combate no apaga globalmente el idle de
  `FLYING`: solo la carta que participa en el impacto actual pausa su vuelo; las demas siguen
  flotando mientras atacan otras criaturas.
- En developer mode se fuerzan `goblin_token_1_1_red` y `rundvelt_hordemaster`; `Graf Harvest`
  queda explícitamente fuera de esas dos posiciones protegidas.
- `Graf Harvest` debe aparecer como Other permanent overlay izquierdo dentro de la fila principal de Horda.
- Las keywords superpuestas sobre cartas ya no usan pills verdes brillantes ni la placa generica de
  dashboard. Full y cutted comparten el material del header: degradado vegetal oscuro, grano tenue,
  borde dorado, Lora, texto en Camel Case y la silueta redondeada diagonal de los stats. La carta
  completa usa medidas `cqw`; la cutted queda justo debajo del header. Zombies y Goblins toman el
  material verde petroleo o rojo forja de sus respectivos generadores; otros enemigos conservan
  la variante borgona generica y Chaos su magenta. El badge de keyword junto al preview fijado
  comparte este mismo material, tipografia y capitalizacion.
  El orden visual de keywords es estable y empieza siempre por `MENACE`; no depende de si la
  keyword es impresa, temporal o concedida por un efecto estatico. La aparicion del badge de orden
  de defensa de la Horda o del jugador nunca debe desplazar las keywords: ambas capas conservan
  anclas independientes. No mostrar `HASTE`.
- Card hover no debe abrir preview durante targeting cuando `suppressHoverOverlay` esta activo.
- `startSpellTargeting` limpia `focusedCardId`/`hoveredCardId` para que CardInfo no tape Broken Wings.
- La seleccion bespoke de Smallpox conserva el borde de target y la flecha, pero nunca muestra
  `card-actionable-gem`: ni sobre permanentes del battlefield ni sobre cartas de la mano. Durante
  Smallpox o el descarte por limite, la carta seleccionada permanece elevada; el hover de otra
  carta tambien se eleva y usa una capa superior a la seleccionada. El panel de confirmacion de
  Smallpox se ancla fuera del centro derecho de la propia carta de Smallpox; no va
  debajo de ella ni junto a la carta elegida.
- El targeting de hechizos tampoco muestra `card-actionable-gem` sobre sus objetivos: el borde,
  la elevacion y la flecha ya comunican que cartas se pueden elegir.
- La disponibilidad normal en la mano no reutiliza el borde generico de `Card.actionable`: `Hand`
  suprime ese chrome y dibuja una corona cian propia con mascara, intensa arriba y con fade vertical
  a alfa cero antes del borde inferior. Las tierras jugables o reciclables tambien muestran esa
  corona. El orbe de coste no recibe una segunda corona de disponibilidad: la indicacion visual
  permanece solamente en el borde de la carta. Los estados de descarte y targeting
  conservan sus estilos separados; el rombo sigue detras del feature flag.
- La disponibilidad de combate en battlefield reutiliza esa misma corona con fade: naranja para
  criaturas que pueden atacar y cian/azul para blockers o atacantes de Horda validos durante
  defensa, incluido drag. Estos estados reemplazan sus rombos de combate y suprimen el chrome verde
  generico de `Card.actionable`. Las criaturas con activacion de mana disponible usan una tercera
  corona dorada con el mismo fade y tampoco muestran rombo; las tierras quedan excluidas de ese
  chrome aunque internamente tambien tengan una habilidad de agotar. Las tres coronas son exteriores: su
  borde interior termina justo donde empieza la silueta de la carta, sin comerse el arte ni parecer
  marco impreso; targeting conserva sus estilos propios. Naranja, azul y dorado animan la corona
  completa con `hand-available-border-pulse` de 2.1s. Ademas llevan una capa de glow independiente,
  equivalente al pulse extra que `Card.actionable` aporta en la mano: anima sombras de `7/16px` a
  `11/25px` cada 1.5s, teñidas segun ataque, defensa o activacion.
- El boton de activacion de Llanowar Elves y Druid of the Cowl representa `Agotar: generar
  Energía` con los
  mismos orbes visuales del texto impreso del index: reloj de arena marron/dorado para agotar y rayo
  azul para energia. No debe volver a los chips genericos de `renderCardText`.
- Una criatura ya asignada como blocker muestra su orden real en el mismo badge azul con escudo,
  arriba a la izquierda, la zona que permanece expuesta en stacks. El badge reemplaza el tag
  compuesto `Blocking + numero` y puede superponerse al nombre: el titulo no reserva espacio.

## Antes de tocar algo

Leer primero:
- `src/engine/GameTypes.ts`
- `src/engine/GameActions.ts`
- `src/engine/EffectResolver.ts`
- `src/store/useGameStore.ts`
- componente visual especifico involucrado

Si es carta nueva:
- seguir `docs/adding_cards.md`
- revisar su JSON en `src/data/decks/player/mono_green_ramp/mono_green_ramp.json` o el deck correspondiente bajo `src/data/decks/horde/`
- revisar normalizacion en `src/data/normalizeDeck.ts`
- revisar si ya hay efecto generico en `EffectResolver.ts`

Si es UI de campo:
- revisar `Battlefield.tsx`
- cuidado con z-index y stacking contexts
- cuidado con no empujar/recentrar cartas sin querer

Si es target:
- revisar `Targeting.ts`
- revisar `SpellTargetingOverlay.tsx` o `CounterTargetingOverlay.tsx`
- revisar `Card.tsx` hover/context behavior

Si es combate:
- revisar `CombatResolver.ts`
- revisar animadores y `buildHordeAttackEvents` en `useGameStore.ts`

Si es VFX o Three.js:
- revisar `docs/vfx_and_threejs.md`
- conservar los beats y el orden de resolucion de `docs/animation_contracts.md`

## Filosofia del proyecto

Este no es Magic completo. Es una version PvE clara, animada y jugable. Precision total de reglas no es prioridad si hace peor el flujo. Lo importante es:
- decisiones deterministicas
- JSON de cartas cada vez mas generico
- feedback visual fuerte
- UX clara para atacar, defender, castear y resolver efectos
- no esconder reglas importantes al jugador

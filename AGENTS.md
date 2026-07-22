# AGENTS.md

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
    useGameStore.ts       puente UI/engine, animaciones secuenciadas
    useAudioStore.ts      SFX y musica
    useToastStore.ts      notificaciones

  components/
    Board.tsx
    Battlefield.tsx       layout principal del campo
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
        mono_green_ramp/  deck Alpha 0.0.3 del player
      horde/
        zombies/          deck activo por defecto de la Horda
        goblins/          segundo deck de Horda, seleccionable (goblin_assault_horde), menos maduro en reglas
    decks.ts              registra los tres decks y expone getPlayerDeck/getHordeDeck por id
    normalizeDeck.ts      adapta el nuevo JSON del deck al engine viejo

scripts/
  run-engine-tests.mjs    corre tests/engine.test.js via vite ssrLoadModule + node:test

tests/
  engine.test.js          tests deterministas del engine (seed, mana, combate, etc.)
  engineTestUtils.js      helpers para armar game state de prueba
```

## Estado actual del juego

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
- usar algunas habilidades activadas con tap

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
- player inicia con 50 vida
- player inicia con 5 Forest en battlefield
- player opening hand esta controlada por constantes
- horde opening library puede forzar cartas al top

Actualmente se usa para testear rapido:
- cartas concretas en mano
- tierras listas en campo
- `graf_harvest` al top de la Horda para probar permanentes no criatura y Menace

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
- si una carta no tiene rules text util, mostrar flavor text cuando exista

## Decks e imagenes

Deck viejo MVP:
- `player_deck.json`
- `horde_deck.json`
- `cardImageLookups.json`

Estos estan deprecated para el player Alpha.

Deck actual del player:
- `src/data/decks/player/mono_green_ramp/mono_green_ramp.json`
- `src/data/decks/player/mono_green_ramp/mono_green_ramp_images.json`

`src/data/decks.ts` registra los tres decks disponibles:
- player: `normalizeDeck(monoGreenRampRaw)` (`mono_green_ramp`, `DEFAULT_PLAYER_DECK_ID`)
- horde: `horde-zombies.json` sin normalizar (`horde_zombies`, `DEFAULT_HORDE_DECK_ID`)
- horde: `normalizeDeck(goblinHordeRaw)` (`goblin_assault_horde`) — **ya es un deck de Horda seleccionable, no solo de inspector**; tiene mas `engineSupportNeeded` sin resolver (target flexible player/criatura/planeswalker, "must attack if able", conteo de goblins atacantes, etc.), asi que varias habilidades de sus cartas legendarias/lords todavia no tienen handler real
- `getPlayerDeck(id)` / `getHordeDeck(id)` devuelven el deck por id con fallback al default

La nueva estructura de imagenes del deck debe ser la base para el inspector.

## Cartas / efectos ya tratados

### Llanowar Elves / Druid of the Cowl

Efecto generico de tap:
- `{{T}}: Add {G}.`
- se activa con UI de efecto
- animacion:
  1. carta se agranda/levanta
  2. boton de efecto aparece
  3. al confirmar hace pulse dorado + `activate_effect.wav`
  4. luego se tapa con animacion + sonido land

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
- sonido `buff.wav` al aplicar buff

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
- pelea/secuencia debe usar animacion de batalla ya existente, no otra rara
- debe aplicar deathtouch si corresponde

### Giant Growth

Instant:
- puede jugarse en main, battle y defend phase
- target aliado
- al confirmar debe aplicar inmediatamente, quitar la carta de mano y resolver en ese mismo momento

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

### Magnigoth Sentry / Colossadactyl / Timberland Ancient

No requieren programacion extra ahora.

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
- seleccion del defensor puede hacerse por click/drag
- flechas azules de defensor a atacante
- si una criatura atacante tiene MENACE, defender debe bloquearse si solo hay 1 blocker; el boton muestra tooltip explicando
- si no hay bloqueos, boton dice algo tipo "No defend"
- orden de bloqueadores contra un mismo zombie:
  - debe respetar izquierda/derecha segun regla actual
  - mostrar numeritos 1,2 solo si hay mas de un blocker

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
- musica empieza al 10% por defecto

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
- buff de Sunshower usa `buff.wav`
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

## Cosas que el usuario suele preferir

- Ir poco a poco.
- UI menos tecnica y mas gameplay.
- Explicar si un flujo es confuso antes de cambiarlo mucho.
- Animaciones en queue, no todo a la vez.
- Los targets validos deben estar claros, pero sin bordes exagerados en estado final.
- Si algo queda raro visualmente, hacer ajustes chicos iterativos.

## Cambios recientes que importan

- `goblin_assault_horde` paso de deck solo-inspector a deck de Horda seleccionable via `getHordeDeck` en `decks.ts`; falta cerrar varios `engineSupportNeeded` de ese JSON antes de darlo por completo.
- `Graf Harvest` se fuerza al top de la Horda en developer mode.
- `Graf Harvest` debe aparecer como Other permanent overlay izquierdo dentro de la fila principal de Horda.
- Keywords de zombies se muestran debajo de `Tapped`/`Atk`, en verde, mismo tamano/estilo base. No mostrar `HASTE`.
- Card hover no debe abrir preview durante targeting cuando `suppressHoverOverlay` esta activo.
- `startSpellTargeting` limpia `focusedCardId`/`hoveredCardId` para que CardInfo no tape Broken Wings.

## Antes de tocar algo

Leer primero:
- `src/engine/GameTypes.ts`
- `src/engine/GameActions.ts`
- `src/engine/EffectResolver.ts`
- `src/store/useGameStore.ts`
- componente visual especifico involucrado

Si es carta nueva:
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

## Filosofia del proyecto

Este no es Magic completo. Es una version PvE clara, animada y jugable. Precision total de reglas no es prioridad si hace peor el flujo. Lo importante es:
- decisiones deterministicas
- JSON de cartas cada vez mas generico
- feedback visual fuerte
- UX clara para atacar, defender, castear y resolver efectos
- no esconder reglas importantes al jugador

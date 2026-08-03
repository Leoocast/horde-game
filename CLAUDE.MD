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
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\vite\bin\vite.js build
```

No ejecutar `npm install` ni `pnpm install` salvo necesidad real: `node_modules` ya existe. No
levantar un servidor ni jugar para verificar; el usuario prueba el juego. Detalle en
`docs/testing.md`.

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
docs/           contratos operativos, lore y procedencia
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

## Vocabulario Hostfall

Leer `docs/game_vocabulary.md` antes de cambiar nombres, tipos, zonas, fases, Rasgos, reglas o
tooltips.

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
metadata externa ni arte no local. `Blood Pact / Pacto de Sangre` está aprobado: una coincidencia
con un nombre genérico no convierte por sí sola el nombre en identidad ajena.

`scripts/audit-independence.mjs` es una guarda permanente contra regresiones, no un migrador.

## Estado jugable

Decks vigentes:

| Bando | Id | Nombre | Estado |
| --- | --- | --- | --- |
| Cronista | `last_rain` | La Última Lluvia | Jugable |
| Cronista | `crimson_court` | La Corte Carmesí | Jugable |
| Hueste | `hollow_bell_procession` | La Procesión de la Campana Hueca | Jugable y predeterminada |
| Hueste | `broken_forge_mutiny` | El Motín de la Forja Rota | Jugable |

Cazadores es sólo un preview de Card Studio: no tiene deck runtime ni lote final de PNG.

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

No programar cartas por nombre. La excepción bespoke actual es `flesh_root_tithe`, declarada
`engineSupport: "custom"`, cuya secuencia vive en `src/store/fleshRootTitheSequence.ts` y
`src/components/FleshRootTitheSelectionOverlay.tsx`.

Para agregar o implementar cartas, seguir `docs/adding_cards.md`. Documentación específica:

- `docs/chronicle_last_rain.md`
- `docs/procession_hollow_bell.md`
- `docs/mutiny_broken_forge.md`
- `docs/goblin_cards.md`

## Arte y Card Studio

Los manifests de imagen usan sólo `source: "local"`. El arte fuente está separado del PNG de carta
completa, normalmente en `public/cards/<deck>/art/`. Nunca apuntar un generador al PNG final de su
propia carpeta.

Card Studio consume `deck-data.generated.js`, generado desde el JSON runtime. No duplicar reglas,
nombres o flavor en el HTML/configuración. El exportador escribe `exported-png/` y
`public/cards/`, y registra la huella necesaria para `check-card-assets.mjs`.

Los cinco estudios usan `deck-card-studio.js` y `deck-card-studio.css`: existe una sola estructura
de carta y los decks sólo aportan variables de tema, motivo e insignia. El diseño común usa marco
metálico, panel de reglas y motivo. El diseño *full art* no usa marco metálico ni motivo y se aplica
por defecto a todo Eco `CHRONICLE`, a toda Energía `SOURCE` y a los tokens cuyo manifest de
imágenes declare `fullArt: true`; el taller permite sobrescribirlo con `fullArt` por carta. Las
Energías no imprimen coste, reglas ni flavor. Los tokens no imprimen reglas ni flavor y llevan los
stats más abajo. No crear variantes copiadas por deck.

El fade superior de las cartas comunes se controla por carta con `headerFade`; no modifica las
variantes *full art* ni su fade inferior.

Cada carta imprimible declara un `collectorId` global en el JSON runtime. El Acto I usa la serie
continua `HFA1xxx`; `studio.config.json` sólo aporta `defaultArtist` o una excepción `artist` por
carta. El renderer imprime un icono de ilustración seguido del nombre del artista dentro del marco.

Los registros `docs/asset_provenance_*.json` conservan prompts, dimensiones y hashes de los lotes de
arte actuales. Son documentación de activos vigentes.

`showFullCardImage` permite que mano, targeting y previews usen la carta completa. Los stats y
Estados runtime deben seguir superponiéndose cuando cambian durante la partida.

## Campo, targeting y combate

- Las copias pueden agruparse visualmente, pero el grupo y el slot deben permanecer estables durante
  una secuencia de la Hueste. Sólo Ecos sostienen o heredan slots.
- `battlefieldCardOrder`, `battlefieldGroupKeys` y `battlefieldGroupMeta` protegen el orden visual.
- Los targets válidos deben ser claros sin bordes finales exagerados.
- Una Reacción manual de Invocación con target es obligatoria; no depende del id de Iria.
- El ataque del Cronista y la defensa contra la Hueste usan overlays y estados explícitos. No
  resolver reglas de combate dentro de animadores.
- Reflejos se resuelve antes del daño normal; el daño simultáneo se confirma como un solo resultado
  aunque los impactos visuales se escalonen.

Consultar `docs/animation_contracts.md` antes de tocar combate, revelados, muerte, buffs, Burn o
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

VFX y Three.js: consultar `docs/vfx_and_threejs.md` y reutilizar materiales/animadores existentes
antes de crear otra implementación.

## UI y audio

- Paneles oscuros, bordes dorados/café, botones redondeados y materiales físicos.
- Evitar copy técnico cuando puede expresarse como acción de juego.
- `CardPreview` y Details deben reflejar reglas, Rasgos, stats y estados reales.
- Badges de Rasgo y Estado no comparten semántica visual.
- Overlays y previews deben respetar los z-index documentados en los propios componentes/CSS.
- El audio pasa por el sistema central y respeta mute/volumen. No crear `Audio` dispersos en
  componentes.
- La música cambia al tema de clímax cuando la Vida del Cronista baja del umbral configurado.

## Developer mode

El seed literal `developer` activa una preparación determinista para probar cartas y secuencias.
Es una herramienta, no parte del lore. Si se añade una carta que necesita setup especial, preferir
preparación genérica por tipos/efectos antes que un puente permanente por `definitionId`.

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
- Cartas: `docs/adding_cards.md`, JSON del deck, `normalizeDeck.ts`, `deckLint.ts`.
- Campo: `Battlefield.tsx`, `battlefieldLayout.ts` y sus tests.
- Targeting: `Targeting.ts` y el overlay correspondiente.
- Combate: `CombatResolver.ts` y `docs/animation_contracts.md`.
- VFX: `docs/vfx_and_threejs.md`.
- Modos: `docs/game_modes.md`.

La prioridad del proyecto es una experiencia PvE clara, animada y determinista: reglas explícitas,
datos genéricos, feedback visual fuerte y ninguna identidad ajena en el producto final.

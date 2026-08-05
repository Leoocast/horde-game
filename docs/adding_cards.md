# Agregar e implementar cartas

Guía operativa para añadir una carta al juego sin crear reglas paralelas ni efectos silenciosos.

## Fuente de verdad

El recorrido real de una carta es:

```text
JSON del deck
  -> normalizeDeck
  -> CardDefinition / CardInstance
  -> acciones y eventos del engine
  -> EffectResolver / StaticEffects / Keywords
  -> store (secuencia y presentación)
  -> componentes (render y overlays)
```

Archivos autoritativos:

- `src/data/decks/**/<deck>.json`: datos de authoring.
- `src/data/normalizeDeck.ts`: traducción del esquema de authoring al runtime.
- `src/engine/EffectResolver.ts`: handlers de efectos y metadata de presentación.
- `src/engine/effectVocabulary.ts`: eventos, condiciones, cantidades y custom handlers válidos.
- `src/engine/GameTypes.ts`: modelo runtime.
- `src/data/deckLint.ts`: comprueba lo que realmente sobrevive a la normalización.
- `tests/engine.test.js`: ejemplos ejecutables de reglas ya soportadas.

`player_deck.json` y `horde_deck.json` fueron eliminados. No recrearlos: los decks viven bajo
`src/data/decks/`.

## Antes de escribir JSON

1. Buscar una carta con un comportamiento parecido.
2. Revisar si el efecto ya existe en `EFFECT_HANDLERS`, dentro de `EffectResolver.ts`.
3. Revisar si el trigger, condición, filtro y tipo de cantidad ya están en
   `effectVocabulary.ts`.
4. Decidir si la regla puede ser genérica. Programar por `definitionId` es el último recurso.
5. Para una regla pura nueva o un bug reproducible, escribir primero un test que falle.

Ejemplos útiles:

- Efecto activado de maná: `veiled_dawn_flower`.
- Trigger de entrada con target manual: `aelyra_heir_of_elarion`.
- Trigger al entrar otra criatura: `kaelor_stormcaller`.
- Spell con un target: `elixir_of_the_first_leaf` o `the_judgment_of_elarion`.
- Spell con dos targets: `clash_of_echoes` o `shield_of_the_heir`.
- Aura estática: `the_broken_headstone`, `nerezh_graveless_matriarch` o `the_daunting_front`.
- Trigger de muerte: `devourer_of_the_last_memory`, `summoner_of_the_ranks` o `rear_guard_firebreather`.
- Trigger de ataque: `vardek_scribe_of_the_legion`.
- Efecto de Horda con presentación Burn: `rider_of_the_umbral_volley` o `rear_guard_firebreather`.

## 1. Añadir la definición al deck

Los decks viven bajo:

```text
src/data/decks/
  player/<deck_id>/
  host/<deck_id>/
```

El schema Hostfall vigente es `1.0.0` y los cuatro decks activos ya lo usan. Un Eco vanilla mínimo:

```json
{
  "id": "example_guardian",
  "collectorId": "HFA1062",
  "name": "Example Guardian",
  "displayNameEs": "Guardián de ejemplo",
  "gameText": {
    "en": "Whenever another allied Elf is Invoked, this Echo gains +1/+0 until the end of the turn.",
    "es": "Siempre que otro Elfo aliado sea invocado, este Eco gana +1/+0 hasta el final del turno."
  },
  "quantity": 2,
  "energyCost": { "amount": 3 },
  "kinds": ["ECHO"],
  "subtypes": ["Elf", "Warrior"],
  "power": 3,
  "endurance": 3,
  "traits": ["SKYGUARD"],
  "abilities": []
}
```

Reglas:

- `id` se deriva del `name` inglés: minúsculas, sin apóstrofos y con palabras separadas por `_`.
  `cardIdFromName` y el deck lint hacen cumplir ese contrato. Una vez publicada la identidad, el id
  es estable; si se reemplaza el nombre canónico de una carta, todos sus consumidores se migran en
  el mismo cambio. Los lookups runtime son globales a `DECK_REGISTRY`, así que no se reutiliza el
  mismo id para cartas distintas. La excepción es una misma definición de token repetida de forma
  idéntica en `cards` y `tokens`.
- `collectorId` es el identificador impreso y también debe ser globalmente único. El Acto I usa
  `HFA1xxx`: `HF` = Hostfall, `A1` = Acto I y los últimos tres dígitos son la secuencia continua.
  Una misma definición repetida en `cards` y `tokens` conserva el mismo `collectorId`.
- `quantity` controla cuántas copias entran al deck.
- `deckSize` debe coincidir con la suma de `quantity` en `cards`.
- Los tokens reutilizables deben estar en `tokens`; `tokens` no se expande dentro de la library.
  Algunos decks también pueden llevar esa misma ficha como carta real de `cards`.
- `kinds`, `subtypes`, `traits`, `power` y `endurance` son datos estructurados. No se deriva
  gameplay de texto o metadata externos.
- `displayNameEs` es el nombre local del juego; la imagen se resuelve mediante el manifest local.
- `gameText` describe lo que la carta hace realmente en Hostfall, en inglés y español. Los
  detalles de carta no usan oracle text de Magic para explicar reglas, porque varias cartas
  tienen adaptaciones PvE o habilidades deliberadamente inactivas.

Si se está creando un deck de Horda, su personalidad global vive en `rulesProfile`: cantidad de
revelados, parada en no-token, Mini Surge, Surge, descarte del Archivo por daño o Veneno, Ímpetu implícito,
`surgeBonus` y subtipos agrupados por oleada. Esas reglas se construyen con `buildHostRules`; no
hardcodearlas por id del deck.

## 2. Declarar habilidades

Cada habilidad usa uno de cuatro `kind`:

| Kind | Uso |
| --- | --- |
| `STATIC` | Pasivas continuas mientras la Fuente permanece en el Campo. |
| `TRIGGERED` | Reacción a un evento del engine. |
| `ACTIVATED` | Efecto que se activa pagando un coste. |
| `SPELL` | Resolución de un Hechizo desde la Mano o desde el revelado de la Hueste. |

### Habilidad estática

```json
{
  "id": "example_other_elves_buff",
  "kind": "STATIC",
  "zone": "FIELD",
  "effects": [
    {
      "type": "MODIFY_STATS",
      "duration": "WHILE_SOURCE_ON_FIELD",
      "scope": {
        "controller": "SELF",
        "filters": {
          "kinds": ["ECHO"],
          "subtypes": ["Elf"],
          "excludeSelf": true
        }
      },
      "power": 1,
      "endurance": 1
    }
  ]
}
```

`normalizeDeck` convierte esta forma en `STATIC_BUFF`. `GRANT_KEYWORD` con la misma duración se
convierte en `STATIC_GRANT_KEYWORD`. Las estadísticas y los Rasgos se calculan continuamente en
`StaticEffects.ts` y `Traits.ts`; no se guardan como copias del bonus en cada carta.

Las auras estáticas de la Horda reciben presentación automáticamente: el store captura la nueva
cobertura, retiene temporalmente el bonus visual y lo libera durante su beat. No hay que programar
una animación por nombre de carta.

### Habilidad disparada

```json
{
  "id": "example_self_enters_draw",
  "kind": "TRIGGERED",
  "zone": "FIELD",
  "trigger": {
    "event": "INVOKED",
    "source": "SELF"
  },
  "conditions": [],
  "effects": [
    {
      "type": "DRAW_CARD",
      "amount": 1
    }
  ]
}
```

El normalizador crea un wrapper `TRIGGERED_ABILITY`. Si hay varios efectos, los envuelve en
`SEQUENCE` y mantiene el orden declarado.

Los eventos y condiciones aceptados cambian con el engine. No mantener una lista manual en esta
guía: consultar `AUTHORING_TRIGGER_EVENTS`, `ENGINE_TRIGGER_EVENTS` y
`TRIGGER_CONDITION_TYPES` en `effectVocabulary.ts`. El deck lint rechaza valores desconocidos.

Los triggers de la Host se resuelven mediante `EventQueue` y `hostBeats.ts`:

- un source por beat;
- sólo reaccionan permanentes que presenciaron el evento;
- un evento creado por un beat termina antes de continuar con los demás reactores;
- el tablero queda bloqueado y conserva sus slots durante la secuencia.

### Habilidad activada

```json
{
  "id": "example_add_mana",
  "kind": "ACTIVATED",
  "zone": "FIELD",
  "cost": {
    "exhaust": true
  },
  "targets": [],
  "conditions": [],
  "effects": [
    {
      "type": "GAIN_ENERGY",
      "player": "SELF",
      "amount": 1
    }
  ]
}
```

Limitaciones actuales:

- El normalizador sólo admite un efecto por habilidad activada; el lint falla si se declaran más.
- El flujo genérico de `GameActions.activateAbility` es para el player, durante su main phase.
- El schema Hostfall usa `exhaust`, `sacrificeSelf` y `life`; el adaptador los traduce al contrato
  runtime actual. No agregar costes de colores. Si una Acción necesita pagar Energía además de
  Agotar, ampliar primero el modelo tipado y el adaptador.
- `life` debe ser un entero positivo (el deck lint lo valida), se paga atómicamente con el resto
  del coste y nunca puede reducir al player por debajo de 1. Cada pago pasa por la ruta genérica de
  pérdida, por lo que emite `LIFE_LOST` y `LIFE_PAID`: se acumula en
  `player.lifeLostThisTurn` y `player.lifePaidThisTurn`, respectivamente. Ambos contadores se
  reinician cada vez que comienza un turno, sea del player o de la Horda.
- Una habilidad que sólo tiene sentido cuando su criatura ya puede atacar puede declarar
  `requiresStabilized: true`. Engine y UI la bloquean mientras la fuente esté Estabilizándose,
  invocación, antes de cobrar cualquier coste.
- La Horda no tiene una política genérica que decida cuándo activar habilidades. Una habilidad
  puede normalizar correctamente y aun así no ser invocada durante una partida de Horda.
- Si una activación todavía no tiene flujo ejecutable, marcarla `engineSupport: "pending"` en vez
  de presentarla como terminada.

### Spell y targets

```json
{
  "id": "example_growth_spell",
  "kind": "SPELL",
  "zone": "HAND",
  "speed": "QUICK",
  "targets": [
    {
      "id": "targetCreature",
      "zone": "FIELD",
      "controller": "SELF",
      "filters": {
        "kinds": ["ECHO"]
      }
    }
  ],
  "conditions": [],
  "effects": [
    {
      "type": "MODIFY_STATS",
      "target": "targetCreature",
      "power": 2,
      "endurance": 2,
      "duration": "END_OF_TURN"
    }
  ]
}
```

El `id` de cada target es un contrato. Todo `target`, `targetRef`, `sourceRef`, `source` o `from`
usado por los efectos debe referirse a uno de esos ids, o a `SELF`. El lint comprueba estas
referencias.

Flujo del player:

1. `Hand.tsx` comprueba timing, coste y que exista una secuencia válida de targets.
2. Si hay targets, abre `SpellTargetingOverlay`.
3. `Targeting.ts` calcula candidatos desde controller y filtros.
4. Al confirmar, el store llama al mismo `castCard` del engine con los ids elegidos.
5. El engine paga, resuelve y mueve el spell al cementerio.

Limitaciones actuales:

- Usar una sola habilidad `SPELL` por carta. El normalizador toma los targets de la primera.
- El overlay normal recorre un target por requisito. Targets múltiples o distribución requieren
  soporte adicional antes de declararse listos.
- Los targets deben representar permanentes del battlefield. Targets a player, graveyard, stack u
  otras zonas todavía no forman parte del targeting genérico.

## 3. Usar o ampliar el vocabulario de efectos

`EFFECT_HANDLERS` en `EffectResolver.ts` es el registro autoritativo. Sus keys son el vocabulario
legal: `registeredEffectTypes()` alimenta directamente al deck lint.

Si el efecto ya existe, usar exactamente su estructura actual. Los JSONs y tests existentes son
mejor referencia que una lista copiada en documentación.

Si hace falta un efecto nuevo:

1. Elegir un nombre genérico basado en la regla, no en la carta.
2. Añadir su handler a `EFFECT_HANDLERS`.
3. Resolver únicamente estado de juego en el handler.
4. Si usa una cantidad estructurada nueva, implementar su cálculo y añadir el tipo a
   `AMOUNT_TYPES`.
5. Si introduce una condición nueva, implementar la función que la evalúa y actualizar el set
   correspondiente en `effectVocabulary.ts`.
6. Si introduce un evento, emitirlo mediante `enqueue`, enseñar al resolver a consumirlo y
   registrarlo en el vocabulario.
7. Añadir tests deterministas.

Los wrappers estáticos o de triggers también aparecen en `EFFECT_HANDLERS` aunque su resolución
viva en `StaticEffects`, `Keywords` o `resolveTriggeredEvent`. Su handler directo es un no-op
deliberado; esto permite que el lint reconozca el tipo sin duplicar reglas.

## 4. `customHandler` y `engineSupport`

Son conceptos distintos.

### `customHandler`

Se usa en authoring cuando una forma compacta necesita traducirse a efectos runtime genéricos. Debe:

1. estar permitido por `CUSTOM_HANDLERS`;
2. tener una rama en `normalizeCustomTriggeredEffect` o en la normalización equivalente;
3. producir efectos que el engine ya pueda resolver.

Preferir un efecto genérico directo cuando sea posible. Un `customHandler` desconocido falla el
lint.

### `engineSupport`

Marca habilidades que no deben llegar al resolver genérico:

- `"pending"`: falta implementación; el lint la muestra como WIP.
- `"ignored"`: se omite deliberadamente para este modo.
- `"custom"`: un flujo bespoke fuera del resolver genérico se hace cargo.

El normalizador filtra cualquier habilidad que tenga uno de estos marcadores. Sin marcador, la
habilidad promete estar soportada y debe pasar el lint completa.

Tributo de los Cuatro Pesares (`tribute_of_the_four_sorrows`) es el bridge bespoke vigente. No usar `"custom"` como atajo normal: requiere un camino
real que resuelva la carta y tests propios.

## 5. Presentación y animaciones

El engine decide reglas y targets. El store decide cuándo se ven y oyen.

Antes de añadir código de presentación, comprobar:

- `EFFECT_PRESENTATIONS` en `EffectResolver.ts`: clasifica fight, source damage y destroy para que
  el store elija una animación sin reaprender tipos.
- `EFFECT_ANNOUNCEMENTS`: permite generar mensajes de tokens, mill, discard o pérdida de vida.
- `hostBeats.ts`: handlers genéricos para Burn, auras estáticas, death reveal y pulse normal.
- `presentationEffects.ts`: helpers de buff, vida, descarte, mill y pago automático.
- `docs/animation_contracts.md`: orden y tiempos que no se deben romper.

Para un look nuevo de la Horda:

1. Definir una señal genérica en los datos o evento.
2. Añadir un `HostBeatHandler` que reclame esa señal.
3. No comprobar nombres ni `definitionId`.
4. Resolver el engine exactamente cuando el impacto visual aterriza.
5. Llamar `done()` sólo cuando el beat y cualquier reflow relevante hayan terminado.

`animation: "BURN"` ya usa la presentación reutilizable de proyectil e impacto. Las auras estáticas
y los triggers de muerte tampoco necesitan ramas por carta.

## 6. Target manual al entrar

Existe un camino genérico para triggers obligatorios de entrada que necesitan un target, usado por
Aelyra, Heredera de Elarion:

- `findManualEnterTargetTrigger` detecta el wrapper;
- el store bloquea nuevas invocaciones;
- `CounterTargetingOverlay` obliga a elegir y confirmar;
- el efecto se resuelve desde los datos de la carta.

Este flujo no debe detectarse por nombre. Si una carta nueva necesita una forma de target manual
distinta, ampliar el contrato genérico y sus tests antes de crear otro overlay bespoke.

## 7. Imagen y texto

Cada deck tiene un manifest junto a su JSON:

```text
<deck_id>_images.json
```

o el nombre equivalente ya registrado para ese deck.

Entrada típica:

```json
{
  "example_guardian": {
    "source": "local",
    "imageKind": "card",
    "imageUrl": "/cards/example_deck/example_guardian.png"
  }
}
```

El manifest solo acepta assets locales. El nombre, tipo y texto mostrado vienen del JSON del deck;
`gameText` debe describir exactamente el comportamiento de Hostfall. Cada definición, incluidas las
Fichas, debe declarar además `flavorText.en`, `flavorText.es` y el booleano `showFlavorText`. El
flavor siempre existe en datos; `showFlavorText: false` solo evita imprimirlo cuando las reglas no
dejan espacio suficiente en la carta.

Las cartas impresas se producen con los estudios de `dev/tools/Decks/`. Para un deck jugable, el
JSON runtime sigue siendo la única fuente de nombre, reglas, coste, estadísticas y cantidad;
también es la única fuente de flavor y de su visibilidad impresa. `studio.config.json` agrega
únicamente datos de presentación como `artCrop` y `typeLineEs`. No copiar `gameText`, `flavorText`
ni `showFlavorText` dentro de la configuración del estudio.

Cuando un Eco entra con contadores `+1/+1`, Card Studio suma esos contadores a sus estadísticas
base para imprimir las estadísticas con las que realmente entra al Campo.

Card Studio deriva del mismo `artCrop` la URL de arte que usan los Ecos recortados del campo. Los
ajustes opcionales de zoom y traslación para esa vista se guardan en
`dev/tools/Decks/<deck>/game-art.config.json` y se proyectan a
`src/data/cardStudioGameArt.generated.json`; ninguno de los dos se edita a mano. Este encuadre no
reemplaza `artFrame` ni invalida por sí solo el PNG imprimible.

Después de editar cualquiera de esas fuentes:

```powershell
node scripts/card-studio-data.mjs --write
node scripts/card-studio-data.mjs --check
```

`deck-data.generated.js` es un artefacto generado y no se edita a mano. Contiene las proyecciones
ES/EN autorizadas por el mismo JSON runtime; el Taller permite alternarlas sin cambiar el arte ni
la configuración visual. El exportador `dev/tools/Decks/export_cards.cjs <deck>` produce español
por defecto y actualiza `public/cards/` junto con `generation-manifest.json`. Para revisar otra
lengua se usa `--lang en`; esa salida vive en `exported-png/en/` y no reemplaza las cartas del
juego. `node scripts/check-card-assets.mjs` falla si cambió el deck, la presentación, el renderer,
las fuentes tipográficas o el arte después de exportar el lote español.

El arte fuente debe vivir separado del PNG final, normalmente en `public/cards/<deck>/art/`. El
exportador rechaza una carta que use como `artCrop` un PNG de su propia carpeta final para evitar
cartas anidadas y sobrescritura circular. El contrato completo está en
`dev/tools/Decks/README.md`.

Al añadir una carta a un deck existente, añadir también su entrada al manifest. Al crear un deck
nuevo, importarlo y registrarlo una sola vez en `DECK_REGISTRY`; de allí derivan engine, inspector,
catálogo e imágenes.

La llamada de registro de un deck nuevo también debe declarar `presentation` con `keyCardId`,
`theme`, `descriptionKey` y, para una Horda, `encounterTone`. El deck lint comprueba que
`keyCardId` exista y que toda Horda tenga tono de encuentro; los componentes no deben resolver
estos valores mediante ramas por id de deck.

## 8. Tests y verificación

Para reglas de cartas, usar los helpers de `tests/engineTestUtils.js`:

- `createTestGame`
- `cardFromDeck`
- `customCard`
- `addCard`
- `addForests`

Un test debe comprobar el resultado observable: zonas, stats, counters, daño, targets válidos,
eventos pendientes, orden de resolución o reglas del deck.

Si se crea un archivo de test nuevo, registrarlo en `scripts/run-engine-tests.mjs`; de lo contrario
no se ejecutará.

Comandos:

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe scripts\lint-decks.mjs
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe node_modules\typescript\lib\tsc.js -b
```

```powershell
C:\Users\Arky\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe --test scripts\run-engine-tests.mjs
```

No levantar el dev server para verificar. El usuario prueba el juego; el agente verifica tipos,
lint y tests.

## 9. Probar en el Playground

El Playground usa el `Board`, store y engine reales:

- **Play** mete la carta por cast o revelado, con targets, triggers, beats y animaciones.
- **Ponlo directo en** sólo arma un estado y no dispara efectos.
- **Kill it** produce una muerte real.
- **Remove it** mueve de zona sin muerte.

Para comprobar una implementación, usar **Play**. “Ponlo directo en” sirve únicamente para preparar
el tablero alrededor de la prueba.

## Checklist de terminado

- [ ] La carta está en el JSON correcto, su id coincide con `cardIdFromName(name)` y la cantidad es correcta.
- [ ] `deckSize` sigue coincidiendo con la suma de cartas del deck.
- [ ] Tiene entrada en el manifest de imágenes.
- [ ] Tiene presentación y arte fuente separados en el estudio correspondiente.
- [ ] `card-studio-data.mjs --check` y `check-card-assets.mjs` pasan después de exportar.
- [ ] Cada habilidad está soportada o marcada explícitamente con `engineSupport`.
- [ ] No hay lógica por nombre de carta.
- [ ] Los target ids declarados coinciden con los usados por los efectos.
- [ ] El engine decide reglas, cantidades y targets automáticos.
- [ ] El store sólo coordina presentación e input.
- [ ] Los efectos visuales respetan `docs/animation_contracts.md`.
- [ ] Hay un test determinista para cada regla nueva.
- [ ] `lint-decks.mjs` pasa.
- [ ] `tsc -b` pasa.
- [ ] La suite completa pasa.

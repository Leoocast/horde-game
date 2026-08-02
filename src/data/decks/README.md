# Deck Data Format

Este archivo resume el formato. La guía operativa completa para implementar una carta está en
[`docs/adding_cards.md`](../../../docs/adding_cards.md).

Deck folders under `src/data/decks/` are the current gameplay card data format.

Each deck should live under its side (`player` or `host`) and in its own folder:

```text
src/data/decks/
  player/
    deck_id/
      deck_id.json
      deck_id_images.json
  host/
    deck_id/
      deck_id.json
      deck_id_images.json
```

## Deck JSON

The deck file describes gameplay data. Every active deck uses Hostfall schema `1.0.0`.

Required top-level fields:

- `schemaVersion`: `"1.0.0"` for Hostfall-authored decks.
- `id`: stable deck id.
- `name`: display name.
- `side`: `"CHRONICLER"` or `"HOST"`.
- `deckSize`: total card count.
- `gameplayLandCount`: optional player-deck override for the number of authored Source copies kept
  when a game is created; decks without it keep the default of nine.
- `cards`: card definitions.
- `tokens`: token definitions, if any.

Card definitions should use stable ids and explicit structured data:

- `id`
- `collectorId`: identificador impreso global; el Acto I usa la secuencia `HFA1xxx`.
- `name`
- `flavorText.en` y `flavorText.es`: texto narrativo obligatorio y no vacío.
- `showFlavorText`: booleano obligatorio; controla su impresión sin eliminarlo de los datos.
- `quantity`
- `energyCost.amount`
- `kinds`
- `modifiers`, such as `QUICK`
- `subtypes`
- `power`
- `endurance`
- `traits`
- `abilities`

## Abilities

New cards should prefer `abilities[]` over the old flat `effects[]` model.

Ability kinds:

- `ACTIVATED`
- `TRIGGERED`
- `STATIC`
- `SPELL`

Common ability fields:

- `id`: stable ability id.
- `kind`: ability kind.
- `zone`: where it works, usually `"FIELD"` or `"HAND"`.
- `cost`: structured cost data.
- `trigger`: event data for triggered abilities.
- `targets`: target requirements.
- `conditions`: extra requirements.
- `effects`: ordered effect list.

Effects must be structured. Do not parse rules text.

Example:

```json
{
  "id": "first_dew_gatherers_gain_energy",
  "kind": "ACTIVATED",
  "zone": "FIELD",
  "cost": { "exhaust": true },
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

## Image Manifest

The image file maps every card id to a checked-in local asset.

Required top-level fields:

- `schemaVersion`
- `provider`
- `defaults`
- `cards`

Each card entry should be keyed by card id:

```json
{
  "first_dew_gatherers": {
    "source": "local",
    "imageKind": "card",
    "imageUrl": "/cards/last_rain/first_dew_gatherers.png"
  }
}
```

The game and deck inspector use this manifest directly. Remote lookups and fallbacks are not
supported; the referenced file must exist under `public/cards`.

## Printed card generation

Gameplay rules remain authoritative in this deck JSON. The matching
`dev/tools/Decks/<deck>/studio.config.json` contains presentation-only data, and
`scripts/card-studio-data.mjs` generates the data consumed by the HTML studio. Names, rules, costs,
stats, quantities, bilingual flavor and the flavor visibility flag come from this JSON. Do not
duplicate any of them in the studio config.

The final PNG batch is tracked by `dev/tools/Decks/generation-manifest.json`, which hashes the runtime
deck, presentation config, renderer, fonts, source art and every exported PNG. See
`dev/tools/Decks/README.md` for the complete workflow.

## Runtime actual

Los cuatro decks registrados pasan por este mismo pipeline en partida, no sólo en el inspector:

- `last_rain`
- `crimson_court`
- `hollow_bell_procession`
- `broken_forge_mutiny`

La Última Lluvia, Vampiros, Zombies y Trasgos están authored en `1.0.0`.

`authoredDeckNormalizer` convierte el casing de las zonas authored a su representación runtime;
`kinds`, `traits`, `endurance`, eventos, Acciones y reglas pasan sin degradación. `normalizeDeck`
convierte después `abilities[]` al modelo runtime. `EffectResolver` contiene el
registro real de handlers y `deckLint` valida cada habilidad contra ese vocabulario. Una habilidad
sin `engineSupport` debe sobrevivir completa a la normalización o el lint falla. El lint también
rechaza cualquier campo authored legacy que reaparezca dentro de un deck `1.0.0`.

Marcadores admitidos:

- `pending`: todavía no implementada; se omite del runtime y aparece como WIP.
- `ignored`: omitida deliberadamente en este modo.
- `custom`: resuelta por un flujo bespoke existente fuera del resolver genérico.

Las limitaciones concretas y el proceso para ampliar efectos, triggers, targets, activaciones y
presentación están documentados en `docs/adding_cards.md`. El comando
`node scripts/lint-decks.mjs` es la fuente actual para saber qué cartas siguen WIP.

Los antiguos `player_deck.json` y `horde_deck.json` de la raíz fueron eliminados. No recrearlos:
este directorio es la única ubicación de los decks vigentes.

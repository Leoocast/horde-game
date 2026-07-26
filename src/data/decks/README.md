# Deck Data Format

Este archivo resume el formato. La guía operativa completa para implementar una carta está en
[`docs/adding_cards.md`](../../../docs/adding_cards.md).

Deck folders under `src/data/decks/` are the current gameplay card data format.

Each deck should live under its side (`player` or `horde`) and in its own folder:

```text
src/data/decks/
  player/
    deck_id/
      deck_id.json
      deck_id_images.json
  horde/
    deck_id/
      deck_id.json
      deck_id_images.json
```

## Deck JSON

The deck file describes gameplay data. The current schema is `0.2.0`.

Required top-level fields:

- `schemaVersion`: format version, currently `"0.2.0"`.
- `id`: stable deck id.
- `name`: display name.
- `side`: `"PLAYER"` or `"HORDE"`.
- `deckSize`: total card count.
- `cards`: card definitions.
- `tokens`: token definitions, if any.

Card definitions should use stable ids and explicit structured data:

- `id`
- `name`
- `quantity`
- `manaCost`
- `manaValue`
- `colors`
- `cardTypes`
- `subtypes`
- `power`
- `toughness`
- `keywords`
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
- `zone`: where it works, usually `"BATTLEFIELD"` or `"HAND"`.
- `cost`: structured cost data.
- `trigger`: event data for triggered abilities.
- `targets`: target requirements.
- `conditions`: extra requirements.
- `effects`: ordered effect list.

Effects must be structured. Do not parse rules text.

Example:

```json
{
  "id": "llanowar_elves_add_green",
  "kind": "ACTIVATED",
  "zone": "BATTLEFIELD",
  "cost": { "tap": true },
  "targets": [],
  "conditions": [],
  "effects": [
    {
      "type": "ADD_MANA",
      "player": "SELF",
      "mana": { "G": 1 }
    }
  ]
}
```

## Image Manifest

The image file keeps remote lookup data separate from gameplay data.

Required top-level fields:

- `schemaVersion`
- `provider`
- `defaults`
- `cards`

Each card entry should be keyed by card id:

```json
{
  "llanowar_elves": {
    "source": "scryfallNamed",
    "exact": "Llanowar Elves",
    "set": "fdn"
  }
}
```

The deck inspector uses this manifest to verify card art. Prefer this file over legacy root-level image lookup files.

## Runtime actual

Los tres decks registrados usan este esquema en partida, no sólo en el inspector:

- `mono_green_ramp`
- `horde_zombies`
- `goblin_assault_horde`

`normalizeDeck` convierte `abilities[]` al modelo runtime. `EffectResolver` contiene el registro
real de handlers y `deckLint` valida cada habilidad contra ese vocabulario. Una habilidad sin
`engineSupport` debe sobrevivir completa a la normalización o el lint falla.

Marcadores admitidos:

- `pending`: todavía no implementada; se omite del runtime y aparece como WIP.
- `ignored`: omitida deliberadamente en este modo.
- `custom`: resuelta por un flujo bespoke existente fuera del resolver genérico.

Las limitaciones concretas y el proceso para ampliar efectos, triggers, targets, activaciones y
presentación están documentados en `docs/adding_cards.md`. El comando
`node scripts/lint-decks.mjs` es la fuente actual para saber qué cartas siguen WIP.

Los antiguos `player_deck.json` y `horde_deck.json` de la raíz fueron eliminados. No recrearlos:
este directorio es la única ubicación de los decks vigentes.

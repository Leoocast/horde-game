# Deck Data Format

Deck folders under `src/data/decks/` are the forward-looking card data format.

Each deck should live in its own folder:

```text
src/data/decks/
  deck_id/
    deck_id.json
    deck_id_images.json
```

## Deck JSON

The deck file describes gameplay data. The current target schema is `0.2.0`.

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

## Current Engine Support

The game currently uses the old MVP runtime while the new effect engine is being redesigned.

Temporarily disabled or deprecated in runtime:

- Manual tap-for-mana buttons on permanents.
- Player counter effects.
- Player static buffs.
- Player static keyword grants.
- Special-case card UI such as New Horizons targeting.
- Generic activated ability buttons.

Still supported:

- Loading and inspecting new deck folders.
- Scryfall image lookup through `deck_id_images.json`.
- Basic land auto-payment for casting.
- Creature combat.
- Horde turn flow.

When the new engine is implemented, new deck JSON should be normalized before entering game state instead of being interpreted directly by React components.

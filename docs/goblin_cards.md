# Goblin Horde card rules

This document records the PvE behavior used by the game. Card JSON is the rules source of truth; this file explains intentional deviations from tabletop Magic and the expected presentation.

`engineSupport: "pending"` and “not active in matches” are not identical. A Horde activated
ability may normalize to a valid engine effect but still have no automated policy that decides
when to use it. `scripts/lint-decks.mjs` is the source of truth for explicit WIP markers; the notes
below also call out valid-but-uninvoked Horde activations.

## Goblin Token

- Copies remain visually stacked by definition and arrival grouping.
- Horde creatures never show the `Tapped` badge or the grey "spent" filter: tapping is a rule of the mode, not a choice the player made.
- They lean, with their attack chevron, from the frame they land during the Horde's turn — not when attackers are formally declared several effects later.

## Hobgoblin Bandit Lord

- Other Goblins receive the static +1/+1 bonus.
- PvE adaptation: on entry, it Burns the best opposing creature for the number of Goblins that
  entered under Horde control during the current turn, including itself.
- Its static aura resolves first. If that aura already supplied the activation pulse, the entry
  damage remains a separate queued beat but does not make the card glow or play the activation
  sound a second time.

## Rundvelt Hordemaster

- Other Goblins receive the static +1/+1 bonus, announced through the Static activation beat when it starts covering new Goblins.
- A Goblin death exiles the top Horde card; an exiled Goblin creature currently enters immediately.
- Any Goblin death gives Rundvelt an activation pulse. When Rundvelt itself is the Goblin that died, it uses the Death reveal beat beside the Horde graveyard before the exile resolves.

## Battle Cry Goblin

- PvE adaptation: when it enters, Horde Goblins get +1/+0 until end of turn.
- Haste and Pack tactics are deliberately omitted.
- The entry trigger supplies one activation pulse; the queued group-buff beat only plays the blue
  buff lines and does not make the source glow again.

## Goblin War Drums

- Horde creatures have Menace while this enchantment remains on the battlefield.

## Raid Bombardment

- Each declared attacker with power 2 or less deals 1 damage to the player.

## Beetleback Chief

- Its entry effect creates two Goblin tokens.

## Siege-Gang Commander

- Its entry effect creates three Goblin tokens.
- Its activated sacrifice damage is modeled but is not invoked in matches because the Horde has
  no generic activation policy.

## Goblin Rabblemaster

- Creates one Goblin token before attackers are declared.
- The Horde's global attack rule already makes every able Goblin attack.
- Its attack bonus counts other Goblins that are attacking when the trigger resolves.

## Goblin Surprise

- If the Horde controls at least one creature, all of its creatures get +2/+0 until end of turn.
  The spell is presented beside the Horde deck and the bonus lands with the shared blue buff animation.
- If the Horde controls no creatures, it immediately performs another normal reveal round. This is
  part of the same Horde turn and does not add another Mini Surge or Surge reveal.

## Mogg Mob

- Divided activated burn is explicitly WIP and also needs a Horde activation policy.

## Volley Veteran

- Its entry effect uses the reusable Burn animation.
- Horde targeting is selected by the JSON policy, not by component code.

## Goblin Chainwhirler

- Its entry effect damages the player and each opposing creature.

## Goblin Trashmaster

- Other Goblins receive the static +1/+1 bonus.
- Activated artifact destruction is modeled but is not invoked in matches because the Horde has
  no generic activation policy.

## General Kreat, the Boltbringer

- A Goblin attack creates one tapped and attacking Goblin token.
- Each other Horde creature entering deals 1 damage to the player.

## Krenko, Tin Street Kingpin

- When Krenko attacks, add a +1/+1 counter first, then create tapped and attacking Goblin tokens equal to its new power.

## Pashalik Mons

- Intentional PvE rule: whenever a Horde Goblin dies, Pashalik deals 1 damage to a random opposing battlefield creature instead of choosing any Magic target.
- Selection is deterministic from the seeded engine RNG and is declared in JSON as `selection: "RANDOM"`.
- Each Goblin death resolves separately at the moment it occurs. Combat does not batch Pashalik triggers until the end.
- Damage uses the reusable `BURN` animation: source activation pulse, layered fireball travel, burn shader and spark burst on impact, floating damage number, and scorch plus smoke on a surviving target until end-step cleanup.
- When Pashalik and another card react to the same Goblin death, each gets its own beat; they never resolve simultaneously.
- Activated token creation is modeled but is not invoked in matches because the Horde has no
  generic activation policy.

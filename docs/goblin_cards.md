# Goblin Horde card rules

This document records the PvE behavior used by the game. Card JSON is the rules source of truth; this file explains intentional deviations from tabletop Magic and the expected presentation.

## Goblin Token

- Copies remain visually stacked by definition and arrival grouping.
- Horde creatures never show the `Tapped` badge or the grey "spent" filter: tapping is a rule of the mode, not a choice the player made.
- They lean, with their attack chevron, from the frame they land during the Horde's turn — not when attackers are formally declared several effects later.

## Hobgoblin Bandit Lord

- Other Goblins receive the static +1/+1 bonus.
- Activated burn behavior remains pending a Horde activation policy.

## Rundvelt Hordemaster

- Other Goblins receive the static +1/+1 bonus, announced through the Static activation beat when it starts covering new Goblins.
- A Goblin death exiles the top Horde card; an exiled Goblin creature currently enters immediately.
- Any Goblin death gives Rundvelt an activation pulse. When Rundvelt itself is the Goblin that died, it uses the Death reveal beat beside the Horde graveyard before the exile resolves.

## Battle Cry Goblin

- Pack tactics uses the declared attack group's power.
- At six or more power it creates one tapped and attacking Goblin token.

## Goblin War Drums

- Horde creatures have Menace while this enchantment remains on the battlefield.

## Raid Bombardment

- Each declared attacker with power 2 or less deals 1 damage to the player.

## Beetleback Chief

- Its entry effect creates two Goblin tokens.

## Siege-Gang Commander

- Its entry effect creates three Goblin tokens.
- Activated sacrifice damage remains pending a Horde activation policy.

## Goblin Rabblemaster

- Creates one Goblin token before attackers are declared.
- The Horde's global attack rule already makes every able Goblin attack.
- Its attack bonus counts other Goblins that are attacking when the trigger resolves.

## Goblin Surprise

- The Horde chooses deterministically between the pump and token modes by immediate attack power.

## Mogg Mob

- Divided activated burn remains pending a Horde activation policy.

## Volley Veteran

- Its entry effect uses the reusable Burn animation.
- Horde targeting is selected by the JSON policy, not by component code.

## Goblin Chainwhirler

- Its entry effect damages the player and each opposing creature.

## Goblin Trashmaster

- Other Goblins receive the static +1/+1 bonus.
- Activated artifact destruction remains pending a Horde activation policy.

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
- Activated token creation remains pending a Horde activation policy.

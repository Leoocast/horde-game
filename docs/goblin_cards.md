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
- A Goblin death inspects the top card of the Host Archive. A Goblin Echo is Invoked immediately;
  any other card moves to the bottom of the Archive.
- The effect never uses Oblivion. Any Goblin death gives Rundvelt an activation pulse. When
  Rundvelt itself is the Goblin that died, it uses the Death reveal beat beside the Host Memory
  before the inspection resolves.

## Battle Cry Goblin

- PvE adaptation: when it enters, Horde Goblins get +1/+0 until end of turn.
- Haste and Pack tactics are deliberately omitted.
- The entry trigger supplies one activation pulse; the queued group-buff beat only plays the blue
  buff lines and does not make the source glow again.

## Goblin War Drums

- Horde creatures have Menace while this enchantment remains on the battlefield.

## Raid Bombardment

- PvE adaptation: each attacking Goblin with power 2 or less contributes 1 damage.
- Eligible attackers are captured once at declaration, so a Goblin with multiple blockers never
  contributes more than once and still contributes if it dies during its attack.
- The damage waits until every Horde attack animation has finished. Raid Bombardment then pulses
  once and launches one compact Burn volley toward the player's life; the impact applies and shows
  the combined damage rather than playing a full Burn sequence for every Goblin.
- At most six projectiles are drawn for readability, but the damage number always shows the real total.

## Beetleback Chief

- Its entry effect creates two Goblin tokens.

## Siege-Gang Commander

- Its entry effect creates three Goblin tokens.
- Its activated sacrifice damage is modeled but is not invoked in matches because the Horde has
  no generic activation policy.

## Goblin Rabblemaster

- Creates one Goblin token before attackers are declared.
- Its printed "other Goblins attack if able" clause is marked `engineSupport: "ignored"` because
  the Horde's global attack rule already makes every able creature attack.
- Its attack bonus counts other Goblins that are attacking when the trigger resolves.

## Goblin Surprise

- If the Horde controls at least one creature, all of its creatures get +2/+0 until end of turn.
  The spell is presented beside the Horde deck and the bonus lands with the shared blue buff animation.
- If the Horde controls no creatures, it immediately performs another normal reveal round. This is
  part of the same Horde turn and does not add another Mini Surge or Surge reveal.

## Mogg Mob

- PvE adaptation: it is only a vanilla 3/3 Goblin — a sack of meat with no abilities.

## Volley Veteran

- Its entry effect uses the reusable Burn animation.
- Horde targeting is selected by the JSON policy, not by component code.

## Goblin Chainwhirler

- First strike is resolved as a separate combat-damage step. A 3/3 Chainwhirler kills a normal
  4/3 blocker before it can answer and survives; against a 4/4, that blocker survives the
  first-strike step and kills Chainwhirler in the normal step.
- Its entry effect queues one simultaneous damage event for the player and every opposing
  creature. The ETB supplies the card's only activation pulse, then a compact Burn volley sends
  one fireball along a distinct route to each target.
- Every visible fireball has its own launch and impact sound. Visual impacts are staggered by
  90ms, but the rules damage is committed to every target together on the final impact.

## Goblin Trashmaster

- Other Goblins receive the static +1/+1 bonus.
- Activated artifact destruction is modeled but is not invoked in matches because the Horde has
  no generic activation policy.

## General Kreat, the Boltbringer

- When one or more Goblins attack, General Kreat creates exactly one tapped and attacking Goblin
  token. The trigger is once per attack declaration, not once per attacker.
- Each other Horde creature entering queues its own 1-damage Burn toward the player's life.
  Damage triggers are never grouped: two creatures entering produce two complete Burns in order.
- The token created by General Kreat naturally triggers that second ability. Because the first
  attack beat already illuminated General Kreat, this self-caused follow-up does not pulse the
  same card a second time.

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

# Animation contracts

## Horde presentation beats

Every Horde reaction plays as one **beat**: one card acting at a time, board locked, engine state committed at the moment the animation says it lands.

`scheduleQueuedHordeTriggers` (`src/store/hordeBeats.ts`) walks `game.eventQueue` and hands the first *claimed* event to the handler that owns its presentation. A handler calls `resolve()` when its animation lands and `done()` when it is over; only then does the queue move on.

Three rules make the sequence readable:

- A claimed event resolves **one source per beat**. Two cards reacting to the same death (Rundvelt and Pashalik on one Goblin dying) get one beat each instead of firing on top of each other. `resolveTriggeredEvent(game, event, undefined, sourceId)` records the source on the event, so a later bulk `drainEventQueue` never re-resolves it.
- Because reactors are re-derived after every beat, `enqueue` stamps each event with `witnessIds`: the permanents in play when it happened. A creature that reaches the battlefield **because** of an event is not a witness to it, so it cannot react to it. Without this, Rundvelt exiling Pashalik onto the battlefield made Pashalik burn for the death that summoned it. The event's own source is always a witness, since a dying card has already left the battlefield when its death event is queued.
- A beat finishes what it started. Anything a beat's resolution queued jumps ahead of the reactors still waiting on the parent event. Pashalik's trigger does not damage directly, it queues a `BURN_DAMAGE`; appended at the tail, that fireball landed *after* Rundvelt's reveal had already resolved, splitting one card's effect in half around another card's.
- Nothing in the runner knows a card name. Adding a new Horde effect means pushing a handler onto `HORDE_BEAT_HANDLERS`; order matters, because the first handler that claims an event owns its look.
- A source with multiple effects still resolves one effect per beat, but only its first effect in
  that arrival chain supplies the activation pulse. For a permanent with both a newly-online
  static aura and an entry trigger, the aura goes first; the entry trigger keeps its own toast and
  resolution timing without a second gold pulse or activation sound.

### The board must be still between beats

A creature killed in combat leaves game state the instant its impact lands, so its triggers can resolve in sequence. `holdCombatCasualties` (`src/components/battlefieldLayout.ts`) keeps its layout slot as an invisible ghost while `resolvingHordeCombat` is true, so survivors never re-center mid-sequence; every casualty leaves together when the combat ends. The held slot must keep its **position**, not just exist: copies in a stack lay out by DOM order (each slot after the first carries a negative margin) and overlap by `--copy-stack-index`, so a ghost appended to the end sent a casualty from the middle of the stack to its back and shifted every copy behind it. The row is re-sorted by entry order for that reason. Grouping also ignores stats during that window, so a dying lord dropping its buff off every creature it covered cannot re-key and remount whole stacks.

**Only the creature row is held, and only creatures may inherit a held slot.** `battlefieldCardOrder` is the creature row's registry: `renderCardStacks` is called with the creature row alone and prunes every card outside it on each render, so lands and other permanents (Graf Harvest, the player's Forests) look like brand-new arrivals on *every* render. The slot-recycling pass — which lets a creature summoned mid-combat take over a casualty's slot instead of landing past a hole — used to accept any card, so the first land or enchantment it walked over consumed the ghost the instant something died. The held slot disappeared mid-sequence and the whole row re-centered. That was the "everything regroups when a card dies" bug: it needed a non-creature permanent on the board to show up, which is why the Zombie deck (Graf Harvest) and the player's side (Forests) both hit it while a bare Goblin board did not. Both ends of the swap are now creature-gated; `tests/battlefieldLayout.test.js` covers it.

A beat that *adds or removes* a permanent reflows the row, and that reflow is worth watching. `resolve()` reports whether the battlefield changed and the runner stamps the time; `done()` then waits only for whatever is **left** of `BOARD_SETTLE_MS` since that moment. Measuring from the end of the beat instead was a real source of dead air: the burn resolves at 500ms and runs to 1180ms, so its reflow was long finished, yet it sat through a second full settle before the next card could act. A creature arriving while casualties are held takes over the rightmost held slot instead of landing past the gap one left behind.

### Horde attackers commit on arrival

The Horde attacks with everything able, every turn, but declaring is a rules step that only runs after summons and enter triggers. A Zombie deck hides this — with no enter trigger, declaration commits in the same React batch as the summon, so Zombies render leaning with their attack chevron on their first frame. Goblins have enter triggers, so they used to sit upright through 700ms+ of effects and then turn.

`hordeAttackPending` in `Battlefield.tsx` closes the gap: while the Horde's turn is running and no attackers are declared yet, a Horde creature that `canAttack` is drawn as attacking. Visual only — it declares nothing, and the real declaration changes nothing on screen because the card already looks the part.

Attack resolution order is a rules concern and follows `game.horde.battlefield` insertion order,
which is summon chronology. It must never be rebuilt from visual families or stack keys. For
example, four Goblin tokens, then Hobgoblin Bandit Lord, then two later tokens resolve in exactly
that order. The layout may stack the two token waves, but grouping never moves the second wave in
front of the lord.

Current handlers:

| Handler | Claims | Presentation |
| --- | --- | --- |
| `burn` | `BURN_DAMAGE` | Fireball, see below |
| `static-aura` | `STATIC_AURA_ONLINE` | Source activation, see below |
| `horde-group-buff` | `HORDE_GROUP_BUFF` | Shared buff lines; spells also reveal beside the Horde deck |
| `death-reveal` | first pending source already left the battlefield | Card presented beside its graveyard, see below |
| `deferred-combat-volley` | an attack trigger whose damage waits for the Horde sequence end | Silent rules capture; its single visible activation happens after the last attack |
| `trigger-pulse` | any pending Horde source | Activation pulse on the source, toast, resolve |

Group buffs are committed on their beat rather than during synchronous effect resolution. The
event snapshots the creatures covered when the effect resolved and applies the stat change in the
same frame as the blue buff lines. A permanent source already received its activation pulse from
the ETB beat, so this beat does not pulse it again. An instant has no battlefield slot and instead
uses the spell reveal on the right side of the Horde panel. Creatures revealed later in the turn
are not retroactively included.

## Burn

`Burn` is the reusable presentation for targeted non-combat damage.

Data contract:

- The card JSON declares `animation: "BURN"`.
- The effect declares its amount, target zone, controller, filters, and selection policy.
- The engine chooses the target and emits a `BURN_DAMAGE` event. UI code never chooses rules targets.

Resolution order:

The visual is a faithful port of the reference in `assets/examples/Fireball/fireball.html`, adapted from that scene's fixed horizontal shot to arbitrary source→target geometry. One CSS master clock drives it: `--burn-duration` (1100ms), with the projectile launching at 20% and impact at 58%. The store's `BURN_IMPACT_MS` (638) and `BURN_ANIMATION_MS` (1220) track that clock.

1. The source card plays its standard effect-activation pulse **on the beat that queues the burn**. The burn beat itself does not repeat it — one effect must not look like the card triggering twice. The source lunges instead (`.burn-source-casting`): movement, no gold, no brightness. A charge build-up (`.burn-charge`: swelling glow, distorting ring, spinning arc, inrushing sparks) plays at the source, and a random cast whoosh (`fireballCastSfx`) fires as the projectile ignites.
2. A multi-layer morphing fireball (`.burn-fireball-body`) with an attached comet trail (ribbons + streaks) travels from the source card to the target card. The ball squash and trail ride the travel heading (`--burn-angle`), and JS-spawned trace sparks bleed off its real path.
3. On impact (`BURN_IMPACT_MS`, 638ms), damage is committed in the engine and the canonical hit sound (`fireballHitSfx`) plays.
4. A layered impact anchored on the target fires: a void implosion, a morphing molten core, two shock rings, a ring of JS-spawned embers, lingering smoke puffs, and a radial screen flash. The effects (inside `.burn-world`) get a short impact shake; the board behind is deliberately **not** shaken. The target flashes with the burn shader (`.burn-card-scorch-flash`) and a heavy condensed damage number rises.

The reference's `blast-petal` / `blast-cone` / `backblast` / `pool` / `jet` / `debris` classes are **not** ported — they exist in its CSS but never appear in its DOM, so they never render.
5. A surviving target keeps a scorch tint (`.burn-card-scorch`) and light smoke until end-step cleanup clears `card.flags.burnSmoke`.
6. Buttons and battlefield interactions remain blocked until the animation and resulting triggers finish.

Use this contract for Pashalik Mons, Volley Veteran, and future Goblin burn effects.

### Burn volley to player life

Raid Bombardment reuses Burn with a different target and timing:

- Its `ATTACK_DECLARED` trigger silently snapshots the eligible Goblin ids and printed attack
  powers in `combat.pendingDamageVolleys`; it does not pulse or damage the player at declaration.
- After the final Horde attack event and its queued reactions finish, the enchantment supplies its
  one activation pulse. The store aims Burn at `[data-player-life-panel]` instead of a card slot.
- One projectile is rendered per contributing attacker up to a visual cap of six, staggered by
  90ms. Each visible projectile plays one cast sound when it launches and one hit sound when it
  arrives; sounds are not layered into a single oversized cue. This remains one compact cast:
  one source charge, one final visual impact, and one damage number for the complete amount.
- The engine commits all pending volley damage at that final impact frame. Non-animated callers
  resolve the same pending damage from `finishHordeCombat`, so presentation cannot change rules.
- The player life panel runs its normal damage reaction at impact. Buttons stay blocked until the
  extended final projectile clock has completed.

### Burn volley to multiple targets

Goblin Chainwhirler uses the same compact volley clock with distinct routes:

- Its ETB activation beat pulses the source once and queues `BURN_VOLLEY_DAMAGE`. The volley beat
  never pulses it again.
- The engine snapshots the player and every opposing creature as rules targets. `BurnAnimator`
  receives that target list and calculates one source-to-target geometry for each projectile.
- Projectiles launch 90ms apart. Each one plays a singular cast sound at launch and the canonical
  singular hit sound at its own impact; every target gets its own impact effect and `-1` number.
- The stagger is presentation only. Player life and all still-present creatures take damage
  simultaneously when the final projectile lands, followed by one marked-damage cleanup.
- All hit creature ids are flashed together at resolution, and surviving creatures keep the
  normal scorch/smoke state until end-step cleanup.

### Repeated single Burns to player life

General Kreat does not aggregate its creature-entry triggers. Every other creature entering queues
one independent Burn toward `[data-player-life-panel]`; each has its own projectile, cast sound,
hit sound, impact, life reaction, and 1-damage engine resolution before the next trigger begins.
When General Kreat itself created the entering token, `causeSourceId` marks that causal chain so
the damage follow-up does not repeat the activation pulse already shown for token creation.

## Static activation

Static abilities apply continuously, so without a beat the player only ever sees numbers that already changed and has to hunt for the card responsible.

Data contract:

- Nothing is declared per card. `collectStaticAuras` (`src/engine/StaticAuras.ts`) reads every `STATIC_BUFF` / `STATIC_GRANT_KEYWORD` already on the battlefield and reports who each one currently covers.
- The store keeps a snapshot of that coverage and announces only auras whose covered set **grew**. An aura that only lost a creature is not re-announced.
- Everything here is presentation-only. Rules are untouched: `getPowerToughness` and `getKeywords` never read any of it.

The announcement is **two-phase**, and the split is the whole point:

- **Capture** (`captureStaticAuraBeats`) runs the instant the Horde's summons are committed to the store, before any frame renders them. It diffs coverage and records the withheld stat bonus in `heldStaticAuraBonuses`, which `cardStatState` subtracts. The new creatures are therefore drawn *unbuffed* from the very first frame.
- **Flush** (`flushStaticAuraBeats`) queues the `STATIC_AURA_ONLINE` beats once the summon sequence is over.
- **Release** happens in the same frame the beat plays its buff lines, so the numbers rise with the animation.

Capture runs when summons land and again after attack triggers, so tokens created attacking (Krenko, General Kreat) are covered too. Keyword grants are announced but never withheld: a keyword reads as an ability, not as a number that silently changed.

Resolution order:

1. Lead-in, so a card that just landed finishes its summon pop before the same slot animates again.
2. The granting card plays its effect-activation pulse, with a toast naming the bonus and how many creatures it covers.
3. The withheld stats land as the newly covered creatures show the same blue rising buff lines a player buff uses (`buff-rise-lines-blue`). A warm tone was tried and rejected: `.buff-rise-lines` blends with `mix-blend-mode: screen`, so ember colours wash out completely against Goblin artwork.

The rising lines may finish while the next beat begins. If the same permanent also has an ETB
effect, the aura has already supplied its activation pulse: the ETB uses a short 160ms handoff
instead of another summon-length pause, then immediately presents any follow-up event such as
Hobgoblin Bandit Lord's Burn.

## Death reveal

A card that triggers on its own death has no battlefield slot left to pulse.

- Claimed generically: any dies-trigger whose first pending source is no longer on the battlefield.
- Side matters. The **left** of the Horde panel is the graveyard side — that is where the deck's graveyard button lives — so a dying card is presented there (`horde-death-reveal-host`) and exits into it. The **right** (`horde-special-card-host`) stays reserved for spells and reveals still resolving, such as Smallpox.
- The card is shown at full colour with an ember glow from below (`horde-special-card-dying`). Its position beside the graveyard and its exit into it already say it is dying; a desaturating filter was tried and removed.
- Strict order: reveal in, activation pulse, card leaves for the graveyard, **then** the effect resolves. Resolving while the reveal is still on screen made whatever the effect puts onto the battlefield land mid-animation and stutter it.
- The entrance is a **CSS keyframe**, not framer-motion. This card mounts on the same frame the store commits a combat impact and the whole battlefield re-renders, so a main-thread JS animation loses that race every time. Framer-motion keeps only the exit, because `AnimatePresence` has to own unmount. Smallpox dodged the whole problem by mounting with `initial={false}`.
- The dying card carries **no `filter` at all** — `filter: none` has to be set explicitly, because `.horde-special-card` supplies its own `drop-shadow`. Any filter forces this subtree, a 13rem card plus its image, to be rasterised on its own, and that cost lands on the first frame of the entrance. `box-shadow` gives the same depth against the card's rounded rect for a fraction of the work.

Beat timings live as constants at the top of `src/store/hordeBeats.ts` (`DEATH_REVEAL_*`), tuned so the activation reads as a reaction to the death rather than a pause before one.

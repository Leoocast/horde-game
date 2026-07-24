# Animation contracts

## Horde presentation beats

Every Horde reaction plays as one **beat**: one card acting at a time, board locked, engine state committed at the moment the animation says it lands.

`scheduleQueuedHordeTriggers` (`src/store/useGameStore.ts`) walks `game.eventQueue` and hands the first *claimed* event to the handler that owns its presentation. A handler calls `resolve()` when its animation lands and `done()` when it is over; only then does the queue move on.

Three rules make the sequence readable:

- A claimed event resolves **one source per beat**. Two cards reacting to the same death (Rundvelt and Pashalik on one Goblin dying) get one beat each instead of firing on top of each other. `resolveTriggeredEvent(game, event, undefined, sourceId)` records the source on the event, so a later bulk `drainEventQueue` never re-resolves it.
- Because reactors are re-derived after every beat, `enqueue` stamps each event with `witnessIds`: the permanents in play when it happened. A creature that reaches the battlefield **because** of an event is not a witness to it, so it cannot react to it. Without this, Rundvelt exiling Pashalik onto the battlefield made Pashalik burn for the death that summoned it. The event's own source is always a witness, since a dying card has already left the battlefield when its death event is queued.
- A beat finishes what it started. Anything a beat's resolution queued jumps ahead of the reactors still waiting on the parent event. Pashalik's trigger does not damage directly, it queues a `BURN_DAMAGE`; appended at the tail, that fireball landed *after* Rundvelt's reveal had already resolved, splitting one card's effect in half around another card's.
- Nothing in the runner knows a card name. Adding a new Horde effect means pushing a handler onto `HORDE_BEAT_HANDLERS`; order matters, because the first handler that claims an event owns its look.

### The board must be still between beats

A creature killed in combat leaves game state the instant its impact lands, so its triggers can resolve in sequence. `holdCombatCasualties` (`Battlefield.tsx`) keeps its layout slot as an invisible ghost while `resolvingHordeCombat` is true, so survivors never re-center mid-sequence; every casualty leaves together when the combat ends. The held slot must keep its **position**, not just exist: copies in a stack lay out by DOM order (each slot after the first carries a negative margin) and overlap by `--copy-stack-index`, so a ghost appended to the end sent a casualty from the middle of the stack to its back and shifted every copy behind it. The row is re-sorted by entry order for that reason. Grouping also ignores stats during that window, so a dying lord dropping its buff off every creature it covered cannot re-key and remount whole stacks.

A beat that *adds or removes* a permanent reflows the row, and that reflow is worth watching. `resolve()` reports whether the battlefield changed and the runner stamps the time; `done()` then waits only for whatever is **left** of `BOARD_SETTLE_MS` since that moment. Measuring from the end of the beat instead was a real source of dead air: the burn resolves at 500ms and runs to 1180ms, so its reflow was long finished, yet it sat through a second full settle before the next card could act. A creature arriving while casualties are held takes over the rightmost held slot instead of landing past the gap one left behind.

### Horde attackers commit on arrival

The Horde attacks with everything able, every turn, but declaring is a rules step that only runs after summons and enter triggers. A Zombie deck hides this — with no enter trigger, declaration commits in the same React batch as the summon, so Zombies render leaning with their attack chevron on their first frame. Goblins have enter triggers, so they used to sit upright through 700ms+ of effects and then turn.

`hordeAttackPending` in `Battlefield.tsx` closes the gap: while the Horde's turn is running and no attackers are declared yet, a Horde creature that `canAttack` is drawn as attacking. Visual only — it declares nothing, and the real declaration changes nothing on screen because the card already looks the part.

Current handlers:

| Handler | Claims | Presentation |
| --- | --- | --- |
| `burn` | `BURN_DAMAGE` | Fireball, see below |
| `static-aura` | `STATIC_AURA_ONLINE` | Source activation, see below |
| `death-reveal` | first pending source already left the battlefield | Card presented beside its graveyard, see below |
| `trigger-pulse` | any pending Horde source | Activation pulse on the source, toast, resolve |

## Burn

`Burn` is the reusable presentation for targeted non-combat damage.

Data contract:

- The card JSON declares `animation: "BURN"`.
- The effect declares its amount, target zone, controller, filters, and selection policy.
- The engine chooses the target and emits a `BURN_DAMAGE` event. UI code never chooses rules targets.

Resolution order:

1. The source card plays its standard effect-activation pulse **on the beat that queues the burn**. The burn beat itself does not repeat it — one effect must not look like the card triggering twice. The source lunges instead (`.burn-source-casting`): movement, no gold, no brightness.
2. A layered fireball — heat halo, trailing streak aimed along the flight heading, flickering flame licks, white-hot core — travels from the source card to the target card.
3. On impact, damage is committed in the engine.
4. The target flashes with the burn shader (`.burn-card-scorch-flash`), a spark burst fires, and a heavy condensed damage number rises.
5. A surviving target keeps a scorch tint (`.burn-card-scorch`) and light smoke until end-step cleanup clears `card.flags.burnSmoke`.
6. Buttons and battlefield interactions remain blocked until the animation and resulting triggers finish.

Use this contract for Pashalik Mons, Volley Veteran, and future Goblin burn effects.

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

## Death reveal

A card that triggers on its own death has no battlefield slot left to pulse.

- Claimed generically: any dies-trigger whose first pending source is no longer on the battlefield.
- Side matters. The **left** of the Horde panel is the graveyard side — that is where the deck's graveyard button lives — so a dying card is presented there (`horde-death-reveal-host`) and exits into it. The **right** (`horde-special-card-host`) stays reserved for spells and reveals still resolving, such as Smallpox.
- The card is shown at full colour with an ember glow from below (`horde-special-card-dying`). Its position beside the graveyard and its exit into it already say it is dying; a desaturating filter was tried and removed.
- Strict order: reveal in, activation pulse, card leaves for the graveyard, **then** the effect resolves. Resolving while the reveal is still on screen made whatever the effect puts onto the battlefield land mid-animation and stutter it.
- The entrance is a **CSS keyframe**, not framer-motion. This card mounts on the same frame the store commits a combat impact and the whole battlefield re-renders, so a main-thread JS animation loses that race every time. Framer-motion keeps only the exit, because `AnimatePresence` has to own unmount. Smallpox dodged the whole problem by mounting with `initial={false}`.
- The dying card carries **no `filter` at all** — `filter: none` has to be set explicitly, because `.horde-special-card` supplies its own `drop-shadow`. Any filter forces this subtree, a 13rem card plus its image, to be rasterised on its own, and that cost lands on the first frame of the entrance. `box-shadow` gives the same depth against the card's rounded rect for a fraction of the work.

Beat timings live as constants at the top of `useGameStore.ts` (`DEATH_REVEAL_*`), tuned so the activation reads as a reaction to the death rather than a pause before one.

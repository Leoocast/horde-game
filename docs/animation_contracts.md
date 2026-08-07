# Animation contracts

## Host presentation beats

Every Host reaction plays as one **beat**: one card acting at a time, board locked, engine state committed at the moment the animation says it lands.

`scheduleQueuedHostTriggers` (`src/store/hostBeats.ts`) walks `game.eventQueue` and hands the first *claimed* event to the handler that owns its presentation. A handler calls `resolve()` when its animation lands and `done()` when it is over; only then does the queue move on.

Three rules make the sequence readable:

- A claimed event resolves **one source per beat**. Two cards reacting to the same death (Rundvelt and Pashalik on one Goblin dying) get one beat each instead of firing on top of each other. `resolveTriggeredEvent(game, event, undefined, sourceId)` records the source on the event, so a later bulk `drainEventQueue` never re-resolves it.
- Because reactors are re-derived after every beat, `enqueue` stamps each event with `witnessIds`: the permanents in play when it happened. A creature that reaches the battlefield **because** of an event is not a witness to it, so it cannot react to it. Without this, Rundvelt Invoking Pashalik from the Archive made Pashalik burn for the death that summoned it. The event's own source is always a witness, since a dying card has already left the battlefield when its death event is queued.
- A beat finishes what it started. Anything a beat's resolution queued jumps ahead of the reactors still waiting on the parent event. Pashalik's trigger does not damage directly, it queues a `BURN_DAMAGE`; appended at the tail, that fireball landed *after* Rundvelt's reveal had already resolved, splitting one card's effect in half around another card's.
- Nothing in the runner knows a card name. Adding a new Host effect means pushing a handler onto `HOST_BEAT_HANDLERS`; order matters, because the first handler that claims an event owns its look.
- A source with multiple effects still resolves one effect per beat, but only its first effect in
  that arrival chain supplies the activation pulse. For a permanent with both a newly-online
  static aura and an entry trigger, the aura goes first; the entry trigger keeps its own toast and
  resolution timing without a second gold pulse or activation sound.

### The board must be still between beats

A creature killed in combat leaves game state the instant its impact lands, so its triggers can resolve in sequence. `holdCombatCasualties` (`src/components/battlefieldLayout.ts`) keeps its layout slot as an invisible ghost while `resolvingHostCombat` is true, so survivors never re-center mid-sequence; every casualty leaves together when the combat ends. The held slot must keep its **position**, not just exist: copies in a stack lay out by DOM order (each slot after the first carries a negative margin) and overlap by `--copy-stack-index`, so a ghost appended to the end sent a casualty from the middle of the stack to its back and shifted every copy behind it. The row is re-sorted by entry order for that reason. Grouping also ignores stats during that window, so a dying lord dropping its buff off every creature it covered cannot re-key and remount whole stacks.

**Only the creature row is held, and only creatures may inherit a held slot.** `battlefieldCardOrder` is the creature row's registry: `renderCardStacks` is called with the creature row alone and prunes every card outside it on each render, so Sources and other permanents (La Lápida Quebrada / `the_broken_headstone`) look like brand-new arrivals on *every* render. The slot-recycling pass — which lets an Echo summoned mid-combat take over a casualty's slot instead of landing past a hole — used to accept any card, so the first Source or Support it walked over consumed the ghost the instant something died. The held slot disappeared mid-sequence and the whole row re-centered. That was the "everything regroups when a card dies" bug: it needed a non-Echo permanent on the board to show up, which is why El Alzamiento de los Sinsepulcro and the player's side both hit it while a bare Goblin board did not. Both ends of the swap are now Echo-gated; `tests/battlefieldLayout.test.js` covers it.

A beat that *adds or removes* a permanent reflows the row, and that reflow is worth watching. `resolve()` reports whether the battlefield changed and the runner stamps the time; `done()` then waits only for whatever is **left** of `BOARD_SETTLE_MS` since that moment. Measuring from the end of the beat instead was a real source of dead air: the burn resolves at 500ms and runs to 1180ms, so its reflow was long finished, yet it sat through a second full settle before the next card could act. A creature arriving while casualties are held takes over the rightmost held slot instead of landing past the gap one left behind.

### Host attackers commit on arrival

The Host attacks with everything able, every turn, but declaring is a rules step that only runs after summons and enter triggers. A Zombie deck hides this — with no enter trigger, declaration commits in the same React batch as the summon, so Zombies render leaning with their attack chevron on their first frame. Goblins have enter triggers, so they used to sit upright through 700ms+ of effects and then turn.

`hostAttackPending` in `Battlefield.tsx` closes the gap: while the Host's turn is running and no attackers are declared yet, a Host creature that `canAttack` is drawn as attacking. Visual only — it declares nothing, and the real declaration changes nothing on screen because the card already looks the part.

Host entrances are also real queue work. Every newly committed permanent increments
`summoningAnimationCount`; `Battlefield` decrements it only when that permanent's WAAPI entrance
finishes. Arrival effects, queued reaction beats, and `startHostCombatSequence` all wait for the
counter to reach zero. Their lead-ins are therefore short handoffs, not duplicate summon delays.
`animatedHostIds` starts with the cards present when the battlefield mounts, so loading a board
and executing its first Host turn never replays the entrances of existing permanents.

Attack resolution order is a rules concern and follows `game.host.battlefield` insertion order,
which is summon chronology. It must never be rebuilt from visual families or stack keys. For
example, four Esbirros de Varka, then Chamán de la Brasa Sombría, then two later tokens resolve in exactly
that order. The layout may stack the two token waves, but grouping never moves the second wave in
front of the lord.

Non-token Host copies also preserve summon chronology. Identical copies may share a visual stack
only when `recordBattlefieldEntry` recorded the same Host turn for both. A later copy starts a new
stack at its real arrival position instead of jumping back into an older family stack. If entry
history is unavailable, layout keeps the copies separate rather than guessing that they arrived
together. `tests/battlefieldLayout.test.js` covers the Acechador Alado de la Cripta (`winged_stalker_of_the_crypt`) regression.

Current handlers:

| Handler | Claims | Presentation |
| --- | --- | --- |
| `burn` | `BURN_DAMAGE` | Fireball, see below |
| `burn-volley` | `BURN_VOLLEY_DAMAGE`, `BURN_PLAYER_LIFE_LOSS` | One or more Burn routes to cards or player life |
| `static-aura` | `STATIC_AURA_ONLINE` | Source activation, see below |
| `host-group-buff` | `HOST_GROUP_BUFF` | Shared buff lines; spells also reveal beside the Host deck |
| `death-reveal` | first pending source already left the battlefield | Card presented beside its graveyard, see below |
| `deferred-combat-volley` | an attack trigger whose damage waits for the Host sequence end | Silent rules capture; its single visible activation happens after the last attack |
| `trigger-pulse` | any pending Host source | Activation pulse on the source, toast, resolve |

Group buffs are committed on their beat rather than during synchronous effect resolution. The
event snapshots the creatures covered when the effect resolved and applies the stat change in the
same frame as the blue buff lines. A permanent source already received its activation pulse from
the ETB beat, so this beat does not pulse it again. An instant has no battlefield slot and instead
uses the spell reveal on the right side of the Host panel. Creatures revealed later in the turn
are not retroactively included.

## Burn

`Burn` is the reusable presentation for targeted non-combat damage.

Data contract:

- The card JSON declares `animation: "BURN"`.
- The effect declares its amount, target zone, controller, filters, and selection policy.
- The engine chooses the target and emits a `BURN_DAMAGE` event. UI code never chooses rules targets.

Resolution order:

The projectile is drawn by `BurnAnimator` with Three.js `ShaderMaterial` passes defined in
`src/components/burnFireball.ts`. Each pass handles at most six routes, but larger explicit volleys
are split across as many passes as needed in the same canvas, context and master clock; six is not
a visual cap. The silhouette comes from fractal noise, not from animated `border-radius`, so it
never reads as a sphere. One master clock drives everything:
`BURN_DURATION_MS` (1100ms), with the projectile launching at 20% and impact at 58%. The shader
derives its own constants from `BURN_FLIGHT_START_MS` / `BURN_IMPACT_AT_MS`; `--burn-duration` in
CSS still times the screen flash and the damage number, and the store's `BURN_IMPACT_MS` (638) and
`BURN_ANIMATION_MS` (1220) track the same clock.

1. The source card plays its standard effect-activation pulse **on the beat that queues the burn**. The burn beat itself does not repeat it — one effect must not look like the card triggering twice. The source lunges instead (`.burn-source-casting`): movement, no gold, no brightness. A charge build-up swells at the source, and a random cast whoosh (`fireballCastSfx`) fires as the projectile ignites.
2. A turbulent comet head travels from the source to the target: a teardrop stretched along the heading whose edge is eroded by noise advected backwards, with a white core only at its heart.
3. The trail is **deposited, not dragged**. Puffs and sparks are emitted at fixed instants and each one stays anchored where it was born, drifts sideways, rises, cools and burns out there. A trail that travels rigidly with the ball is a regression. Emission uses a sliding window over the most recent instants so it never runs out mid-flight and detaches from the head.
4. On impact (`BURN_IMPACT_MS`, 638ms), damage is committed in the engine and the canonical hit sound (`fireballHitSfx`) plays.
5. The impact is not a disc: the outline deforms with two angular frequencies, the interior breaks up with noise, tongues are flung outward, the mass rises as it dies, and smoke sits underneath a turbulent ring. The persistent Burn canvas is hidden whenever there is no active Burn and remains hidden during each handoff until WebGL has rendered the new effect's first valid frame. It gets a short impact shake while rendering; the board behind is deliberately **not** shaken. Procedural Burn does not mount the legacy full-screen DOM flash: the shader explosion, target scorch (`.burn-card-scorch-flash`) and condensed damage number own the impact. The classic renderer keeps its former flash.
6. A surviving target keeps a scorch tint (`.burn-card-scorch`) and light smoke until end-step cleanup clears `card.flags.burnSmoke`.
7. Buttons and battlefield interactions remain blocked until the animation and resulting triggers finish.

Each faction contributes only a colour ramp and a density (`burnMaterialColors`), never a copied
effect: `fire` for the Goblins, `oil` for Nerezh, `emerald` for Vaelor and `golden` for Varka. A
route's scale, projectile count and origin ride on the same shader, so a new material must not fork
the projectile, the trail or the impact.

Procedural routes travel on the exact source-to-target line by default. Only Vaelor's Invoked
counter volley opts into the curved route. Todos contra uno uses the same procedural fire at
`scale: 1.2` and keeps a straight flight path.

Use this contract for Escupefuego de la Retaguardia (`rear_guard_firebreather`), Jinete de la Salva
Umbría (`rider_of_the_umbral_volley`), and future Goblin burn effects.

### Burn volley to player life

Todos contra uno (`all_against_one`) reuses Burn's procedural shader, target and timing contracts
at `scale: 1.2`:

- Its `ATTACK_DECLARED` trigger silently snapshots the eligible Goblin ids and printed attack
  powers in `combat.pendingDamageVolleys`; it does not pulse or damage the player at declaration.
- After the final Host attack event and its queued reactions finish, the enchantment supplies its
  one activation pulse. The store aims Burn at `[data-player-life-panel]` instead of a card slot.
- One projectile is rendered per contributing attacker up to a visual cap of six, staggered by
  90ms. Each visible projectile plays one cast sound when it launches and one hit sound when it
  arrives; sounds are not layered into a single oversized cue. This remains one compact cast:
  one source charge, one final visual impact, and one damage number for the complete amount.
- The engine commits all pending volley damage at that final impact frame. Non-animated callers
  resolve the same pending damage from `finishHostCombat`, so presentation cannot change rules.
- The player life panel runs its normal damage reaction at impact. Buttons stay blocked until the
  extended final projectile clock has completed.

### Burn volley to multiple targets

Varka, Matriarca Infernal (`varka_infernal_matriarch`) uses the same compact volley clock with distinct routes:

- Its ETB activation beat pulses the source once and queues `BURN_VOLLEY_DAMAGE`. The volley beat
  never pulses it again.
- Every Burn event sourced by Varka resolves through her registered `golden` material and
  `scale: 1.3`. Her entry volley therefore uses the same white-yellow fire and projectile size as
  her two-projectile personal attacks.
- The engine snapshots the player and every opposing creature as rules targets. `BurnAnimator`
  receives that target list and calculates one source-to-target geometry for each projectile.
- Every captured target keeps a visible route. Volleys longer than six are divided into bounded
  shader passes that share one canvas and clock instead of dropping the remaining fireballs.
- Projectiles launch 90ms apart. Each one plays a singular cast sound at launch and the canonical
  singular hit sound at its own impact; every target gets its own impact effect and `-2` number.
- The stagger is presentation only. Player life and all still-present creatures take damage
  simultaneously when the final projectile lands, followed by one marked-damage cleanup.
- All hit creature ids are flashed together at resolution, and surviving creatures keep the
  normal scorch/smoke state until end-step cleanup.

### Emerald counter volley to multiple targets

Vaelor, Guardián Esmeralda (`vaelor_emerald_guardian`) reuses the projectile renderer for a rules
effect that places counters rather than dealing damage:

- Its Invoked trigger snapshots every opposing Echo currently on the Field and queues one
  `COUNTER_VOLLEY` event. Echoes that enter after that snapshot are not affected.
- The source activation waits for Vaelor's summon animation to finish. Vaelor pulses once, stays
  anchored, and launches one fireball toward every captured enemy using the emerald material and
  `scale: 1.8` of the `emerald-fireball` defense preset. This entry volley is the only Burn that
  keeps the curved source-to-target geometry. The zero-millisecond projectile gap makes every
  route launch and impact simultaneously.
- Every route owns its fireball-body trace, impact core, smoke, and ember burst. Multi-target
  volleys must never collapse procedural particles onto only the final projectile.
- The impact label is `-1/-1`; this presentation never deals damage or adds scorch state.
- Every still-present target receives one -1/-1 counter as a single simultaneous rules event at
  the shared 638ms impact. Lethal stat reduction is cleaned up only after all counters are placed.

### Repeated single Burns to player life

Mariscal de la Oleada (`marshal_of_the_wave`) does not aggregate its creature-entry triggers. Every other creature entering queues
one independent Burn toward `[data-player-life-panel]`; each has its own projectile, cast sound,
hit sound, impact, life reaction, and 1-damage engine resolution before the next trigger begins.
When the Mariscal itself created the entering token, `causeSourceId` marks that causal chain so
the damage follow-up does not repeat the activation pulse already shown for token creation.

### Oil Burn to player life

Nerezh, Matriarca Sinsepulcro (`nerezh_graveless_matriarch`) preserves its printed life-loss semantics while using the Burn presentation:

- `EACH_OPPONENT_LOSES_LIFE` with `animation: "OIL_BURN"` queues
  `BURN_PLAYER_LIFE_LOSS`; player life does not change until the projectile impacts.
- The projectile follows the ordinary Burn clock and reuses the current fireball cast and hit
  sounds. `variant: "oil"` only changes its material: nearly black pitch, muted violet
  iridescence, dark smoke, and a colder impact flash. Its high `ink` makes the mass cover the board
  instead of adding light, which is what separates pitch from flame.
- Each Zombie death remains a separate trigger and projectile. The follow-up does not repeat the
  Captain's activation pulse.

## Personal combat animations

`src/store/combatAnimation.ts` is the presentation registry for card-specific fights and direct
Host attacks. A fight registration matches a stable card definition, its combat role, and an
engine-resolved outcome. A direct-attack registration matches the card and its destination surface.
Both return a preset with source/target data, impact and completion clocks, and the visual effect to
play. `useGameStore` still refreshes and resolves the ordinary `HostAttackEvent` or player combat.
Animators never choose a winner or change combat damage.

When exactly one combatant survives, only that winner may claim a personal presentation. If the
winner has no registered preset, the fight uses the default combat animation instead of playing a
bespoke animation from the card that died. When both survive or both die, the existing
attacker-first registration order breaks the visual tie; the rules impact remains simultaneous.

The default Host lunge remains the fallback whenever no registration matches. A preset may
replace the normal two-card exchange when its source needs a stationary DOM anchor. A targeted
Host attacker may still complete its incoming lunge, but it returns to its stored target geometry
before the projectile lands and never performs its early lethal fade.

Current registration:

- Vaelor, Guardián Esmeralda (`vaelor_emerald_guardian`) uses `emerald-fireball` only as a defender
  when the attacker dies and Vaelor survives. A simultaneous lethal exchange is not a win and
  keeps the default combat animation.
- When Vaelor attacks the Host directly, `resolvePersonalAttackAnimation` reuses the same preset,
  keeps his card stationary, and targets the element marked with `data-host-life-emblem`. The first
  Host mill preview and the Host panel's hit reaction start at the 638ms projectile impact; later
  attackers wait for both the preset clock and any longer mill sequence. Default lunge attacks keep
  their immediate panel reaction.
- The preset reuses `BurnAnimator`'s canonical fireball clock and source-to-target geometry, with
  an emerald material, `scale: 1.8`, a straight route, and `sourceMoves: false`. Combat damage is committed at the
  fireball's 638ms impact; the beat remains locked until the 1220ms completion.
- Varka, Matriarca Infernal (`varka_infernal_matriarch`) uses `infernal-fireball` whenever she is
  the Host attacker. A defended attack targets the assigned defender; an undefended attack targets
  `[data-player-life-panel]`. Varka remains anchored, the ordinary lunge is suppressed, and the
  normal combat result lands once at the projectiles' shared 638ms impact. The preset uses Varka's
  white-yellow `golden` fire material at `scale: 1.3`, visibly smaller than Vaelor's personal
  `scale: 1.8` projectile. It casts two straight
  simultaneous routes from the left and right edges of Varka's card, with separate charge, trail,
  and ember particles; both converge on one target and still produce one rules impact.
- Consecutive Varkas reuse the application's persistent shared WebGL context. Per-attack shader
  materials and geometry are disposed between beats, but the shared renderer survives for the
  session; force-losing and recreating the context between stacked attackers is a regression. The
  destination canvas must not become visible during that handoff until the next attack has rendered
  and copied its first valid frame.
- Adding another bespoke fight or direct attack means registering its context and adding or reusing
  a preset; do not add card-name branches to animator components or resolve combat inside VFX.

## Static activation

Static abilities apply continuously, so without a beat the player only ever sees numbers that already changed and has to hunt for the card responsible.

Data contract:

- Nothing is declared per card. `collectStaticAuras` (`src/engine/StaticAuras.ts`) reads every `STATIC_BUFF` / `STATIC_GRANT_KEYWORD` already on the battlefield and reports who each one currently covers.
- The store keeps a snapshot of that coverage and announces only auras whose covered set **grew**. An aura that only lost a creature is not re-announced.
- Everything here is presentation-only. Rules are untouched: `getPowerEndurance` and `getTraits` never read any of it.

The announcement is **two-phase**, and the split is the whole point:

- **Capture** (`captureStaticAuraBeats`) runs the instant the Host's summons are committed to the store, before any frame renders them. It diffs coverage and records the withheld stat bonus in `heldStaticAuraBonuses`, which `cardStatState` subtracts. The new creatures are therefore drawn *unbuffed* from the very first frame.
- **Flush** (`flushStaticAuraBeats`) queues the `STATIC_AURA_ONLINE` beats once the summon sequence is over.
- **Release** happens in the same frame the beat plays its buff lines, so the numbers rise with the animation.

Capture runs when summons land and again after attack triggers, so tokens created attacking by
Vardek or the Mariscal are covered too. Keyword grants are announced but never withheld: a keyword
reads as an ability, not as a number that silently changed.

Resolution order:

1. Lead-in, so a card that just landed finishes its summon pop before the same slot animates again.
2. The granting card plays its effect-activation pulse, with a toast naming the bonus and how many creatures it covers.
3. The withheld stats land as the newly covered creatures show the same blue rising buff lines a player buff uses (`buff-rise-lines-blue`). A warm tone was tried and rejected: `.buff-rise-lines` blends with `mix-blend-mode: screen`, so ember colours wash out completely against Goblin artwork.

The rising lines may finish while the next beat begins. If the same permanent also has an ETB
effect, the aura has already supplied its activation pulse: the ETB uses a short 160ms handoff
instead of another summon-length pause, then immediately presents any follow-up event such as
Chamán de la Brasa Sombría's Burn.

## Death reveal

A card that triggers on its own death has no battlefield slot left to pulse.

- Claimed generically: any dies-trigger whose first pending source is no longer on the battlefield.
- Side matters. The **left** of the Host panel is the Memory side — that is where its button lives — so a dying card is presented there (`host-death-reveal-host`) and exits into it. The **right** (`host-special-card-host`) stays reserved for spells and reveals still resolving, such as Tributo de los Cuatro Pesares (`tribute_of_the_four_sorrows`).
- The card is shown at full colour with an ember glow from below (`host-special-card-dying`). Its position beside the graveyard and its exit into it already say it is dying; a desaturating filter was tried and removed.
- Strict order: reveal in, activation pulse, card leaves for the graveyard, **then** the effect resolves. Resolving while the reveal is still on screen made whatever the effect puts onto the battlefield land mid-animation and stutter it.
- The entrance is a **CSS keyframe**, not framer-motion. This card mounts on the same frame the store commits a combat impact and the whole battlefield re-renders, so a main-thread JS animation loses that race every time. Framer-motion keeps only the exit, because `AnimatePresence` has to own unmount. The `tribute_of_the_four_sorrows` bridge dodged the whole problem by mounting with `initial={false}`.
- The dying card carries **no `filter` at all** — `filter: none` has to be set explicitly, because `.host-special-card` supplies its own `drop-shadow`. Any filter forces this subtree, a 13rem card plus its image, to be rasterised on its own, and that cost lands on the first frame of the entrance. `box-shadow` gives the same depth against the card's rounded rect for a fraction of the work.

Beat timings live as constants at the top of `src/store/hostBeats.ts` (`DEATH_REVEAL_*`), tuned so the activation reads as a reaction to the death rather than a pause before one.

import type { CardInstance, EffectDefinition, EventItem, GameState } from "../engine/GameTypes";
import { beginHostCombat, checkWinLoss, declareHostAttackers } from "../engine/CombatResolver";
import {
  EFFECT_ANNOUNCEMENTS,
  effectNeedsManualTarget,
  pendingTriggerSources,
  resolveTriggeredEvent,
  runInvokedTriggers,
} from "../engine/EffectResolver";
import { enqueue } from "../engine/EventQueue";
import { collectStaticAuras, heldAuraBonuses, newlyCoveredAuras, snapshotStaticAuras, type StaticAuraSnapshot } from "../engine/StaticAuras";
import { getPowerEndurance } from "../engine/StaticEffects";
import { fireballCastSfx, fireballHitSfx, type SfxId } from "../audio/soundManifest";
import { useAudioStore } from "./useAudioStore";
import {
  resolveCardBurnMaterial,
  resolvePersonalProjectileEffect,
  type BurnMaterialVariant,
} from "./combatAnimation";
import { useToastStore } from "./useToastStore";
import { useGameStore, type BurnAnimationTarget } from "./useGameStore";
import { hasQueuedPlayerTriggers, scheduleQueuedPlayerTriggers } from "./playerBeats";
import {
  BUFF_ANIMATION_MS,
  appendHostMillAnimations,
  discardPauseInProgress,
  findBattlefieldCard,
  monsterSfx,
  notifyDiscardEffects,
  startBuffBeat,
  uiCardName,
  uiTraitLabel,
  uiText,
} from "./presentationEffects";

// Arrival orchestration now waits for every Host entrance animation before presenting effects,
// so this is only a small readability gap rather than a second summon-length pause.
const HOST_ENTER_TRIGGER_START_MS = 80;
const HOST_ENTER_TRIGGER_RESOLVE_MS = 430;
// Matches the fireball's CSS master clock (--burn-duration 1100ms, impact at 58%). The window
// runs a touch past the duration so the rising damage number finishes before the layer clears.
const BURN_IMPACT_MS = 638;
const BURN_ANIMATION_MS = 1220;
const BURN_PROJECTILE_LAUNCH_MS = 220;
const BURN_PROJECTILE_GAP_MS = 90;
const SPECIAL_DEATH_ANIMATION_MS = 260;
// The entrance is already settled before aura beats begin; retain only a short visual handoff.
const STATIC_AURA_LEAD_IN_MS = 80;
const STATIC_AURA_PULSE_MS = STATIC_AURA_LEAD_IN_MS + 420;
// Once the buff lands, its rising lines can finish underneath the next queued effect. Holding
// the queue for the full tail made a lord with a second ETB (Shaman of the Umbral Ember) feel like it
// stalled every card behind it.
const STATIC_AURA_BEAT_MS = STATIC_AURA_PULSE_MS + 360;
// The reveal mounts on the same frame the combat impact commits and the row reflows; a short
// lead-in lets the board finish moving first. Kept tight — the whole beat has to read as a
// reaction to the death, not as a pause before one.
const DEATH_REVEAL_LEAD_IN_MS = 120;
// Matches the CSS entrance (.host-death-reveal-enter), so the activation pulse fires the
// instant the card has settled rather than after a dead beat.
const DEATH_REVEAL_ENTER_MS = 280;
const DEATH_REVEAL_HOLD_MS = 300;
const DEATH_REVEAL_EXIT_MS = 380;
const SPELL_REVEAL_ENTER_MS = 280;
const SPELL_REVEAL_BUFF_MS = 680;
const SPELL_REVEAL_HOLD_MS = 1120;
const SPELL_REVEAL_EXIT_MS = 300;
// A card entering or leaving the Field re-centers the row, and the Field FLIP-animates
// that move over 360ms. A beat that changed the board waits it out, so the next attacker never
// charges across a row that is still sliding into place.
const BOARD_SETTLE_MS = 560;
const HOST_ENTRY_WAIT_POLL_MS = 40;

let hostAutoTriggerSequenceId = 0;
// Coverage of every Host static ability as of the last announced beat. Diffed, not recomputed
// from scratch, so a lord only re-announces itself when it starts buffing someone new.
let hostStaticAuraSnapshot: StaticAuraSnapshot = {};

/** The current sequence epoch. Scheduled callbacks capture it and bail when a reset bumped it. */
export function hostSequenceEpoch(): number {
  return hostAutoTriggerSequenceId;
}

/** Invalidates every scheduled Host-sequence callback (game reset / new game). */
export function resetHostSequence(): void {
  hostAutoTriggerSequenceId += 1;
  hostStaticAuraSnapshot = {};
}

export function hasInvokedTrigger(card: CardInstance): boolean {
  return card.effects.some((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "INVOKED" && !effectNeedsManualTarget(effect.effect));
}

function hostInvokedTriggerMessage(card: CardInstance): string {
  const trigger = card.effects.find((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "INVOKED");
  const effect = trigger?.effect as EffectDefinition | undefined;
  const cardName = uiCardName(card);
  const announcement = effect ? EFFECT_ANNOUNCEMENTS[String(effect.type)] : undefined;
  const count = Number(effect?.amount ?? 1);
  if (announcement === "createsTokens") return uiText("toast.cardCreatesTokens", { card: cardName, count });
  if (announcement === "discardsArchive") return uiText("toast.cardMills", { card: cardName, count });
  if (announcement === "discards") return uiText("toast.cardDiscards", { card: cardName, count });
  if (announcement === "lifeLoss") return uiText("toast.cardLifeLoss", { card: cardName, count });
  return uiText("toast.cardTrigger", { card: cardName });
}

export function scheduleHostInvokedTriggers(
  cards: CardInstance[],
  onComplete?: () => void,
  options: { activationAlreadyShownSourceIds?: string[] } = {},
): void {
  const sequenceId = ++hostAutoTriggerSequenceId;
  const runNext = (index: number) => {
    if (sequenceId !== hostAutoTriggerSequenceId) return;
    const card = cards[index];
    if (!card) {
      useGameStore.setState({ hostAutoTriggerCount: 0 });
      onComplete?.();
      return;
    }
    // Every Echo arrival broadcasts ECHO_INVOKED, even when it has no self INVOKED ability.
    // Resolve that silent broadcast before moving to the next visible arrival beat so observers
    // such as Marshal of the Wave react in the same order as they do in the synchronous engine path.
    if (!hasInvokedTrigger(card)) {
      useGameStore.setState((state) => {
        const previous = state.game;
        const next = structuredClone(previous) as GameState;
        const source = next.host.field.find((item) => item.instanceId === card.instanceId);
        if (source) runInvokedTriggers(next, source);
        notifyDiscardEffects(previous, next);
        return {
          game: next,
          hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
        };
      });
      scheduleQueuedHostTriggers(() => runNext(index + 1));
      return;
    }
    const activationAlreadyShown = options.activationAlreadyShownSourceIds?.includes(card.instanceId) ?? false;
    // A static aura already announced and illuminated this source. Its second effect still gets
    // a distinct queued beat, but needs only a quick handoff rather than another summon-length
    // anticipation pause.
    const triggerStartMs = activationAlreadyShown ? 40 : HOST_ENTER_TRIGGER_START_MS;
    const triggerResolveMs = activationAlreadyShown ? 80 : HOST_ENTER_TRIGGER_RESOLVE_MS;
    const triggerHandoffMs = activationAlreadyShown ? 40 : 180;
    useGameStore.setState({ hostAutoTriggerCount: 1 });
    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      if (!activationAlreadyShown) {
        useAudioStore.getState().playSfx("activateEffect");
        useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
      }
      useToastStore.getState().pushToast({
        title: uiText("toast.hostEffect"),
        message: hostInvokedTriggerMessage(card),
        tone: "host",
      });
    }, triggerStartMs);
    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useGameStore.setState((state) => {
        const previous = state.game;
        const next = structuredClone(previous) as GameState;
        const source = next.host.field.find((item) => item.instanceId === card.instanceId);
        if (source) {
          runInvokedTriggers(next, source);
        }
        notifyDiscardEffects(previous, next);
        return {
          game: next,
          hostAutoTriggerCount: 1,
          hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
        };
      });
      // Enter triggers can create creatures (Chief of the Double Guard, Rider of the Third Charge). Hold their aura
      // buffs in the same tick they appear, so they are never drawn already buffed either.
      captureStaticAuraBeats();
      window.setTimeout(() => {
        if (sequenceId === hostAutoTriggerSequenceId) {
          scheduleQueuedHostTriggers(() => runNext(index + 1));
        }
      }, triggerHandoffMs);
    }, triggerStartMs + triggerResolveMs);
  };
  runNext(0);
}

/** Resolves the presentation attached to every newly revealed Host card. Static auras go first;
 * arrivals without a self trigger still broadcast ECHO_INVOKED silently, while a card whose aura
 * already supplied the activation pulse keeps its ETB as a separate beat without glowing twice. */
export function scheduleHostArrivalEffects(cards: CardInstance[], onComplete?: () => void): void {
  const waitingSequenceId = hostAutoTriggerSequenceId;
  if (useGameStore.getState().summoningAnimationCount > 0) {
    window.setTimeout(() => {
      if (waitingSequenceId === hostAutoTriggerSequenceId) scheduleHostArrivalEffects(cards, onComplete);
    }, HOST_ENTRY_WAIT_POLL_MS);
    return;
  }
  const auraSourceIds = [
    ...new Set(useGameStore.getState().pendingStaticAuras.map((aura) => aura.sourceId)),
  ];
  const hasAuraBeats = useGameStore.getState().pendingStaticAuras.length > 0;
  flushStaticAuraBeats();
  const runEnterTriggers = () =>
    scheduleHostInvokedTriggers(cards, onComplete, { activationAlreadyShownSourceIds: auraSourceIds });
  if (hasAuraBeats) {
    scheduleQueuedHostTriggers(runEnterTriggers);
    return;
  }
  runEnterTriggers();
}

export function startHostCombatSequence(): void {
  if (useGameStore.getState().summoningAnimationCount > 0) {
    const waitingSequenceId = hostAutoTriggerSequenceId;
    window.setTimeout(() => {
      if (waitingSequenceId === hostAutoTriggerSequenceId) startHostCombatSequence();
    }, HOST_ENTRY_WAIT_POLL_MS);
    return;
  }
  captureStaticAuraBeats();
  flushStaticAuraBeats();
  const begun = beginHostCombat(useGameStore.getState().game, { deferTriggeredEvents: true });
  useGameStore.setState({ game: begun });
  scheduleQueuedHostTriggers(() => {
    const declared = declareHostAttackers(useGameStore.getState().game, { deferTriggeredEvents: true });
    useGameStore.setState({ game: declared });
    // Attack triggers can add creatures (Vardek, Marshal of the Wave), so re-check aura coverage
    // once they settled instead of before they existed.
    scheduleQueuedHostTriggers(() => {
      captureStaticAuraBeats();
      flushStaticAuraBeats();
      scheduleQueuedHostTriggers();
    });
  });
}

// Static aura announcements are two-phase on purpose.
//
// Capture runs the moment the Host's summons land: it records which auras started covering new
// creatures and holds their stat bonus back in `heldStaticAuraBonuses`, so those creatures are
// drawn UNBUFFED from the very frame they appear. Flush queues the beats afterwards, once the
// summon sequence is over. Without the split the creatures would render already buffed and the
// beat meant to explain the buff would have nothing left to show.
export function captureStaticAuraBeats(): void {
  const auras = collectStaticAuras(useGameStore.getState().game, "host");
  const announced = newlyCoveredAuras(auras, hostStaticAuraSnapshot);
  hostStaticAuraSnapshot = snapshotStaticAuras(auras);
  if (announced.length === 0) return;
  useGameStore.setState((state) => {
    const pending = [...state.pendingStaticAuras];
    for (const aura of announced) {
      const existing = pending.findIndex((item) => item.key === aura.key);
      if (existing === -1) {
        pending.push(aura);
        continue;
      }
      const merged = new Set([...pending[existing].affectedIds, ...aura.affectedIds]);
      pending[existing] = { ...pending[existing], affectedIds: [...merged] };
    }
    return { pendingStaticAuras: pending, heldStaticAuraBonuses: heldAuraBonuses(pending) };
  });
}

export function flushStaticAuraBeats(): void {
  const pending = useGameStore.getState().pendingStaticAuras;
  if (pending.length === 0) return;
  useGameStore.setState((state) => {
    const next = structuredClone(state.game) as GameState;
    for (const aura of pending) {
      const alreadyQueued = next.eventQueue.some(
        (event) => event.type === "STATIC_AURA_ONLINE" && event.payload?.auraKey === aura.key,
      );
      if (alreadyQueued) continue;
      enqueue(next, {
        type: "STATIC_AURA_ONLINE",
        sourceId: aura.sourceId,
        payload: {
          auraKey: aura.key,
          affectedIds: aura.affectedIds,
          power: aura.power,
          endurance: aura.endurance,
          keyword: aura.keyword,
        },
      });
    }
    return { game: next };
  });
}

/** Lets the held stat bonus land, at the same instant the beat plays its buff lines. */
function releaseStaticAura(auraKey: string): void {
  useGameStore.setState((state) => {
    const pending = state.pendingStaticAuras.filter((aura) => aura.key !== auraKey);
    if (pending.length === state.pendingStaticAuras.length) return {};
    return { pendingStaticAuras: pending, heldStaticAuraBonuses: heldAuraBonuses(pending) };
  });
}

// ---------------------------------------------------------------------------
// Host presentation beats
//
// Every Host reaction plays as one "beat": exactly one card acting at a time, board locked,
// engine state committed at the moment the animation says it lands. `scheduleQueuedHostTriggers`
// walks `game.eventQueue` and hands the first claimed event to the handler that owns its look;
// the handler calls `done()` when its animation is over and the queue moves on.
//
// Adding a new Host effect = push a handler here. The runner never learns a card name, and two
// effects reacting to the same death (Summoner of the Ranks + Rear-Guard Firebreather) get one beat EACH instead of firing
// on top of each other, because a claimed event resolves one source per beat.
// ---------------------------------------------------------------------------

type HostBeatContext = {
  event: EventItem;
  /** Host-controlled sources of `event` that still owe a reaction; act on the first one. */
  sources: CardInstance[];
  sequenceId: number;
  /** Commits this beat's engine effect. Call once, at the moment the animation lands. Returns
   *  true when the Field changed, i.e. the row is about to reflow. */
  resolve: () => boolean;
  /** Hands control back to the queue so the next beat can start. */
  done: () => void;
};

type HostBeatHandler = {
  id: string;
  /** Claiming parks the queue on this event so the beat plays before anything else resolves. */
  claims: (event: EventItem, sources: CardInstance[], game: GameState) => boolean;
  run: (context: HostBeatContext) => void;
};

export function scheduleQueuedHostTriggers(onComplete?: () => void): void {
  if (useGameStore.getState().summoningAnimationCount > 0) {
    const waitingSequenceId = hostAutoTriggerSequenceId;
    window.setTimeout(() => {
      if (waitingSequenceId === hostAutoTriggerSequenceId) scheduleQueuedHostTriggers(onComplete);
    }, HOST_ENTRY_WAIT_POLL_MS);
    return;
  }
  if (discardPauseInProgress(useGameStore.getState())) {
    window.setTimeout(() => scheduleQueuedHostTriggers(onComplete), 120);
    return;
  }
  const sequenceId = hostAutoTriggerSequenceId;
  let event: EventItem | undefined;
  let sources: CardInstance[] = [];
  let handler: HostBeatHandler | undefined;

  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    while (next.eventQueue.length > 0) {
      const candidate = next.eventQueue[0];
      const pendingSources = pendingTriggerSources(next, candidate);
      const candidateSources = pendingSources.filter((source) => source.controller === "host");
      const claimed = HOST_BEAT_HANDLERS.find((item) => item.claims(candidate, candidateSources, next));
      if (claimed) {
        event = candidate;
        sources = candidateSources;
        handler = claimed;
        break;
      }
      // A shared queue can park a player reaction in front of Host work during combat. Yield
      // without resolving it so the player beat can announce the source and land its animation.
      if (pendingSources.some((source) => source.controller === "player")) break;
      next.eventQueue.shift();
      resolveTriggeredEvent(next, candidate);
    }
    if (!event) checkWinLoss(next);
    return {
      game: next,
      hostAutoTriggerCount: event ? 1 : 0,
      hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
    };
  });

  const claimedEvent = event;
  const claimedHandler = handler;
  if (!claimedEvent || !claimedHandler) {
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedPlayerTriggers(() => scheduleQueuedHostTriggers(onComplete));
      return;
    }
    onComplete?.();
    return;
  }
  // The row's reflow starts when the board changes, i.e. at resolve() — not when the beat's own
  // animation happens to end. Measuring the settle from the end made a beat whose animation
  // already outlasted the reflow (the burn resolves at 500ms and runs to 1180ms) sit through a
  // second full settle of dead air. Only ever wait for what is actually left.
  let boardChangedAt: number | undefined;
  claimedHandler.run({
    event: claimedEvent,
    sources,
    sequenceId,
    resolve: () => {
      const changed = resolveBeatEvent(claimedEvent, sources[0]?.instanceId);
      if (changed) boardChangedAt = performance.now();
      return changed;
    },
    done: () => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      const settled = boardChangedAt === undefined ? BOARD_SETTLE_MS : performance.now() - boardChangedAt;
      const remaining = Math.max(0, BOARD_SETTLE_MS - settled);
      if (remaining === 0) {
        scheduleQueuedHostTriggers(onComplete);
        return;
      }
      window.setTimeout(() => {
        if (sequenceId === hostAutoTriggerSequenceId) scheduleQueuedHostTriggers(onComplete);
      }, remaining);
    },
  });
}

// Commits one beat's engine effect. With `sourceId`, only that card's triggers resolve and the
// event stays queued for the remaining reactors; without it, the event is fully consumed.
// Reports whether the Field gained or lost a card, so the caller knows to wait for the
// row's reflow before starting the next beat.
function resolveBeatEvent(event: EventItem, sourceId?: string): boolean {
  let fieldChanged = false;
  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    const queued = next.eventQueue.find((item) => item.id === event.id);
    if (!queued) return {};
    const knownEventIds = new Set(next.eventQueue.map((item) => item.id));
    if (sourceId) {
      resolveTriggeredEvent(next, queued, undefined, sourceId);
      if (pendingTriggerSources(next, queued).length === 0) {
        next.eventQueue = next.eventQueue.filter((item) => item.id !== event.id);
      }
    } else {
      next.eventQueue = next.eventQueue.filter((item) => item.id !== event.id);
      resolveTriggeredEvent(next, queued);
    }
    // A beat finishes what it started before the queue moves on. Rear-Guard Firebreather's trigger does not
    // deal damage directly, it queues a BURN_DAMAGE event; appended at the tail, that fireball
    // played AFTER Summoner of the Ranks' reveal had already resolved, so one card's effect was split in
    // half around another card's. Anything a beat spawned jumps ahead of the reactors still
    // waiting on the parent event.
    const spawned = next.eventQueue.filter((item) => !knownEventIds.has(item.id));
    if (spawned.length > 0) {
      next.eventQueue = [...spawned, ...next.eventQueue.filter((item) => knownEventIds.has(item.id))];
    }
    const summoned = next.host.field.filter(
      (card) => !previous.host.field.some((old) => old.instanceId === card.instanceId),
    );
    if (summoned[0]) useAudioStore.getState().playSfx(monsterSfx(summoned[0]));
    fieldChanged =
      next.host.field.length !== previous.host.field.length ||
      next.player.field.length !== previous.player.field.length;
    notifyDiscardEffects(previous, next);
    return {
      game: next,
      summoningAnimationCount: state.summoningAnimationCount + summoned.length,
      hostMillAnimationQueue: appendHostMillAnimations(state, previous, next),
    };
  });
  return fieldChanged;
}

function pickRandom(ids: SfxId[]): SfxId {
  return ids[Math.floor(Math.random() * ids.length)];
}

function burnMaterialForEvent(game: GameState, event: EventItem): BurnMaterialVariant {
  const liveSource = event.sourceId ? findBattlefieldCard(game, event.sourceId) : undefined;
  const sourceDefinitionId = typeof event.payload?.sourceDefinitionId === "string"
    ? event.payload.sourceDefinitionId
    : liveSource?.definitionId;
  const fallback = event.payload?.variant === "oil"
    ? "oil"
    : event.payload?.variant === "emerald"
      ? "emerald"
      : event.payload?.variant === "golden"
        ? "golden"
        : "fire";
  return resolveCardBurnMaterial(sourceDefinitionId, fallback);
}

const burnBeatHandler: HostBeatHandler = {
  id: "burn",
  claims: (event) => event.type === "BURN_DAMAGE",
  run: ({ event, sequenceId, resolve, done }) => {
    let committed = false;
    const commit = () => {
      if (committed || sequenceId !== hostAutoTriggerSequenceId) return;
      committed = true;
      resolve();
      useGameStore.setState({ specialDeadCardIds: [] });
    };
    const targetId = String(event.payload?.targetId ?? "");
    if (!targetId) {
      resolve();
      done();
      return;
    }
    const game = useGameStore.getState().game;
    useGameStore.setState({
      burnAnimation: {
        id: event.id,
        sourceId: event.sourceId,
        targetId,
        amount: Number(event.payload?.amount ?? 0),
        variant: burnMaterialForEvent(game, event),
      },
      burnImpactCardIds: [],
      hostAutoTriggerCount: 1,
    });
    // No activation pulse here: the source already flashed gold on the beat that queued this
    // burn, and firing it twice for one effect reads as the card triggering again. It still
    // lunges — `.burn-source-casting` moves it without the gold.
    // The whoosh fires as the fireball ignites; a fresh voice each time so back-to-back burns
    // never loop the same clip.
    useAudioStore.getState().playSfx(pickRandom(fireballCastSfx));

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx(fireballHitSfx);
      // The scorch shader is keyed off the impact, not the projectile, so the card only
      // reddens once the fireball actually reaches it.
      const lethalTargetIds = burnLethalTargetIds(useGameStore.getState().game, [targetId], Number(event.payload?.amount ?? 0));
      useGameStore.setState({
        burnImpactCardId: targetId,
        burnImpactEventId: Date.now(),
        specialDeadCardIds: lethalTargetIds,
      });
      if (lethalTargetIds.length === 0) {
        commit();
        return;
      }
      // Keep lethal targets on the Field through the same death fade used by
      // fight/destroy spells. Committing Burn immediately removed the DOM node before
      // the death class could render.
    }, BURN_IMPACT_MS);

    // Registered up front, before the animation-finish timer. If the browser throttles and
    // releases both timers in one batch, the event is still consumed before done() can let
    // the queue claim the same Burn again.
    window.setTimeout(commit, BURN_IMPACT_MS + SPECIAL_DEATH_ANIMATION_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      commit();
      // Leave hostAutoTriggerCount alone: the runner sets it for the next beat, and clearing
      // it here would unblock the board for one frame between beats.
      useGameStore.setState({ burnAnimation: undefined, burnImpactCardId: undefined, burnImpactCardIds: [] });
      done();
    }, BURN_ANIMATION_MS);
  },
};

const burnVolleyBeatHandler: HostBeatHandler = {
  id: "burn-volley",
  claims: (event) => event.type === "BURN_VOLLEY_DAMAGE" || event.type === "BURN_PLAYER_LIFE_LOSS",
  run: ({ event, sequenceId, resolve, done }) => {
    let committed = false;
    const commit = () => {
      if (committed || sequenceId !== hostAutoTriggerSequenceId) return;
      committed = true;
      resolve();
      useGameStore.setState({ specialDeadCardIds: [] });
    };
    const game = useGameStore.getState().game;
    const targetIds = Array.isArray(event.payload?.targetIds)
      ? event.payload.targetIds.map(String).filter((targetId) => Boolean(findBattlefieldCard(game, targetId)))
      : [];
    const targetPlayer = Boolean(event.payload?.targetPlayer);
    const targets: BurnAnimationTarget[] = [
      ...targetIds.map((targetId) => ({ targetKind: "card" as const, targetId })),
      ...(targetPlayer ? [{ targetKind: "playerLife" as const }] : []),
    ];
    if (targets.length === 0) {
      resolve();
      done();
      return;
    }

    useGameStore.setState({
      burnAnimation: {
        id: event.id,
        sourceId: event.sourceId,
        targets,
        amount: Number(event.payload?.amount ?? 0),
        variant: burnMaterialForEvent(game, event),
      },
      hostAutoTriggerCount: 1,
    });
    // The ETB beat already gave Chainwhirler its single gold activation. This follow-up owns
    // only the projectiles, with an individual cast and impact voice for every target.
    targets.forEach((_, projectileIndex) => {
      const projectileDelay = projectileIndex * BURN_PROJECTILE_GAP_MS;
      window.setTimeout(() => {
        if (sequenceId !== hostAutoTriggerSequenceId) return;
        useAudioStore.getState().playSfx(pickRandom(fireballCastSfx));
      }, BURN_PROJECTILE_LAUNCH_MS + projectileDelay);

      window.setTimeout(() => {
        if (sequenceId !== hostAutoTriggerSequenceId) return;
        useAudioStore.getState().playSfx(fireballHitSfx);
        if (projectileIndex !== targets.length - 1) return;

        const impactEventId = Date.now();
        const lethalTargetIds = burnLethalTargetIds(useGameStore.getState().game, targetIds, Number(event.payload?.amount ?? 0));
        useGameStore.setState({
          burnImpactCardIds: targetIds,
          burnImpactEventId: impactEventId,
          specialDeadCardIds: lethalTargetIds,
          ...(targetPlayer ? { lifeDamageAnimationId: impactEventId } : {}),
        });
        // Chainwhirler's damage is one simultaneous event. Earlier impacts are presentation;
        // the last impact commits the damage to the player and every surviving target together.
        if (lethalTargetIds.length === 0) {
          commit();
          return;
        }
      }, BURN_IMPACT_MS + projectileDelay);
    });

    const finalProjectileDelay = (targets.length - 1) * BURN_PROJECTILE_GAP_MS;
    // Pre-register the lethal commit before the finish callback. This ordering matters when
    // a busy/throttled tab releases several expired timers together.
    window.setTimeout(commit, BURN_IMPACT_MS + finalProjectileDelay + SPECIAL_DEATH_ANIMATION_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      // Fail-safe invariant: no Burn beat may call done() while its queue event is unconsumed.
      commit();
      useGameStore.setState({
        burnAnimation: undefined,
        burnImpactCardId: undefined,
        burnImpactCardIds: [],
      });
      done();
    }, BURN_ANIMATION_MS + finalProjectileDelay);
  },
};

const counterVolleyBeatHandler: HostBeatHandler = {
  id: "counter-volley",
  claims: (event) => event.type === "COUNTER_VOLLEY",
  run: ({ event, sequenceId, resolve, done }) => {
    let committed = false;
    const commit = () => {
      if (committed || sequenceId !== hostAutoTriggerSequenceId) return;
      committed = true;
      resolve();
      useGameStore.setState({ specialDeadCardIds: [] });
    };
    const game = useGameStore.getState().game;
    const targetIds = Array.isArray(event.payload?.targetIds)
      ? event.payload.targetIds.map(String).filter((targetId) => Boolean(findBattlefieldCard(game, targetId)))
      : [];
    if (targetIds.length === 0) {
      resolve();
      done();
      return;
    }

    const source = event.sourceId ? findBattlefieldCard(game, event.sourceId) : undefined;
    const sourceSide = event.payload?.sourceSide === "host" ? "host" : "player";
    if (source) {
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
      useToastStore.getState().pushToast({
        title: uiText(sourceSide === "player" ? "toast.chroniclerEffect" : "toast.hostEffect"),
        message: uiText("toast.cardTrigger", { card: uiCardName(source) }),
        tone: sourceSide === "player" ? "success" : "host",
      });
    }

    const amount = Math.max(0, Number(event.payload?.amount ?? 0));
    const counterType = String(event.payload?.counterType ?? "+1/+1");
    const projectileEffect = resolvePersonalProjectileEffect("emerald-fireball", amount);
    useGameStore.setState({
      burnAnimation: {
        id: event.id,
        sourceId: event.sourceId,
        targets: targetIds.map((targetId) => ({ targetKind: "card" as const, targetId })),
        amount,
        variant: projectileEffect.variant,
        scale: projectileEffect.scale,
        sourceMoves: projectileEffect.sourceMoves,
        projectileGapMs: Math.max(0, Number(event.payload?.projectileGapMs ?? 0)),
        impactLabel: counterType,
      },
      hostAutoTriggerCount: 1,
    });

    window.setTimeout(() => {
      if (sequenceId === hostAutoTriggerSequenceId) {
        useAudioStore.getState().playSfx(pickRandom(fireballCastSfx));
      }
    }, BURN_PROJECTILE_LAUNCH_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx(fireballHitSfx);
      const lethalTargetIds = counterVolleyLethalTargetIds(
        useGameStore.getState().game,
        targetIds,
        counterType,
        amount,
      );
      useGameStore.setState({
        burnImpactCardIds: targetIds,
        burnImpactEventId: Date.now(),
        specialDeadCardIds: lethalTargetIds,
      });
      if (lethalTargetIds.length === 0) commit();
    }, BURN_IMPACT_MS);

    window.setTimeout(commit, BURN_IMPACT_MS + SPECIAL_DEATH_ANIMATION_MS);
    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      commit();
      useGameStore.setState({
        burnAnimation: undefined,
        burnImpactCardId: undefined,
        burnImpactCardIds: [],
      });
      done();
    }, BURN_ANIMATION_MS);
  },
};

function counterVolleyLethalTargetIds(
  game: GameState,
  targetIds: string[],
  counterType: string,
  amount: number,
): string[] {
  if (counterType !== "-1/-1" || amount <= 0) return [];
  return targetIds.filter((targetId) => {
    const target = findBattlefieldCard(game, targetId);
    if (!target?.kinds.includes("ECHO")) return false;
    return target.damageMarked >= getPowerEndurance(game, target).endurance - amount;
  });
}

function burnLethalTargetIds(game: GameState, targetIds: string[], amount: number): string[] {
  if (amount <= 0) return [];
  return targetIds.filter((targetId) => {
    const target = findBattlefieldCard(game, targetId);
    if (!target?.kinds.includes("ECHO")) return false;
    return target.damageMarked + amount >= getPowerEndurance(game, target).endurance;
  });
}

const staticAuraBeatHandler: HostBeatHandler = {
  id: "static-aura",
  claims: (event) => event.type === "STATIC_AURA_ONLINE",
  run: ({ event, sequenceId, resolve, done }) => {
    const affectedIds = Array.isArray(event.payload?.affectedIds) ? event.payload.affectedIds.map(String) : [];
    const auraKey = String(event.payload?.auraKey ?? "");
    const source = event.sourceId ? findBattlefieldCard(useGameStore.getState().game, event.sourceId) : undefined;
    if (!source || affectedIds.length === 0) {
      releaseStaticAura(auraKey);
      resolve();
      done();
      return;
    }
    useGameStore.setState({ hostAutoTriggerCount: 1 });
    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
      useToastStore.getState().pushToast({
        title: uiText("toast.hostEffect"),
        message: staticAuraBeatMessage(source, event),
        tone: "host",
      });
    }, STATIC_AURA_LEAD_IN_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("buff");
      // Same frame: the withheld stats land exactly as the buff lines rise.
      releaseStaticAura(auraKey);
      useGameStore.setState(startBuffBeat(affectedIds));
      resolve();
    }, STATIC_AURA_PULSE_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      done();
    }, STATIC_AURA_BEAT_MS);
  },
};

const hostGroupBuffBeatHandler: HostBeatHandler = {
  id: "host-group-buff",
  claims: (event) => event.type === "HOST_GROUP_BUFF",
  run: ({ event, sequenceId, resolve, done }) => {
    const game = useGameStore.getState().game;
    const fieldSource = event.sourceId
      ? game.host.field.find((card) => card.instanceId === event.sourceId)
      : undefined;
    const source = fieldSource ?? (event.sourceId
      ? game.host.memory.find((card) => card.instanceId === event.sourceId)
      : undefined);
    const affectedIds = Array.isArray(event.payload?.affectedIds) ? event.payload.affectedIds.map(String) : [];
    if (!source || affectedIds.length === 0) {
      resolve();
      done();
      return;
    }

    // A permanent's ETB presentation already supplied the activation pulse and toast before it
    // queued this event. Keep the stat change as its own beat, but land only the shared buff lines
    // so one effect never reads as the card activating twice.
    if (fieldSource) {
      useGameStore.setState({ hostAutoTriggerCount: 1 });
      window.setTimeout(() => {
        if (sequenceId !== hostAutoTriggerSequenceId) return;
        resolve();
        useAudioStore.getState().playSfx("buff");
        useGameStore.setState(startBuffBeat(affectedIds));
      }, 80);
      window.setTimeout(() => {
        if (sequenceId !== hostAutoTriggerSequenceId) return;
        done();
      }, BUFF_ANIMATION_MS);
      return;
    }

    // Spells have no Field slot to activate from, so they use the dedicated reveal card.
    useGameStore.setState({ hostSpellCard: source, hostAutoTriggerCount: 1 });
    useAudioStore.getState().playSfx("drawOne");

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
      useToastStore.getState().pushToast({
        title: uiText("toast.hostEffect"),
        message: queuedHostTriggerMessage(source),
        tone: "host",
      });
    }, SPELL_REVEAL_ENTER_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      resolve();
      useAudioStore.getState().playSfx("buff");
      useGameStore.setState(startBuffBeat(affectedIds));
    }, SPELL_REVEAL_BUFF_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useGameStore.setState({ hostSpellCard: undefined });
    }, SPELL_REVEAL_HOLD_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      done();
    }, SPELL_REVEAL_HOLD_MS + SPELL_REVEAL_EXIT_MS);
  },
};

// A card that triggers on its own death has no Field slot left to pulse, so present it
// beside its Memory first. Generic: any dies-trigger whose source already left play.
const deathRevealBeatHandler: HostBeatHandler = {
  id: "death-reveal",
  claims: (_event, sources, game) =>
    Boolean(sources[0] && !game.host.field.some((card) => card.instanceId === sources[0].instanceId)),
  run: ({ sources, sequenceId, resolve, done }) => {
    const source = sources[0];
    useGameStore.setState({ hostAutoTriggerCount: 1 });

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useGameStore.setState({ deathRevealCard: source });
      useAudioStore.getState().playSfx("activateEffect");
      useToastStore.getState().pushToast({
        title: uiText("toast.hostEffect"),
        message: queuedHostTriggerMessage(source),
        tone: "host",
      });
    }, DEATH_REVEAL_LEAD_IN_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS);

    // Strict order: reveal, activate, card leaves for Memory, and only THEN the effect
    // resolves. Resolving while the reveal is still on screen made whatever the effect puts on
    // the Field entry mid-animation and stutter it.
    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      useGameStore.setState({ deathRevealCard: undefined });
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS + DEATH_REVEAL_HOLD_MS);

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      resolve();
      done();
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS + DEATH_REVEAL_HOLD_MS + DEATH_REVEAL_EXIT_MS);
  },
};

const triggerPulseBeatHandler: HostBeatHandler = {
  id: "trigger-pulse",
  claims: (_event, sources) => sources.length > 0,
  run: ({ event, sources, sequenceId, resolve, done }) => {
    const activationAlreadyShown = event.payload?.causeSourceId === sources[0].instanceId;
    if (!activationAlreadyShown) {
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(sources[0].instanceId);
    }
    useToastStore.getState().pushToast({
      title: uiText("toast.hostEffect"),
      message: queuedHostTriggerMessage(sources[0]),
      tone: "host",
    });

    window.setTimeout(() => {
      if (sequenceId !== hostAutoTriggerSequenceId) return;
      resolve();
      window.setTimeout(() => done(), activationAlreadyShown ? 60 : 180);
    }, activationAlreadyShown ? 120 : HOST_ENTER_TRIGGER_RESOLVE_MS);
  },
};

const deferredCombatVolleyHandler: HostBeatHandler = {
  id: "deferred-combat-volley",
  claims: (event, sources) =>
    event.type === "ATTACK_DECLARED" &&
    Boolean(sources[0]?.effects.some((wrapper) =>
      wrapper.type === "TRIGGERED_ABILITY" &&
      wrapper.trigger === event.type &&
      isDeferredCombatVolleyEffect(wrapper.effect as EffectDefinition | undefined)
    )),
  run: ({ resolve, done }) => {
    // Capturing the eligible attackers is a bookkeeping step, not the visible activation.
    // The source gets its single pulse when the accumulated volley fires after the last attack.
    resolve();
    done();
  },
};

function isDeferredCombatVolleyEffect(effect?: EffectDefinition): boolean {
  if (!effect) return false;
  if (
    effect.type === "DAMAGE_OPPONENT_FOR_EACH_DECLARED_ATTACKER_MATCHING" &&
    effect.deferUntil === "HOST_ATTACK_SEQUENCE_END"
  ) {
    return true;
  }
  if (effect.type === "SEQUENCE" && Array.isArray(effect.effects)) {
    return effect.effects.some((item) => isDeferredCombatVolleyEffect(item as EffectDefinition));
  }
  if (effect.type === "CONDITIONAL") {
    return isDeferredCombatVolleyEffect(effect.effect as EffectDefinition | undefined);
  }
  return false;
}

// Order matters: the first handler that claims an event owns its presentation.
const HOST_BEAT_HANDLERS: HostBeatHandler[] = [
  burnBeatHandler,
  counterVolleyBeatHandler,
  burnVolleyBeatHandler,
  staticAuraBeatHandler,
  hostGroupBuffBeatHandler,
  deathRevealBeatHandler,
  deferredCombatVolleyHandler,
  triggerPulseBeatHandler,
];

function staticAuraBeatMessage(source: CardInstance, event: EventItem): string {
  const cardName = uiCardName(source);
  const count = Array.isArray(event.payload?.affectedIds) ? event.payload.affectedIds.length : 0;
  const keyword = typeof event.payload?.keyword === "string" ? event.payload.keyword : undefined;
  if (keyword) return uiText("toast.staticAuraTrait", { card: cardName, keyword: uiTraitLabel(keyword), count });
  const power = Number(event.payload?.power ?? 0);
  const endurance = Number(event.payload?.endurance ?? 0);
  return uiText("toast.staticAuraBuff", {
    card: cardName,
    bonus: `${power >= 0 ? "+" : ""}${power}/${endurance >= 0 ? "+" : ""}${endurance}`,
    count,
  });
}

function queuedHostTriggerMessage(source?: CardInstance): string {
  return uiText("toast.cardTrigger", { card: source ? uiCardName(source) : uiText("setup.hostSide") });
}

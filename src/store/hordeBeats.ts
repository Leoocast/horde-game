import type { CardInstance, EffectDefinition, EventItem, GameState } from "../engine/GameTypes";
import { beginHordeCombat, checkWinLoss, declareHordeAttackers } from "../engine/CombatResolver";
import {
  EFFECT_ANNOUNCEMENTS,
  effectNeedsManualTarget,
  pendingTriggerSources,
  resolveTriggeredEvent,
  runEnterBattlefieldTriggers,
} from "../engine/EffectResolver";
import { enqueue } from "../engine/EventQueue";
import { collectStaticAuras, heldAuraBonuses, newlyCoveredAuras, snapshotStaticAuras, type StaticAuraSnapshot } from "../engine/StaticAuras";
import { getPowerToughness } from "../engine/StaticEffects";
import { fireballCastSfx, fireballHitSfx, type SfxId } from "../audio/soundManifest";
import { useAudioStore } from "./useAudioStore";
import { useToastStore } from "./useToastStore";
import { useGameStore, type BurnAnimationTarget } from "./useGameStore";
import { hasQueuedPlayerTriggers, scheduleQueuedPlayerTriggers } from "./playerBeats";
import {
  BUFF_ANIMATION_MS,
  appendHordeMillAnimations,
  discardPauseInProgress,
  findBattlefieldCard,
  monsterSfx,
  notifyDiscardEffects,
  startBuffBeat,
  uiCardName,
  uiTraitLabel,
  uiText,
} from "./presentationEffects";

// Arrival orchestration now waits for every Horde entrance animation before presenting effects,
// so this is only a small readability gap rather than a second summon-length pause.
const HORDE_ENTER_TRIGGER_START_MS = 80;
const HORDE_ENTER_TRIGGER_RESOLVE_MS = 430;
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
// the queue for the full tail made a lord with a second ETB (Hobgoblin Bandit Lord) feel like it
// stalled every card behind it.
const STATIC_AURA_BEAT_MS = STATIC_AURA_PULSE_MS + 360;
// The reveal mounts on the same frame the combat impact commits and the row reflows; a short
// lead-in lets the board finish moving first. Kept tight — the whole beat has to read as a
// reaction to the death, not as a pause before one.
const DEATH_REVEAL_LEAD_IN_MS = 120;
// Matches the CSS entrance (.horde-death-reveal-enter), so the activation pulse fires the
// instant the card has settled rather than after a dead beat.
const DEATH_REVEAL_ENTER_MS = 280;
const DEATH_REVEAL_HOLD_MS = 300;
const DEATH_REVEAL_EXIT_MS = 380;
const SPELL_REVEAL_ENTER_MS = 280;
const SPELL_REVEAL_BUFF_MS = 680;
const SPELL_REVEAL_HOLD_MS = 1120;
const SPELL_REVEAL_EXIT_MS = 300;
// A card entering or leaving the battlefield re-centers the row, and Battlefield FLIP-animates
// that move over 360ms. A beat that changed the board waits it out, so the next attacker never
// charges across a row that is still sliding into place.
const BOARD_SETTLE_MS = 560;
const HORDE_ENTRY_WAIT_POLL_MS = 40;

let hordeAutoTriggerSequenceId = 0;
// Coverage of every Horde static ability as of the last announced beat. Diffed, not recomputed
// from scratch, so a lord only re-announces itself when it starts buffing someone new.
let hordeStaticAuraSnapshot: StaticAuraSnapshot = {};

/** The current sequence epoch. Scheduled callbacks capture it and bail when a reset bumped it. */
export function hordeSequenceEpoch(): number {
  return hordeAutoTriggerSequenceId;
}

/** Invalidates every scheduled Horde-sequence callback (game reset / new game). */
export function resetHordeSequence(): void {
  hordeAutoTriggerSequenceId += 1;
  hordeStaticAuraSnapshot = {};
}

export function hasEnterBattlefieldTrigger(card: CardInstance): boolean {
  return card.effects.some((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "ENTERS_BATTLEFIELD" && !effectNeedsManualTarget(effect.effect));
}

function hordeEnterTriggerMessage(card: CardInstance): string {
  const trigger = card.effects.find((effect) => effect.type === "TRIGGERED_ABILITY" && effect.trigger === "ENTERS_BATTLEFIELD");
  const effect = trigger?.effect as EffectDefinition | undefined;
  const cardName = uiCardName(card);
  const announcement = effect ? EFFECT_ANNOUNCEMENTS[String(effect.type)] : undefined;
  const count = Number(effect?.amount ?? 1);
  if (announcement === "createsTokens") return uiText("toast.cardCreatesTokens", { card: cardName, count });
  if (announcement === "mills") return uiText("toast.cardMills", { card: cardName, count });
  if (announcement === "discards") return uiText("toast.cardDiscards", { card: cardName, count });
  if (announcement === "lifeLoss") return uiText("toast.cardLifeLoss", { card: cardName, count });
  return uiText("toast.cardTrigger", { card: cardName });
}

export function scheduleHordeEnterTriggers(
  cards: CardInstance[],
  onComplete?: () => void,
  options: { activationAlreadyShownSourceIds?: string[] } = {},
): void {
  const sequenceId = ++hordeAutoTriggerSequenceId;
  const runNext = (index: number) => {
    if (sequenceId !== hordeAutoTriggerSequenceId) return;
    const card = cards[index];
    if (!card) {
      useGameStore.setState({ hordeAutoTriggerCount: 0 });
      onComplete?.();
      return;
    }
    const activationAlreadyShown = options.activationAlreadyShownSourceIds?.includes(card.instanceId) ?? false;
    // A static aura already announced and illuminated this source. Its second effect still gets
    // a distinct queued beat, but needs only a quick handoff rather than another summon-length
    // anticipation pause.
    const triggerStartMs = activationAlreadyShown ? 40 : HORDE_ENTER_TRIGGER_START_MS;
    const triggerResolveMs = activationAlreadyShown ? 80 : HORDE_ENTER_TRIGGER_RESOLVE_MS;
    const triggerHandoffMs = activationAlreadyShown ? 40 : 180;
    useGameStore.setState({ hordeAutoTriggerCount: 1 });
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      if (!activationAlreadyShown) {
        useAudioStore.getState().playSfx("activateEffect");
        useGameStore.getState().triggerEffectActivationPulse(card.instanceId);
      }
      useToastStore.getState().pushToast({
        title: uiText("toast.hordeEffect"),
        message: hordeEnterTriggerMessage(card),
        tone: "horde",
      });
    }, triggerStartMs);
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.setState((state) => {
        const previous = state.game;
        const next = structuredClone(previous) as GameState;
        const source = next.horde.field.find((item) => item.instanceId === card.instanceId);
        if (source) {
          runEnterBattlefieldTriggers(next, source);
        }
        notifyDiscardEffects(previous, next);
        return {
          game: next,
          hordeAutoTriggerCount: 1,
          hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
        };
      });
      // Enter triggers can create creatures (Beetleback Chief, Siege-Gang). Hold their aura
      // buffs in the same tick they appear, so they are never drawn already buffed either.
      captureStaticAuraBeats();
      window.setTimeout(() => {
        if (sequenceId === hordeAutoTriggerSequenceId) {
          scheduleQueuedHordeTriggers(() => runNext(index + 1));
        }
      }, triggerHandoffMs);
    }, triggerStartMs + triggerResolveMs);
  };
  runNext(0);
}

/** Resolves the presentation attached to a batch of newly revealed Horde cards. Static auras go
 * first; a card whose aura already supplied the activation pulse keeps its ETB as a separate beat
 * but does not glow or play the activation sound a second time. */
export function scheduleHordeArrivalEffects(cards: CardInstance[], onComplete?: () => void): void {
  const waitingSequenceId = hordeAutoTriggerSequenceId;
  if (useGameStore.getState().summoningAnimationCount > 0) {
    window.setTimeout(() => {
      if (waitingSequenceId === hordeAutoTriggerSequenceId) scheduleHordeArrivalEffects(cards, onComplete);
    }, HORDE_ENTRY_WAIT_POLL_MS);
    return;
  }
  const auraSourceIds = [
    ...new Set(useGameStore.getState().pendingStaticAuras.map((aura) => aura.sourceId)),
  ];
  const hasAuraBeats = useGameStore.getState().pendingStaticAuras.length > 0;
  flushStaticAuraBeats();
  const runEnterTriggers = () =>
    scheduleHordeEnterTriggers(cards, onComplete, { activationAlreadyShownSourceIds: auraSourceIds });
  if (hasAuraBeats) {
    scheduleQueuedHordeTriggers(runEnterTriggers);
    return;
  }
  runEnterTriggers();
}

export function startHordeCombatSequence(): void {
  if (useGameStore.getState().summoningAnimationCount > 0) {
    const waitingSequenceId = hordeAutoTriggerSequenceId;
    window.setTimeout(() => {
      if (waitingSequenceId === hordeAutoTriggerSequenceId) startHordeCombatSequence();
    }, HORDE_ENTRY_WAIT_POLL_MS);
    return;
  }
  captureStaticAuraBeats();
  flushStaticAuraBeats();
  const begun = beginHordeCombat(useGameStore.getState().game, { deferTriggeredEvents: true });
  useGameStore.setState({ game: begun });
  scheduleQueuedHordeTriggers(() => {
    const declared = declareHordeAttackers(useGameStore.getState().game, { deferTriggeredEvents: true });
    useGameStore.setState({ game: declared });
    // Attack triggers can add creatures (Krenko, General Kreat), so re-check aura coverage
    // once they settled instead of before they existed.
    scheduleQueuedHordeTriggers(() => {
      captureStaticAuraBeats();
      flushStaticAuraBeats();
      scheduleQueuedHordeTriggers();
    });
  });
}

// Static aura announcements are two-phase on purpose.
//
// Capture runs the moment the Horde's summons land: it records which auras started covering new
// creatures and holds their stat bonus back in `heldStaticAuraBonuses`, so those creatures are
// drawn UNBUFFED from the very frame they appear. Flush queues the beats afterwards, once the
// summon sequence is over. Without the split the creatures would render already buffed and the
// beat meant to explain the buff would have nothing left to show.
export function captureStaticAuraBeats(): void {
  const auras = collectStaticAuras(useGameStore.getState().game, "horde");
  const announced = newlyCoveredAuras(auras, hordeStaticAuraSnapshot);
  hordeStaticAuraSnapshot = snapshotStaticAuras(auras);
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
          toughness: aura.toughness,
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
// Horde presentation beats
//
// Every Horde reaction plays as one "beat": exactly one card acting at a time, board locked,
// engine state committed at the moment the animation says it lands. `scheduleQueuedHordeTriggers`
// walks `game.eventQueue` and hands the first claimed event to the handler that owns its look;
// the handler calls `done()` when its animation is over and the queue moves on.
//
// Adding a new Horde effect = push a handler here. The runner never learns a card name, and two
// effects reacting to the same death (Rundvelt + Pashalik) get one beat EACH instead of firing
// on top of each other, because a claimed event resolves one source per beat.
// ---------------------------------------------------------------------------

type HordeBeatContext = {
  event: EventItem;
  /** Horde-controlled sources of `event` that still owe a reaction; act on the first one. */
  sources: CardInstance[];
  sequenceId: number;
  /** Commits this beat's engine effect. Call once, at the moment the animation lands. Returns
   *  true when the battlefield changed, i.e. the row is about to reflow. */
  resolve: () => boolean;
  /** Hands control back to the queue so the next beat can start. */
  done: () => void;
};

type HordeBeatHandler = {
  id: string;
  /** Claiming parks the queue on this event so the beat plays before anything else resolves. */
  claims: (event: EventItem, sources: CardInstance[], game: GameState) => boolean;
  run: (context: HordeBeatContext) => void;
};

export function scheduleQueuedHordeTriggers(onComplete?: () => void): void {
  if (useGameStore.getState().summoningAnimationCount > 0) {
    const waitingSequenceId = hordeAutoTriggerSequenceId;
    window.setTimeout(() => {
      if (waitingSequenceId === hordeAutoTriggerSequenceId) scheduleQueuedHordeTriggers(onComplete);
    }, HORDE_ENTRY_WAIT_POLL_MS);
    return;
  }
  if (discardPauseInProgress(useGameStore.getState())) {
    window.setTimeout(() => scheduleQueuedHordeTriggers(onComplete), 120);
    return;
  }
  const sequenceId = hordeAutoTriggerSequenceId;
  let event: EventItem | undefined;
  let sources: CardInstance[] = [];
  let handler: HordeBeatHandler | undefined;

  useGameStore.setState((state) => {
    const previous = state.game;
    const next = structuredClone(previous) as GameState;
    while (next.eventQueue.length > 0) {
      const candidate = next.eventQueue[0];
      const pendingSources = pendingTriggerSources(next, candidate);
      const candidateSources = pendingSources.filter((source) => source.controller === "horde");
      const claimed = HORDE_BEAT_HANDLERS.find((item) => item.claims(candidate, candidateSources, next));
      if (claimed) {
        event = candidate;
        sources = candidateSources;
        handler = claimed;
        break;
      }
      // A shared queue can park a player reaction in front of Horde work during combat. Yield
      // without resolving it so the player beat can announce the source and land its animation.
      if (pendingSources.some((source) => source.controller === "player")) break;
      next.eventQueue.shift();
      resolveTriggeredEvent(next, candidate);
    }
    if (!event) checkWinLoss(next);
    return {
      game: next,
      hordeAutoTriggerCount: event ? 1 : 0,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
    };
  });

  const claimedEvent = event;
  const claimedHandler = handler;
  if (!claimedEvent || !claimedHandler) {
    if (hasQueuedPlayerTriggers(useGameStore.getState().game)) {
      scheduleQueuedPlayerTriggers(() => scheduleQueuedHordeTriggers(onComplete));
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
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      const settled = boardChangedAt === undefined ? BOARD_SETTLE_MS : performance.now() - boardChangedAt;
      const remaining = Math.max(0, BOARD_SETTLE_MS - settled);
      if (remaining === 0) {
        scheduleQueuedHordeTriggers(onComplete);
        return;
      }
      window.setTimeout(() => {
        if (sequenceId === hordeAutoTriggerSequenceId) scheduleQueuedHordeTriggers(onComplete);
      }, remaining);
    },
  });
}

// Commits one beat's engine effect. With `sourceId`, only that card's triggers resolve and the
// event stays queued for the remaining reactors; without it, the event is fully consumed.
// Reports whether the battlefield gained or lost a card, so the caller knows to wait for the
// row's reflow before starting the next beat.
function resolveBeatEvent(event: EventItem, sourceId?: string): boolean {
  let battlefieldChanged = false;
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
    // A beat finishes what it started before the queue moves on. Pashalik's trigger does not
    // deal damage directly, it queues a BURN_DAMAGE event; appended at the tail, that fireball
    // played AFTER Rundvelt's reveal had already resolved, so one card's effect was split in
    // half around another card's. Anything a beat spawned jumps ahead of the reactors still
    // waiting on the parent event.
    const spawned = next.eventQueue.filter((item) => !knownEventIds.has(item.id));
    if (spawned.length > 0) {
      next.eventQueue = [...spawned, ...next.eventQueue.filter((item) => knownEventIds.has(item.id))];
    }
    const summoned = next.horde.field.filter(
      (card) => !previous.horde.field.some((old) => old.instanceId === card.instanceId),
    );
    if (summoned[0]) useAudioStore.getState().playSfx(monsterSfx(summoned[0]));
    battlefieldChanged =
      next.horde.field.length !== previous.horde.field.length ||
      next.player.field.length !== previous.player.field.length;
    notifyDiscardEffects(previous, next);
    return {
      game: next,
      summoningAnimationCount: state.summoningAnimationCount + summoned.length,
      hordeMillAnimationQueue: appendHordeMillAnimations(state, previous, next),
    };
  });
  return battlefieldChanged;
}

function pickRandom(ids: SfxId[]): SfxId {
  return ids[Math.floor(Math.random() * ids.length)];
}

const burnBeatHandler: HordeBeatHandler = {
  id: "burn",
  claims: (event) => event.type === "BURN_DAMAGE",
  run: ({ event, sequenceId, resolve, done }) => {
    let committed = false;
    const commit = () => {
      if (committed || sequenceId !== hordeAutoTriggerSequenceId) return;
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
    useGameStore.setState({
      burnAnimation: { id: event.id, sourceId: event.sourceId, targetId, amount: Number(event.payload?.amount ?? 0) },
      burnImpactCardIds: [],
      hordeAutoTriggerCount: 1,
    });
    // No activation pulse here: the source already flashed gold on the beat that queued this
    // burn, and firing it twice for one effect reads as the card triggering again. It still
    // lunges — `.burn-source-casting` moves it without the gold.
    // The whoosh fires as the fireball ignites; a fresh voice each time so back-to-back burns
    // never loop the same clip.
    useAudioStore.getState().playSfx(pickRandom(fireballCastSfx));

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
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
      // Keep lethal targets on the battlefield through the same death fade used by
      // fight/destroy spells. Committing Burn immediately removed the DOM node before
      // the death class could render.
    }, BURN_IMPACT_MS);

    // Registered up front, before the animation-finish timer. If the browser throttles and
    // releases both timers in one batch, the event is still consumed before done() can let
    // the queue claim the same Burn again.
    window.setTimeout(commit, BURN_IMPACT_MS + SPECIAL_DEATH_ANIMATION_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      commit();
      // Leave hordeAutoTriggerCount alone: the runner sets it for the next beat, and clearing
      // it here would unblock the board for one frame between beats.
      useGameStore.setState({ burnAnimation: undefined, burnImpactCardId: undefined, burnImpactCardIds: [] });
      done();
    }, BURN_ANIMATION_MS);
  },
};

const burnVolleyBeatHandler: HordeBeatHandler = {
  id: "burn-volley",
  claims: (event) => event.type === "BURN_VOLLEY_DAMAGE" || event.type === "BURN_PLAYER_LIFE_LOSS",
  run: ({ event, sequenceId, resolve, done }) => {
    let committed = false;
    const commit = () => {
      if (committed || sequenceId !== hordeAutoTriggerSequenceId) return;
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
        variant: event.payload?.variant === "oil" ? "oil" : "fire",
      },
      hordeAutoTriggerCount: 1,
    });
    // The ETB beat already gave Chainwhirler its single gold activation. This follow-up owns
    // only the projectiles, with an individual cast and impact voice for every target.
    targets.forEach((_, projectileIndex) => {
      const projectileDelay = projectileIndex * BURN_PROJECTILE_GAP_MS;
      window.setTimeout(() => {
        if (sequenceId !== hordeAutoTriggerSequenceId) return;
        useAudioStore.getState().playSfx(pickRandom(fireballCastSfx));
      }, BURN_PROJECTILE_LAUNCH_MS + projectileDelay);

      window.setTimeout(() => {
        if (sequenceId !== hordeAutoTriggerSequenceId) return;
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
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
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

function burnLethalTargetIds(game: GameState, targetIds: string[], amount: number): string[] {
  if (amount <= 0) return [];
  return targetIds.filter((targetId) => {
    const target = findBattlefieldCard(game, targetId);
    if (!target?.cardTypes.includes("ECHO")) return false;
    return target.damageMarked + amount >= getPowerToughness(game, target).toughness;
  });
}

const staticAuraBeatHandler: HordeBeatHandler = {
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
    useGameStore.setState({ hordeAutoTriggerCount: 1 });
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
      useToastStore.getState().pushToast({
        title: uiText("toast.hordeEffect"),
        message: staticAuraBeatMessage(source, event),
        tone: "horde",
      });
    }, STATIC_AURA_LEAD_IN_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("buff");
      // Same frame: the withheld stats land exactly as the buff lines rise.
      releaseStaticAura(auraKey);
      useGameStore.setState(startBuffBeat(affectedIds));
      resolve();
    }, STATIC_AURA_PULSE_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      done();
    }, STATIC_AURA_BEAT_MS);
  },
};

const hordeGroupBuffBeatHandler: HordeBeatHandler = {
  id: "horde-group-buff",
  claims: (event) => event.type === "HORDE_GROUP_BUFF",
  run: ({ event, sequenceId, resolve, done }) => {
    const game = useGameStore.getState().game;
    const battlefieldSource = event.sourceId
      ? game.horde.field.find((card) => card.instanceId === event.sourceId)
      : undefined;
    const source = battlefieldSource ?? (event.sourceId
      ? game.horde.memory.find((card) => card.instanceId === event.sourceId)
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
    if (battlefieldSource) {
      useGameStore.setState({ hordeAutoTriggerCount: 1 });
      window.setTimeout(() => {
        if (sequenceId !== hordeAutoTriggerSequenceId) return;
        resolve();
        useAudioStore.getState().playSfx("buff");
        useGameStore.setState(startBuffBeat(affectedIds));
      }, 80);
      window.setTimeout(() => {
        if (sequenceId !== hordeAutoTriggerSequenceId) return;
        done();
      }, BUFF_ANIMATION_MS);
      return;
    }

    // Instants have no battlefield slot to activate from, so they use the dedicated reveal card.
    useGameStore.setState({ hordeSpellCard: source, hordeAutoTriggerCount: 1 });
    useAudioStore.getState().playSfx("drawOne");

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
      useToastStore.getState().pushToast({
        title: uiText("toast.hordeEffect"),
        message: queuedHordeTriggerMessage(source),
        tone: "horde",
      });
    }, SPELL_REVEAL_ENTER_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      resolve();
      useAudioStore.getState().playSfx("buff");
      useGameStore.setState(startBuffBeat(affectedIds));
    }, SPELL_REVEAL_BUFF_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.setState({ hordeSpellCard: undefined });
    }, SPELL_REVEAL_HOLD_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      done();
    }, SPELL_REVEAL_HOLD_MS + SPELL_REVEAL_EXIT_MS);
  },
};

// A card that triggers on its own death has no battlefield slot left to pulse, so present it
// beside its graveyard first. Generic: any dies-trigger whose source already left play.
const deathRevealBeatHandler: HordeBeatHandler = {
  id: "death-reveal",
  claims: (_event, sources, game) =>
    Boolean(sources[0] && !game.horde.field.some((card) => card.instanceId === sources[0].instanceId)),
  run: ({ sources, sequenceId, resolve, done }) => {
    const source = sources[0];
    useGameStore.setState({ hordeAutoTriggerCount: 1 });

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.setState({ deathRevealCard: source });
      useAudioStore.getState().playSfx("activateEffect");
      useToastStore.getState().pushToast({
        title: uiText("toast.hordeEffect"),
        message: queuedHordeTriggerMessage(source),
        tone: "horde",
      });
    }, DEATH_REVEAL_LEAD_IN_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.getState().triggerEffectActivationPulse(source.instanceId);
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS);

    // Strict order: reveal, activate, card leaves for the graveyard, and only THEN the effect
    // resolves. Resolving while the reveal is still on screen made whatever the effect puts on
    // the battlefield land mid-animation and stutter it.
    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      useGameStore.setState({ deathRevealCard: undefined });
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS + DEATH_REVEAL_HOLD_MS);

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      resolve();
      done();
    }, DEATH_REVEAL_LEAD_IN_MS + DEATH_REVEAL_ENTER_MS + DEATH_REVEAL_HOLD_MS + DEATH_REVEAL_EXIT_MS);
  },
};

const triggerPulseBeatHandler: HordeBeatHandler = {
  id: "trigger-pulse",
  claims: (_event, sources) => sources.length > 0,
  run: ({ event, sources, sequenceId, resolve, done }) => {
    const activationAlreadyShown = event.payload?.causeSourceId === sources[0].instanceId;
    if (!activationAlreadyShown) {
      useAudioStore.getState().playSfx("activateEffect");
      useGameStore.getState().triggerEffectActivationPulse(sources[0].instanceId);
    }
    useToastStore.getState().pushToast({
      title: uiText("toast.hordeEffect"),
      message: queuedHordeTriggerMessage(sources[0]),
      tone: "horde",
    });

    window.setTimeout(() => {
      if (sequenceId !== hordeAutoTriggerSequenceId) return;
      resolve();
      window.setTimeout(() => done(), activationAlreadyShown ? 60 : 180);
    }, activationAlreadyShown ? 120 : HORDE_ENTER_TRIGGER_RESOLVE_MS);
  },
};

const deferredCombatVolleyHandler: HordeBeatHandler = {
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
    effect.deferUntil === "HORDE_ATTACK_SEQUENCE_END"
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
const HORDE_BEAT_HANDLERS: HordeBeatHandler[] = [
  burnBeatHandler,
  burnVolleyBeatHandler,
  staticAuraBeatHandler,
  hordeGroupBuffBeatHandler,
  deathRevealBeatHandler,
  deferredCombatVolleyHandler,
  triggerPulseBeatHandler,
];

function staticAuraBeatMessage(source: CardInstance, event: EventItem): string {
  const cardName = uiCardName(source);
  const count = Array.isArray(event.payload?.affectedIds) ? event.payload.affectedIds.length : 0;
  const keyword = typeof event.payload?.keyword === "string" ? event.payload.keyword : undefined;
  if (keyword) return uiText("toast.staticAuraKeyword", { card: cardName, keyword: uiTraitLabel(keyword), count });
  const power = Number(event.payload?.power ?? 0);
  const toughness = Number(event.payload?.toughness ?? 0);
  return uiText("toast.staticAuraBuff", {
    card: cardName,
    bonus: `${power >= 0 ? "+" : ""}${power}/${toughness >= 0 ? "+" : ""}${toughness}`,
    count,
  });
}

function queuedHordeTriggerMessage(source?: CardInstance): string {
  return uiText("toast.cardTrigger", { card: source ? uiCardName(source) : uiText("setup.hordeSide") });
}

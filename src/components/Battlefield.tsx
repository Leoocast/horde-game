import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { activatedAbilityFailureReason } from "../engine/GameActions";
import { blockRestrictionReason, canAttack, canBlockAttacker, hasTrait } from "../engine/Traits";
import { findPermanent, targetCandidates, targetCandidatesWithSelectedTargets, targetRequirementIsBuff } from "../engine/Targeting";
import { manualInvokedTargetRequirement } from "../engine/EffectResolver";
import { getPowerEndurance } from "../engine/StaticEffects";
import { MAX_PLAYER_LANDS } from "../engine/GameRules";
import { STORED_ENERGY_CAP } from "../engine/EnergySystem";
import { useTranslation } from "../i18n/useTranslation";
import { translate } from "../i18n/translations";
import { canonicalizeRulesText } from "../i18n/rulesText";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useAudioStore } from "../store/useAudioStore";
import { useToastStore } from "../store/useToastStore";
import { cardThemeForDefinition, shouldShowFullCardImage } from "../utils/cardImages";
import { renderCardText } from "../utils/cardTextSymbols";
import { cardStatState } from "../utils/selectors";
import { HostAttackerMarker } from "./AttackChevronGlyph";
import { BuffSurgeAnimator } from "./BuffSurgeAnimator";
import { Card, CardDefenseBadge, CardTraitIconBadges } from "./Card";
import { GrowthBuffAnimator } from "./GrowthBuffAnimator";
import { StormBuffAnimator } from "./StormBuffAnimator";
import { HeavyCreatureLanding } from "./HeavyCreatureLanding";
import { readReserveTransferAnimation, ReserveTransferAnimator, type ReserveTransferAnimation } from "./ReserveTransferAnimator";
import { displayedReserveEnergy, reserveTransferPresentation } from "./reserveTransferPresentation";
import { GameTooltip } from "./GameTooltip";
import { Zone } from "./Zone";
import { Hourglass, Zap } from "lucide-react";
import {
  createBattlefieldArrivalRegistry,
  groupBattlefieldCopies,
  holdCombatCasualties,
  isFrontOfCardStack,
  isSwarmToken,
  unregisteredBattlefieldArrivals,
  visibleDefenseArrowLinks,
  type GroupMeta,
} from "./battlefieldLayout";
import { AnimatePresence, motion } from "framer-motion";
import { useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { guidedAnchorRegistry, guidedCardAnchorKey, guidedSurfaceAnchorKey } from "../guidance";

type Props = {
  game: GameState;
  side: Side;
  cards: CardInstance[];
  hiddenDefenseLinkIds: ReadonlySet<string>;
};

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];
const BLOCK_DRAG_THRESHOLD_PX = 9;
const PLAYER_ATTACK_DRAG_THRESHOLD_PX = 9;
const BATTLEFIELD_OVERFLOW_SAFE_INSET_PX = 132;
const BATTLEFIELD_OVERFLOW_HYSTERESIS_PX = 24;
// Feature flag: disable to show full creature cards whenever the row has enough room.
const ALWAYS_CROP_BATTLEFIELD_CREATURE_CARDS = true;
const HEAVY_MONO_GREEN_CREATURE_IDS = new Set([
  "echo_of_the_forgotten_city",
  "vaelor_emerald_guardian",
]);

type EnergyChangeSource = "card" | "land" | "turn";

type EnergyTrackTransition = {
  direction: "gain" | "spend";
  eventId: number;
  from: number;
  source: EnergyChangeSource;
  to: number;
};

type EnergyVisualSnapshot = {
  activeSide: Side;
  available: number;
  landCount: number;
  phase: GameState["phase"];
  pending: number;
  reserve: number;
  seed: string;
  stored: number;
  turnNumber: number;
};

type BattlefieldRowSurfaceProps = {
  cardsEmpty: boolean;
  compact?: boolean;
  cropCreatureCards: boolean;
  creatureRowRef: RefObject<HTMLDivElement | null>;
  dropTarget?: string;
  children: ReactNode;
  otherPermanents?: ReactNode;
  otherPermanentsTargetingActive?: boolean;
};

function BattlefieldRowSurface({
  cardsEmpty,
  compact = false,
  cropCreatureCards,
  creatureRowRef,
  dropTarget,
  children,
  otherPermanents,
  otherPermanentsTargetingActive = false,
}: BattlefieldRowSurfaceProps) {
  const t = useTranslation();
  return (
    <div data-battlefield-drop-target={dropTarget} className="old-panel-soft relative p-1.5">
      {cardsEmpty ? (
        <div aria-label={`${t("zones.field")}: 0`} className={["battlefield-row-surface", compact ? "battlefield-empty-compact" : "battlefield-empty"].join(" ")} />
      ) : (
        <div
          ref={creatureRowRef}
          data-battlefield-overflowing={cropCreatureCards ? "true" : undefined}
          className={[
            "battlefield-row-surface flex flex-wrap items-center justify-center gap-2",
            compact ? "battlefield-row-body-compact" : "battlefield-row-body",
            cropCreatureCards ? "battlefield-row-overflow" : "",
          ].join(" ")}
        >
          {children}
        </div>
      )}
      {otherPermanents !== undefined && (
        <div className={["other-permanents-dock", otherPermanentsTargetingActive ? "z-[96]" : "z-20"].join(" ")}>
          {otherPermanents}
        </div>
      )}
    </div>
  );
}

export function Battlefield({ game, side, cards, hiddenDefenseLinkIds }: Props) {
  const t = useTranslation();
  const seenCardIds = useRef<Set<string>>(new Set(cards.map((card) => card.instanceId)));
  // Cards already present when this Battlefield mounts belong to the loaded board, not to the
  // next arrival wave. Starting empty made the first Host summon replay every existing card's
  // entrance animation.
  const animatedHostIds = useRef<Set<string>>(createBattlefieldArrivalRegistry(cards));
  const entranceAnimatingIds = useRef<Set<string>>(new Set());
  const activeReflowAnimations = useRef<Map<string, Animation>>(new Map());
  const seenAutoPaidEvents = useRef<Set<number>>(new Set());
  const boardRef = useRef<HTMLDivElement>(null);
  const landDockRef = useRef<HTMLElement>(null);
  const creatureRowRef = useRef<HTMLDivElement>(null);
  const previousRects = useRef<Map<string, { left: number; top: number }>>(new Map());
  const reflowSampleFrame = useRef<number | undefined>(undefined);
  const previousHostEntrySignature = useRef(cards.map((card) => card.instanceId).join("|"));
  const previousPlayerAttackers = useRef<Set<string>>(new Set());
  const suppressNextSelectIds = useRef<Set<string>>(new Set());
  const battlefieldCardOrder = useRef<Map<string, number>>(new Map());
  const battlefieldFamilyOrder = useRef<Map<string, number>>(new Map());
  const swarmWaveByCardId = useRef<Map<string, number>>(new Map());
  const swarmWaveOrder = useRef<Map<number, number>>(new Map());
  const battlefieldGroupKeys = useRef<Map<string, string>>(new Map());
  const battlefieldGroupMeta = useRef<Map<string, GroupMeta>>(new Map());
  const combatCasualties = useRef<Map<string, CardInstance>>(new Map());
  const previousCards = useRef<CardInstance[]>(cards);
  const nextBattlefieldOrder = useRef(0);
  const nextSwarmWaveId = useRef(0);
  const currentSwarmEntryWaveId = useRef<number | undefined>(undefined);
  const currentSwarmEntryWaveTurn = useRef<number | undefined>(undefined);
  const [creatureRowOverflowing, setCreatureRowOverflowing] = useState(false);
  const [heavyLandingEvents, setHeavyLandingEvents] = useState<Record<string, number>>({});
  const nextHeavyLandingEventId = useRef(0);
  const visibleDefenseLinks = visibleDefenseArrowLinks(game, hiddenDefenseLinkIds);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHostCreatureId = useGameStore((state) => state.selectedHostCreatureId);
  const resolvingHostCombat = useGameStore((state) => state.resolvingHostCombat);
  const hostAutoTriggerCount = useGameStore((state) => state.hostAutoTriggerCount);
  const playerAutoTriggerCount = useGameStore((state) => state.playerAutoTriggerCount);
  const playerAttackAnimationId = useGameStore((state) => state.playerAttackAnimation?.attackerId);
  const hostAttackAnimationAttackerId = useGameStore((state) => state.hostAttackAnimation?.attackerId);
  const hostAttackAnimationBlockerId = useGameStore((state) => state.hostAttackAnimation?.blockerId);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const activatingEffectCardId = useGameStore((state) => state.activatingEffectCardId);
  // Split into primitive/stable selectors so mousemove-driven x/y updates on these
  // targeting states (see CounterTargetingOverlay/SpellTargetingOverlay/TributeOfTheFourSorrowsSelectionOverlay)
  // don't force a full Battlefield re-render on every pointer event.
  const counterTargetingActive = useGameStore((state) => Boolean(state.counterTargeting));
  const counterTargetingSourceId = useGameStore((state) => state.counterTargeting?.sourceId);
  const counterTargetingTargetId = useGameStore((state) => state.counterTargeting?.targetId);
  const tributeOfTheFourSorrowsSelectionActive = useGameStore((state) => Boolean(state.tributeOfTheFourSorrowsSelection));
  const tributeOfTheFourSorrowsSelectionKind = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.kind);
  const tributeOfTheFourSorrowsSelectionTargetId = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.targetId);
  const spellTargetingActive = useGameStore((state) => Boolean(state.spellTargeting));
  const spellTargetingHandId = useGameStore((state) => state.spellTargeting?.handId);
  const spellTargetingStepIndex = useGameStore((state) => state.spellTargeting?.stepIndex);
  const spellTargetingTargets = useGameStore((state) => state.spellTargeting?.targets);
  const buffAnimationCardIds = useGameStore((state) => state.buffAnimationCardIds);
  const buffAnimationEventId = useGameStore((state) => state.buffAnimationEventId);
  const buffAnimationVariant = useGameStore((state) => state.buffAnimationVariant);
  const burnSourceCardId = useGameStore((state) =>
    state.burnAnimation?.sourceMoves === false ? undefined : state.burnAnimation?.sourceId,
  );
  const burnImpactCardId = useGameStore((state) => state.burnImpactCardId);
  const burnImpactCardIds = useGameStore((state) => state.burnImpactCardIds);
  const burnImpactEventId = useGameStore((state) => state.burnImpactEventId);
  const pendingTriggeredEffectSourceId = useGameStore((state) => state.pendingTriggeredEffectSourceId);
  const hostCombatVisualDamage = useGameStore((state) => state.hostCombatVisualDamage);
  const hostCombatDeadCardIds = useGameStore((state) => state.hostCombatDeadCardIds);
  const specialDeadCardIds = useGameStore((state) => state.specialDeadCardIds);
  const autoPaidLandAnimation = useGameStore((state) => state.autoPaidLandAnimation);
  const counterTargetingSource = counterTargetingSourceId
    ? findPermanent(game, counterTargetingSourceId)
    : undefined;
  const counterTargetingRequirement = manualInvokedTargetRequirement(counterTargetingSource);
  const counterTargetCandidateIds = new Set(
    counterTargetingSource && counterTargetingRequirement
      ? targetCandidates(game, counterTargetingSource.controller, counterTargetingRequirement)
          .map((candidate) => candidate.instanceId)
      : [],
  );
  // Only the blocker id is used here; blockDrag.x/y update on every mousemove while
  // dragging and are consumed by CombatArrows, not here — same rationale as the
  // targeting selectors above.
  const blockDragActive = useGameStore((state) => Boolean(state.blockDrag));
  const blockDragBlockerId = useGameStore((state) => state.blockDrag?.blockerId);
  const selectPlayerCreature = useGameStore((state) => state.selectPlayerCreature);
  const selectHostCreature = useGameStore((state) => state.selectHostCreature);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const triggerEffectActivationPulse = useGameStore((state) => state.triggerEffectActivationPulse);
  const activateAbility = useGameStore((state) => state.activateAbility);
  const lockCounterTarget = useGameStore((state) => state.lockCounterTarget);
  const lockTributeOfTheFourSorrowsSelectionTarget = useGameStore((state) => state.lockTributeOfTheFourSorrowsSelectionTarget);
  const toggleAttacker = useGameStore((state) => state.toggleAttacker);
  const declareBlocker = useGameStore((state) => state.declareBlocker);
  const startBlockDrag = useGameStore((state) => state.startBlockDrag);
  const updateBlockDrag = useGameStore((state) => state.updateBlockDrag);
  const cancelBlockDrag = useGameStore((state) => state.cancelBlockDrag);
  const startPlayerAttackDrag = useGameStore((state) => state.startPlayerAttackDrag);
  const updatePlayerAttackDrag = useGameStore((state) => state.updatePlayerAttackDrag);
  const cancelPlayerAttackDrag = useGameStore((state) => state.cancelPlayerAttackDrag);
  const endSummoningAnimation = useGameStore((state) => state.endSummoningAnimation);

  // Combat casualties leave game state the instant their impact lands, so their triggers can
  // resolve in sequence. Removing them from the row right then would re-center every survivor
  // mid-sequence. Keep their slot as a dead-looking ghost until the whole sequence is over, then
  // let them all leave at once. This covers both animated Host combat and the Host's own
  // auto-triggers (e.g. Tribute of the Four Sorrows sacrificing its weakest creature), which also kill mid-sequence.
  const holdCasualties = resolvingHostCombat || hostAutoTriggerCount > 0 || playerAutoTriggerCount > 0;
  const displayedCards = holdCombatCasualties(cards, holdCasualties, combatCasualties, previousCards, battlefieldCardOrder);
  const casualtyIds = combatCasualties.current;
  const creatures = displayedCards.filter((card) => card.kinds.includes("ECHO"));
  const lands = displayedCards.filter((card) => card.kinds.includes("SOURCE"));
  const others = displayedCards.filter((card) => !card.kinds.includes("ECHO") && !card.kinds.includes("SOURCE"));
  const availableLandCount = lands.filter((card) => !card.exhausted && !card.activatedThisTurn).length;
  const storedEnergyCount = game.player.energyPool.stored;
  const pendingStoredEnergyCount = game.player.pendingStoredEnergy;
  const displayedReserveEnergyCount = displayedReserveEnergy({
    available: availableLandCount,
    pending: pendingStoredEnergyCount,
    stored: storedEnergyCount,
  });
  const previousEnergyVisual = useRef<EnergyVisualSnapshot | undefined>(undefined);
  const energyTransitionSequence = useRef(0);
  const reserveTransferSequence = useRef(0);
  const energyTransitionTimer = useRef<number | undefined>(undefined);
  const [energyTransitions, setEnergyTransitions] = useState<{
    normal?: EnergyTrackTransition;
    stored?: EnergyTrackTransition;
  }>({});
  const [reserveTransferAnimation, setReserveTransferAnimation] = useState<ReserveTransferAnimation | undefined>(undefined);
  const hostCombat = game.activeSide === "host" && game.phase === "combat" && game.combat.hostAttackers.length > 0;
  // The Host attacks with everything able, every turn. Declaring is a rules step that only runs
  // after summons and enter triggers, but the board should read as committed from the moment the
  // creatures land: they arrive already leaning with their attack chevron, and the effects then
  // play over a board that has stopped moving. Visual only — nothing here declares an attacker.
  const hostAttackPending =
    side === "host" &&
    game.activeSide === "host" &&
    (game.phase === "host" || game.phase === "combat") &&
    game.combat.hostAttackers.length === 0 &&
    !resolvingHostCombat &&
    !game.winner;
  const cropCreatureCards = ALWAYS_CROP_BATTLEFIELD_CREATURE_CARDS || creatureRowOverflowing;

  useLayoutEffect(() => {
    if (side !== "player") return;
    const current: EnergyVisualSnapshot = {
      activeSide: game.activeSide,
      available: availableLandCount,
      landCount: lands.length,
      phase: game.phase,
      pending: pendingStoredEnergyCount,
      reserve: displayedReserveEnergyCount,
      seed: game.seed,
      stored: storedEnergyCount,
      turnNumber: game.turnNumber,
    };
    const previous = previousEnergyVisual.current;
    previousEnergyVisual.current = current;

    if (!previous || previous.seed !== current.seed) {
      if (energyTransitionTimer.current) window.clearTimeout(energyTransitionTimer.current);
      setEnergyTransitions({});
      setReserveTransferAnimation(undefined);
      return;
    }

    const reserveTransfer = reserveTransferPresentation(previous, current);
    if (reserveTransfer) {
      setReserveTransferAnimation(readReserveTransferAnimation(++reserveTransferSequence.current, reserveTransfer));
    }

    const turnRefresh =
      current.turnNumber > previous.turnNumber ||
      (current.phase === "untap" && previous.phase !== "untap") ||
      (current.activeSide === "player" && previous.activeSide !== "player");
    const nextTransitions: { normal?: EnergyTrackTransition; stored?: EnergyTrackTransition } = {};

    if (current.available !== previous.available) {
      nextTransitions.normal = {
        direction: current.available > previous.available ? "gain" : "spend",
        eventId: ++energyTransitionSequence.current,
        from: previous.available,
        source: current.available > previous.available
          ? turnRefresh
            ? "turn"
            : current.landCount > previous.landCount
              ? "land"
              : "card"
          : "card",
        to: current.available,
      };
    }

    if (current.reserve !== previous.reserve && !reserveTransfer) {
      nextTransitions.stored = {
        direction: current.reserve > previous.reserve ? "gain" : "spend",
        eventId: ++energyTransitionSequence.current,
        from: previous.reserve,
        source: current.reserve > previous.reserve && turnRefresh ? "turn" : "card",
        to: current.reserve,
      };
    }

    if (!nextTransitions.normal && !nextTransitions.stored) return;
    if (energyTransitionTimer.current) window.clearTimeout(energyTransitionTimer.current);
    setEnergyTransitions(nextTransitions);
    energyTransitionTimer.current = window.setTimeout(() => {
      setEnergyTransitions({});
      energyTransitionTimer.current = undefined;
    }, 1400);
  }, [
    availableLandCount,
    game.activeSide,
    game.phase,
    game.player.pendingStoredEnergy,
    game.seed,
    game.turnNumber,
    lands.length,
    displayedReserveEnergyCount,
    side,
    storedEnergyCount,
  ]);

  useLayoutEffect(() => () => {
    if (energyTransitionTimer.current) window.clearTimeout(energyTransitionTimer.current);
  }, []);

  useLayoutEffect(() => {
    const row = creatureRowRef.current;
    if (!row) return;
    const observedRow = row;
    let frame = 0;

    function measureOverflow() {
      const styles = window.getComputedStyle(observedRow);
      const gap = Number.parseFloat(styles.columnGap) || 0;
      const stacks = Array.from(observedRow.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
      const requiredWidth = stacks.reduce((total, stack) => total + stack.getBoundingClientRect().width, 0) + Math.max(0, stacks.length - 1) * gap;
      const safeWidth = Math.max(0, observedRow.clientWidth - BATTLEFIELD_OVERFLOW_SAFE_INSET_PX * 2);

      setCreatureRowOverflowing((current) => {
        const threshold = current ? safeWidth - BATTLEFIELD_OVERFLOW_HYSTERESIS_PX : safeWidth;
        return requiredWidth > threshold;
      });
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measureOverflow);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(observedRow);
    for (const child of Array.from(observedRow.children)) observer.observe(child);
    scheduleMeasure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  });

  useLayoutEffect(() => {
    if (!autoPaidLandAnimation || seenAutoPaidEvents.current.has(autoPaidLandAnimation.eventId)) return;
    const root = boardRef.current;
    if (!root) return;

    seenAutoPaidEvents.current.add(autoPaidLandAnimation.eventId);
    for (const id of autoPaidLandAnimation.ids) {
      const slot = root.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`) ?? landDockRef.current?.querySelector<HTMLElement>(`[data-card-slot-id="${id}"]`);
      if (!slot) continue;
      const layer = document.createElement("span");
      layer.className = "auto-paid-animation-layer";
      layer.setAttribute("aria-hidden", "true");
      slot.appendChild(layer);
      layer.addEventListener("animationend", () => layer.remove(), { once: true });
    }
  }, [autoPaidLandAnimation]);

  useLayoutEffect(() => {
    const root = boardRef.current;
    if (!root) return;

    // If this render wraps the creature row from N lines to N+1 (or collapses it back),
    // let the existing cards' reflow-nudge settle before a newly-summoned card's entrance
    // animation plays, instead of both happening in the same frame. The measured outer
    // layout slot is not transformed by the entrance animation, which runs two layers in.
    const creatureLayoutElements = Array.from(creatureRowRef.current?.querySelectorAll<HTMLElement>("[data-card-layout-id]") ?? []);
    const previousCreatureTops: number[] = [];
    const nextCreatureTops: number[] = [];
    for (const element of creatureLayoutElements) {
      const id = element.dataset.cardLayoutId;
      if (!id) continue;
      nextCreatureTops.push(element.getBoundingClientRect().top);
      const previous = previousRects.current.get(id);
      if (previous) previousCreatureTops.push(previous.top);
    }
    const creatureRowCountIncreased = previousCreatureTops.length > 0 && countRowBands(nextCreatureTops) > countRowBands(previousCreatureTops);
    const rowShiftSettleDelay = creatureRowCountIncreased ? 0.26 : 0;

    if (side === "player") {
      const currentAttackers = new Set(game.combat.playerAttackers);
      for (const attackerId of currentAttackers) {
        if (previousPlayerAttackers.current.has(attackerId)) continue;
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${attackerId}"]`);
        if (visual) animateReadiedShift(visual, true);
      }
      for (const attackerId of previousPlayerAttackers.current) {
        if (currentAttackers.has(attackerId)) continue;
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${attackerId}"]`);
        if (visual) animateReadiedShift(visual, false);
      }
      previousPlayerAttackers.current = currentAttackers;
    }

    const currentHostEntrySignature = cards.map((card) => card.instanceId).join("|");
    if (side === "host" && currentHostEntrySignature !== previousHostEntrySignature.current) {
      for (const card of unregisteredBattlefieldArrivals(cards, animatedHostIds.current)) {
        const visual = root.querySelector<HTMLElement>(`[data-card-slot-id="${card.instanceId}"]`);
        if (!visual) continue;
        animatedHostIds.current.add(card.instanceId);
        seenCardIds.current.add(card.instanceId);
        entranceAnimatingIds.current.add(card.instanceId);
        visual.style.opacity = "0";
        visual.style.transform = "translateY(-46px) scale(1.55) rotate(-3deg)";
        visual.style.filter = "brightness(1.8) saturate(1.25)";
        const animation = visual.animate(
          [
            {
              opacity: 0,
              transform: "translateY(-46px) scale(1.55) rotate(-3deg)",
              filter: "brightness(1.8) saturate(1.25)",
            },
            {
              opacity: 1,
              transform: "translateY(0) scale(1) rotate(0)",
              filter: "brightness(1) saturate(1)",
            },
          ],
          {
            duration: 360,
            delay: (hostEntryDelay(card) + (card.kinds.includes("ECHO") ? rowShiftSettleDelay : 0)) * 1000,
            easing: "cubic-bezier(0.16, 1, 0.3, 1)",
            fill: "both",
          },
        );
        animation.onfinish = () => {
          visual.style.opacity = "";
          visual.style.transform = "";
          visual.style.filter = "";
          endSummoningAnimation();
          // fill:"both" is only needed through the entrance delay. Release the finished
          // WAAPI effect so later CSS effects (for example Aelyra's activation pulse)
          // can own transform/filter on this slot again.
          animation.cancel();
          entranceAnimatingIds.current.delete(card.instanceId);
        };
      }
    }
    if (side === "host") previousHostEntrySignature.current = currentHostEntrySignature;

    const summoningElements = [
      ...Array.from(root.querySelectorAll<HTMLElement>("[data-summoning='true']")),
      ...Array.from(landDockRef.current?.querySelectorAll<HTMLElement>("[data-summoning='true']") ?? []),
    ];
    for (const visual of summoningElements) {
      const id = visual.dataset.cardSlotId;
      const summonedCard = id ? cards.find((item) => item.instanceId === id) : undefined;
      const entranceExtraDelay = summonedCard?.kinds.includes("ECHO") ? rowShiftSettleDelay : 0;
      if (id) {
        seenCardIds.current.add(id);
        entranceAnimatingIds.current.add(id);
      }
      const animation = visual.animate(
        [
          {
            opacity: 0,
            transform: `translateY(${side === "host" ? "-46px" : "46px"}) scale(1.55) rotate(${side === "host" ? "-3deg" : "3deg"})`,
            filter: "brightness(1.8) saturate(1.25)",
          },
          {
            opacity: 1,
            transform: "translateY(0) scale(1) rotate(0)",
            filter: "brightness(1) saturate(1)",
          },
        ],
        {
          duration: 360,
          delay: (Number(visual.dataset.entryDelay ?? 0) + entranceExtraDelay) * 1000,
          easing: "cubic-bezier(0.16, 1, 0.3, 1)",
          // "both" keeps the card invisible through the delay (e.g. while the row it
          // just wrapped settles) instead of showing it statically before the entrance.
          fill: "both",
        },
      );
      if (
        side === "player" &&
        id &&
        summonedCard &&
        HEAVY_MONO_GREEN_CREATURE_IDS.has(summonedCard.definitionId)
      ) {
        const leadInMs =
          (Number(visual.dataset.entryDelay ?? 0) + entranceExtraDelay) * 1000 + 135;
        window.setTimeout(() => {
          if (!visual.isConnected || !entranceAnimatingIds.current.has(id)) return;
          nextHeavyLandingEventId.current += 1;
          const eventId = nextHeavyLandingEventId.current;
          setHeavyLandingEvents((current) => ({ ...current, [id]: eventId }));
        }, leadInMs);
      }
      animation.onfinish = () => {
        // Do not leave the final fill frame attached to this stable DOM node: a retained
        // WAAPI transform/filter outranks the CSS activation and targeting animations that
        // run immediately after an enters-the-battlefield trigger such as Aelyra.
        animation.cancel();
        if (side === "player") endSummoningAnimation();
        if (id) entranceAnimatingIds.current.delete(id);
      };
      visual.removeAttribute("data-summoning");
    }

    // Single owner of battlefield position changes: measure the stable outer layout slot,
    // then FLIP-animate a dedicated middle layer. The inner [data-card-slot-id] remains the
    // sole owner of summon/effect transforms and contains the buff particles, so neither
    // visual can be replaced or cancelled by the row reflow animation.
    // Sampled over a short window (not just once per render) because CSS margin transitions
    // can re-wrap the row a few frames AFTER the render that started them.
    const REFLOW_MIN_DELTA_PX = 4;
    const liveInstanceIds = new Set(cards.map((card) => card.instanceId));

    const observedRoot = root;
    function sampleReflow() {
      const seenIds = new Set<string>();
      for (const element of Array.from(observedRoot.querySelectorAll<HTMLElement>("[data-card-layout-id]"))) {
        const id = element.dataset.cardLayoutId;
        if (!id) continue;
        // Skip cards leaving the battlefield: popLayout keeps them in the DOM (often
        // position:absolute) while their exit animation runs, and their sampled position is
        // meaningless. Also skip cards still playing their entrance — they own their slot.
        if (!liveInstanceIds.has(id) || entranceAnimatingIds.current.has(id)) {
          seenIds.add(id);
          const current = element.getBoundingClientRect();
          previousRects.current.set(id, { left: current.left, top: current.top });
          continue;
        }
        seenIds.add(id);
        const current = element.getBoundingClientRect();
        const previous = previousRects.current.get(id);
        previousRects.current.set(id, current);
        if (!previous) continue;

        const deltaX = previous.left - current.left;
        const deltaY = previous.top - current.top;
        if (Math.abs(deltaX) < REFLOW_MIN_DELTA_PX && Math.abs(deltaY) < REFLOW_MIN_DELTA_PX) continue;

        const reflowLayer = element.querySelector<HTMLElement>("[data-card-reflow-id]");
        const slot = element.querySelector<HTMLElement>("[data-card-slot-id]");
        if (!reflowLayer || !slot || slot.style.visibility === "hidden") continue;
        // A card can get re-reflowed more than once in quick succession (each further
        // arrival in the same wave nudges it again). Cancel the previous reflow nudge
        // before layering a new one so they don't pile up additively and overshoot.
        activeReflowAnimations.current.get(id)?.cancel();
        const reflowAnimation = reflowLayer.animate([{ transform: `translate(${deltaX}px, ${deltaY}px)` }, { transform: "translate(0, 0)" }], {
          duration: 360,
          easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        });
        activeReflowAnimations.current.set(id, reflowAnimation);
        const clearReflowAnimation = () => {
          if (activeReflowAnimations.current.get(id) === reflowAnimation) activeReflowAnimations.current.delete(id);
        };
        reflowAnimation.onfinish = clearReflowAnimation;
        reflowAnimation.oncancel = clearReflowAnimation;
      }
      for (const id of Array.from(previousRects.current.keys())) {
        if (!seenIds.has(id)) previousRects.current.delete(id);
      }
    }

    const reflowWindowEnd = performance.now() + 450;
    function reflowSampleLoop() {
      sampleReflow();
      reflowSampleFrame.current = performance.now() < reflowWindowEnd ? window.requestAnimationFrame(reflowSampleLoop) : undefined;
    }
    sampleReflow();
    reflowSampleFrame.current = window.requestAnimationFrame(reflowSampleLoop);
    return () => {
      if (reflowSampleFrame.current !== undefined) window.cancelAnimationFrame(reflowSampleFrame.current);
    };
  });

  const otherPermanentsTargetingActive = others.some((card) => isSpellTargetable(card) || isSpellTargetLocked(card));

  return (
    <>
      <Zone title={`${side === "player" ? t("setup.playerSide") : t("setup.hostSide")} ${t("zones.field")}`} count={side === "player" ? creatures.length + others.length : cards.length} hideHeader>
        <div
          ref={(element) => {
            boardRef.current = element;
            guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey(side === "player" ? "player.field" : "host.field"),
              `battlefield:${side}:surface`,
              element,
            );
          }}
          className="battlefield-side-content"
        >
          <BattlefieldRowSurface
            cardsEmpty={creatures.length === 0}
            cropCreatureCards={cropCreatureCards}
            creatureRowRef={creatureRowRef}
            dropTarget={side === "host" ? "player-attack" : undefined}
            otherPermanents={others.length > 0 ? renderOtherPermanentStacks(others) : undefined}
            otherPermanentsTargetingActive={otherPermanentsTargetingActive}
          >
            {renderCardStacks(creatures, false, "creature")}
          </BattlefieldRowSurface>
        </div>
      </Zone>
      {side === "player" && createPortal(LandDock(), document.body)}
    </>
  );

  function LandDock() {
    const landCount = lands.length;
    const reserveSetupActive = game.gameMode !== "chaos" && game.setupTurnsRemaining > 0;
    const tributeOfTheFourSorrowsSourceSelectionActive = tributeOfTheFourSorrowsSelectionKind === "sacrifice-land";
    const tributeOfTheFourSorrowsSourceTarget = lands.find((card) => !card.exhausted && !card.activatedThisTurn) ?? lands[0];
    const canSelectEnergyCore = tributeOfTheFourSorrowsSourceSelectionActive && !tributeOfTheFourSorrowsSelectionTargetId && Boolean(tributeOfTheFourSorrowsSourceTarget);
    const availableEnergySlots = Array.from({ length: MAX_PLAYER_LANDS });
    const storedEnergySlots = Array.from({ length: STORED_ENERGY_CAP });

    return (
      <>
      <aside
        ref={(element) => {
          landDockRef.current = element;
        }}
        data-player-mana-core="true"
        data-tribute-of-the-four-sorrows-mana-target={tributeOfTheFourSorrowsSourceSelectionActive ? "true" : undefined}
        data-audio-click={canSelectEnergyCore ? "valid" : undefined}
        role={canSelectEnergyCore ? "button" : undefined}
        tabIndex={canSelectEnergyCore ? 0 : undefined}
        aria-label={`${t("game.availableEnergy")}: ${availableLandCount} of ${MAX_PLAYER_LANDS}. ${t("game.storedEnergy")}: ${displayedReserveEnergyCount} of ${STORED_ENERGY_CAP}.${reserveSetupActive
          ? ` ${t("game.reserveSetupTooltip")}`
          : ""}`}
        className={[
          "player-mana-core",
          "player-mana-corner",
          "game-hud-energy",
          game.activeSide === "player" ? "is-player-turn" : "",
          tributeOfTheFourSorrowsSourceSelectionActive ? "is-targeting" : "",
        ].join(" ")}
        onClick={() => {
          if (canSelectEnergyCore && tributeOfTheFourSorrowsSourceTarget) lockTributeOfTheFourSorrowsSelectionTarget(tributeOfTheFourSorrowsSourceTarget.instanceId);
        }}
        onKeyDown={(event) => {
          if (canSelectEnergyCore && tributeOfTheFourSorrowsSourceTarget && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            lockTributeOfTheFourSorrowsSelectionTarget(tributeOfTheFourSorrowsSourceTarget.instanceId);
          }
        }}
      >
        <div className="mana-corner-energy-layer" aria-hidden="true">
          <div
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("player.sources"),
              "battlefield:player:sources-visual",
              element,
            )}
            className="guided-player-sources-anchor"
          >
          <div
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("player.reserve"),
              "battlefield:player:reserve",
              element,
            )}
            className="mana-energy-track mana-energy-track-yellow"
            data-energy-track="stored"
          >
            {energyTransitions.stored && (
              <span
                key={`stored-wave-${energyTransitions.stored.eventId}`}
                className={`mana-energy-sweep energy-${energyTransitions.stored.direction} energy-source-${energyTransitions.stored.source}`}
              />
            )}
            {storedEnergySlots.map((_, index) => {
              const state = index < storedEnergyCount ? "is-ready" : "is-empty";
              const transition = energyTransitions.stored;
              const changing = energySlotIsChanging(transition, index);
              const transferTarget = Boolean(
                reserveTransferAnimation &&
                index >= reserveTransferAnimation.targetStartIndex &&
                index < reserveTransferAnimation.targetStartIndex + reserveTransferAnimation.amount,
              );
              return (
                <span
                  key={`stored-mana-${index}-${state}-${changing ? transition?.eventId : "stable"}`}
                  className={[
                    "mana-alchemy-socket",
                    "mana-alchemy-socket-yellow",
                    state,
                    transferTarget ? "is-reserve-transfer-target" : "",
                    changing && transition ? `is-energy-${transition.direction} energy-source-${transition.source}` : "",
                  ].join(" ")}
                  data-energy-kind="stored"
                  data-energy-index={index}
                  data-energy-state={state.replace("is-", "")}
                  style={changing && transition ? { "--energy-step": energyTransitionStep(transition, index) } as CSSProperties : undefined}
                >
                  <span className="mana-alchemy-orb"><span className="mana-alchemy-liquid" /></span>
                </span>
              );
            })}
          </div>
          <div
            className="mana-energy-track mana-energy-track-blue"
            data-energy-track="normal"
          >
            {energyTransitions.normal && (
              <span
                key={`normal-wave-${energyTransitions.normal.eventId}`}
                className={`mana-energy-sweep energy-${energyTransitions.normal.direction} energy-source-${energyTransitions.normal.source}`}
              />
            )}
            {availableEnergySlots.map((_, index) => {
              const state = index < availableLandCount ? "is-ready" : index < landCount ? "is-spent" : "is-empty";
              const transition = energyTransitions.normal;
              const changing = energySlotIsChanging(transition, index);
              const transferSource = Boolean(
                reserveTransferAnimation &&
                index >= reserveTransferAnimation.sourceStartIndex &&
                index < reserveTransferAnimation.sourceStartIndex + reserveTransferAnimation.amount,
              );
              return (
                <span
                  key={`normal-mana-${index}-${state}-${changing ? transition?.eventId : "stable"}`}
                  className={[
                    "mana-alchemy-socket",
                    "mana-alchemy-socket-blue",
                    state,
                    transferSource ? "is-reserve-transfer-source" : "",
                    changing && transition ? `is-energy-${transition.direction} energy-source-${transition.source}` : "",
                  ].join(" ")}
                  data-energy-kind="normal"
                  data-energy-index={index}
                  data-energy-state={state.replace("is-", "")}
                  style={changing && transition ? { "--energy-step": energyTransitionStep(transition, index) } as CSSProperties : undefined}
                >
                  <span className="mana-alchemy-orb"><span className="mana-alchemy-liquid" /></span>
                </span>
              );
            })}
          </div>
          </div>
        </div>
        {reserveSetupActive && (
          <GameTooltip
            content={t("game.reserveSetupTooltip")}
            className="mana-reserve-tooltip-host"
          >
            <span
              className="mana-reserve-tooltip-target"
              tabIndex={0}
              aria-label={t("game.reserveSetupTooltip")}
            />
          </GameTooltip>
        )}
        {tributeOfTheFourSorrowsSourceSelectionActive && <div className="mana-core-target-label">{t("target.discardEnergy")}</div>}
      </aside>
      {reserveTransferAnimation && (
        <ReserveTransferAnimator
          animation={reserveTransferAnimation}
          onComplete={() => setReserveTransferAnimation((current) => current?.id === reserveTransferAnimation.id ? undefined : current)}
        />
      )}
      </>
    );
  }

  function renderCardStacks(rowCards: CardInstance[], compact = false, keyPrefix = "card") {
    const activeCardIds = new Set(rowCards.map((card) => card.instanceId));
    const activeDefinitionIds = new Set(rowCards.map((card) => card.definitionId));
    for (const instanceId of battlefieldCardOrder.current.keys()) {
      if (!activeCardIds.has(instanceId)) battlefieldCardOrder.current.delete(instanceId);
    }
    for (const definitionId of battlefieldFamilyOrder.current.keys()) {
      if (!activeDefinitionIds.has(definitionId)) battlefieldFamilyOrder.current.delete(definitionId);
    }
    for (const instanceId of swarmWaveByCardId.current.keys()) {
      if (!activeCardIds.has(instanceId)) swarmWaveByCardId.current.delete(instanceId);
    }
    for (const instanceId of battlefieldGroupKeys.current.keys()) {
      if (!activeCardIds.has(instanceId)) battlefieldGroupKeys.current.delete(instanceId);
    }
    const activeSwarmWaveIds = new Set(swarmWaveByCardId.current.values());
    for (const waveId of swarmWaveOrder.current.keys()) {
      if (!activeSwarmWaveIds.has(waveId)) swarmWaveOrder.current.delete(waveId);
    }

    for (const card of rowCards) {
      if (!battlefieldCardOrder.current.has(card.instanceId)) {
        const entryOrder = nextBattlefieldOrder.current;
        battlefieldCardOrder.current.set(card.instanceId, entryOrder);
        nextBattlefieldOrder.current += 1;

        if (isSwarmToken(card)) {
          if (currentSwarmEntryWaveId.current === undefined || currentSwarmEntryWaveTurn.current !== game.turnNumber) {
            currentSwarmEntryWaveId.current = nextSwarmWaveId.current;
            nextSwarmWaveId.current += 1;
            currentSwarmEntryWaveTurn.current = game.turnNumber;
            swarmWaveOrder.current.set(currentSwarmEntryWaveId.current, entryOrder);
          }
          swarmWaveByCardId.current.set(card.instanceId, currentSwarmEntryWaveId.current);
        } else {
          currentSwarmEntryWaveId.current = undefined;
          currentSwarmEntryWaveTurn.current = undefined;
        }
      }
      if (!battlefieldFamilyOrder.current.has(card.definitionId)) {
        battlefieldFamilyOrder.current.set(card.definitionId, battlefieldCardOrder.current.get(card.instanceId) ?? 0);
      }
    }

    return groupBattlefieldCopies(
      game,
      rowCards,
      battlefieldCardOrder.current,
      battlefieldFamilyOrder.current,
      swarmWaveByCardId.current,
      swarmWaveOrder.current,
      pendingTriggeredEffectSourceId ? new Set([pendingTriggeredEffectSourceId]) : undefined,
      battlefieldGroupKeys.current,
      battlefieldGroupMeta.current,
      // Freeze grouping for the whole Host sequence — combat impacts AND trigger/aura beats.
      // The aura beat window (e.g. The Broken Headstone announcing Menace before attackers declare)
      // regrouped rows mid-turn when it sat outside the frozen span.
      holdCasualties,
    ).map((group) => (
      <div
        key={`${keyPrefix}-stack-${group.key}`}
        className={["battlefield-copy-stack", compact ? "battlefield-copy-stack-compact" : ""].join(" ")}
        data-stacked={group.cards.length > 1 ? "true" : undefined}
      >
        {/* A live card can move from one stat stack to another. Keeping an AnimatePresence
            inside each stack leaves an exiting duplicate behind while the same card's new
            reflow/buff animation is already running. The battlefield's FLIP layer owns that
            movement; death effects are staged before the card is removed from game state. */}
        {group.cards.map((card, stackIndex) => renderCard(card, compact, keyPrefix, stackIndex, group.cards.length))}
      </div>
    ));
  }

  function renderOtherPermanentStacks(permanents: CardInstance[]) {
    return permanents.map((card) => (
      <div
        key={`other-stack-${card.instanceId}`}
        className="battlefield-copy-stack battlefield-copy-stack-compact other-permanent-stack"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {renderCard(card, true, "other", 0)}
        </AnimatePresence>
      </div>
    ));
  }

  function renderCard(card: CardInstance, compact = false, keyPrefix = "card", stackIndex = 0, stackSize = 1) {
    const useNewSummoning = side !== "host";
    const newlyArrived = !seenCardIds.current.has(card.instanceId);
    const firstTimeOnThisBattlefield = useNewSummoning && newlyArrived;
    const buffAnimationActive = Boolean(buffAnimationEventId && buffAnimationCardIds.includes(card.instanceId));
    const isOtherPermanent = keyPrefix === "other";
    const selected = side === "player" ? selectedPlayerCreatureId === card.instanceId : selectedHostCreatureId === card.instanceId;
    const assignedAttackerId = findAssignedAttacker(card.instanceId);
    const blocking = Boolean(assignedAttackerId);
    const visibleAssignedAttackerId = visibleDefenseLinks.find(({ blockerId }) => blockerId === card.instanceId)?.attackerId;
    const blockerOrderLabel = visibleAssignedAttackerId ? getBlockerOrderLabel(card.instanceId, visibleAssignedAttackerId) : undefined;
    const attacking =
      game.combat.playerAttackers.includes(card.instanceId) ||
      game.combat.hostAttackers.includes(card.instanceId) ||
      (hostAttackPending && canAttack(game, card));
    const attackerColor = getAttackerColor(card.instanceId);
    const assignedColor = assignedAttackerId ? getAttackerColor(assignedAttackerId) : undefined;
    const blockersAssigned = visibleDefenseLinks.filter(({ attackerId }) => attackerId === card.instanceId).length;
    const selectedBlocker = selectedPlayerCreatureId ? game.player.field.find((item) => item.instanceId === selectedPlayerCreatureId) : undefined;
    const selectedBlockerAssigned = selectedBlocker ? Boolean(findAssignedAttacker(selectedBlocker.instanceId)) : false;
    const isLand = card.kinds.includes("SOURCE");
    const tributeOfTheFourSorrowsTargetable = Boolean(
      tributeOfTheFourSorrowsSelectionActive &&
        !tributeOfTheFourSorrowsSelectionTargetId &&
        side === "player" &&
        ((tributeOfTheFourSorrowsSelectionKind === "sacrifice-creature" && card.kinds.includes("ECHO")) ||
          (tributeOfTheFourSorrowsSelectionKind === "sacrifice-land" && card.kinds.includes("SOURCE"))),
    );
    const tributeOfTheFourSorrowsTargetLocked = tributeOfTheFourSorrowsSelectionTargetId === card.instanceId;
    const playerCombat = game.activeSide === "player" && game.phase === "combat";
    const selectedPlayerAttacker = game.combat.playerAttackers.includes(card.instanceId);
    const legalAttacker = Boolean(playerCombat && side === "player" && card.kinds.includes("ECHO") && (selectedPlayerAttacker || canAttack(game, card)));
    const attemptablePlayerAttacker = Boolean(playerCombat && side === "player" && card.kinds.includes("ECHO"));
    const availablePlayerAttacker = Boolean(playerCombat && side === "player" && card.kinds.includes("ECHO") && !selectedPlayerAttacker && canAttack(game, card));
    const legalBlocker = Boolean(
      hostCombat &&
        side === "player" &&
        card.kinds.includes("ECHO") &&
        !blocking &&
        game.combat.hostAttackers.some((attackerId) => {
          const attacker = game.host.field.find((item) => item.instanceId === attackerId);
          return attacker ? canBlockAttacker(game, card, attacker) : false;
        }),
    );
    const legalBlockTarget = Boolean(hostCombat && side === "host" && selectedBlocker && !selectedBlockerAssigned && game.combat.hostAttackers.includes(card.instanceId) && canBlockAttacker(game, selectedBlocker, card));
    const selectableBlocker = Boolean(hostCombat && side === "player" && card.kinds.includes("ECHO") && !card.exhausted);
    const attemptableBlockTarget = Boolean(
      hostCombat
        && side === "host"
        && selectedBlocker
        && !selectedBlockerAssigned
        && game.combat.hostAttackers.includes(card.instanceId),
    );
    const selectionDisabled =
      casualtyIds.has(card.instanceId) ||
      (isLand && !tributeOfTheFourSorrowsTargetable && !tributeOfTheFourSorrowsTargetLocked) ||
      (playerCombat && side === "player" && !attemptablePlayerAttacker) ||
      (playerCombat && side === "host") ||
      (hostCombat && side === "player" && !selectableBlocker) ||
      (hostCombat && side === "host" && !attemptableBlockTarget);
    const muted =
      (playerCombat && side === "player" && !legalAttacker && !selectedPlayerAttacker && !isLand) ||
      (playerCombat && side === "host") ||
      (hostCombat && side === "player" && card.kinds.includes("ECHO") && !selectableBlocker);
    const actionable = !resolvingHostCombat && (availablePlayerAttacker || legalBlockTarget || (legalBlocker && !selectedPlayerCreatureId));
    const primaryAbility = card.activatedAbilities[0];
    const effectAvailable = canUseActivatedAbility(card, primaryAbility);
    const showActivatedAbilityChrome = effectAvailable && !isLand;
    const effectActive = activeEffectCardId === card.instanceId;
    const effectClosing = closingEffectCardId === card.instanceId;
    const effectActivating = activatingEffectCardId === card.instanceId;
    const counterTargetable = Boolean(
      counterTargetingActive &&
      !counterTargetingTargetId &&
      counterTargetCandidateIds.has(card.instanceId)
    );
    const counterTargetLocked = counterTargetingTargetId === card.instanceId;
    const spellCard = spellTargetingActive ? game.player.hand.find((item) => item.instanceId === spellTargetingHandId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargetingStepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargetingActive && spellCard?.requiresTargets.every((req) => Boolean(spellTargetingTargets?.[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargetingTargets ?? {}) : [];
    const spellTargetable = isSpellTargetable(card);
    const spellTargetLocked = isSpellTargetLocked(card);
    const spellLockedReq = spellTargetingActive
      ? spellCard?.requiresTargets.find((req) => {
          const selectedTarget = spellTargetingTargets?.[req.id];
          return Array.isArray(selectedTarget) ? selectedTarget.includes(card.instanceId) : selectedTarget === card.instanceId;
        })
      : undefined;
    const spellTargetLockedIsBuff = Boolean(spellTargetLocked && spellCard && spellLockedReq && targetRequirementIsBuff(spellCard, spellLockedReq));
    const spellLockedFriendly = Boolean(spellTargetLocked && card.controller === "player");
    const spellBuffPreview = spellLockedFriendly && spellCard && spellTargetingTargets ? spellBuffedStats(game, card, spellCard, spellTargetingTargets) : undefined;
    const counterBuffPreview = counterTargetLocked ? counterBuffedStats(game, card) : undefined;
    // A ghost is a card already gone from game state whose slot is held until combat ends. It
    // must keep reading as dead even after hostCombatDeadCardIds is cleared for the next impact.
    const isCombatGhost = casualtyIds.has(card.instanceId);
    const visuallyDead = isCombatGhost || hostCombatDeadCardIds.includes(card.instanceId);
    const speciallyDead = specialDeadCardIds.includes(card.instanceId);
    const cardTargetable = counterTargetable || tributeOfTheFourSorrowsTargetable || spellTargetable;
    const cardActionable = actionable || cardTargetable;
    const isDraggedDefender = blockDragBlockerId === card.instanceId;
    const draggedDefender = blockDragActive ? game.player.field.find((item) => item.instanceId === blockDragBlockerId) : undefined;
    const dragDefenseTargetable = Boolean(
      blockDragActive &&
        draggedDefender &&
        side === "host" &&
        game.combat.hostAttackers.includes(card.instanceId) &&
        canBlockAttacker(game, draggedDefender, card),
    );
    const combatAvailabilityTone =
      isDraggedDefender || dragDefenseTargetable
        ? "defense"
        : playerCombat && availablePlayerAttacker
          ? "attack"
          : hostCombat && actionable
            ? "defense"
            : undefined;
    const showEffectAvailabilityBorder = Boolean(showActivatedAbilityChrome && !combatAvailabilityTone);
    const showActionGem =
      !counterTargetingActive &&
      !tributeOfTheFourSorrowsSelectionActive &&
      !spellTargetingActive &&
      !combatAvailabilityTone &&
      !showEffectAvailabilityBorder &&
      (blockDragActive ? false : cardActionable);
    const actionGemTone = isDraggedDefender || dragDefenseTargetable
      ? "card-defense-gem"
      : cardTargetable
      ? "card-target-gem"
      : playerCombat && actionable
        ? "card-attack-gem"
        : hostCombat && actionable
          ? "card-defense-gem"
          : showActivatedAbilityChrome && !cardActionable
            ? "card-effect-available-gem"
            : "";
    const interactionElevated = Boolean(
      effectActive ||
        effectClosing ||
        effectActivating ||
        counterTargetable ||
        counterTargetLocked ||
        tributeOfTheFourSorrowsTargetable ||
        tributeOfTheFourSorrowsTargetLocked ||
        spellTargetable ||
        spellTargetLocked,
    );
    const isFlying = card.kinds.includes("ECHO") && hasTrait(game, card, "FLYING");
    const combatAnimationActive =
      playerAttackAnimationId === card.instanceId ||
      hostAttackAnimationAttackerId === card.instanceId ||
      hostAttackAnimationBlockerId === card.instanceId;
    const flyingIdleActive = Boolean(
      isFlying &&
        !newlyArrived &&
        !combatAnimationActive &&
        !interactionElevated &&
        !visuallyDead &&
        !speciallyDead,
    );
    const heavyLandingEventId = heavyLandingEvents[card.instanceId];
    const defenseBadgeCount =
      side === "player" && blockerOrderLabel
        ? blockerOrderLabel
        : side === "host" && blockersAssigned > 0
          ? `${blockersAssigned}`
          : undefined;

    return (
      <motion.div
        key={`${keyPrefix}-${card.instanceId}`}
        data-card-layout-id={card.instanceId}
        initial={false}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0, y: side === "host" ? 28 : -28, scale: 0.78, rotate: side === "host" ? 3 : -3 }}
        transition={{
          opacity: { duration: 0.18, ease: "easeOut" },
          scale: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          y: { duration: 0.34, ease: [0.16, 1, 0.3, 1] },
          rotate: { duration: 0.28, ease: "easeOut" },
          filter: { duration: 0.36, ease: "easeOut" },
        }}
        className={[
          "battlefield-layout-slot",
          interactionElevated ? "battlefield-layout-slot-elevated" : "",
          card.exhausted || (attacking && side === "host") ? "battlefield-layout-slot-tapped" : "",
          card.kinds.includes("ECHO") ? "battlefield-layout-slot-creature-clearance" : "",
        ].join(" ")}
        style={{ "--copy-stack-index": stackIndex + 1 } as CSSProperties}
      >
      <div className="battlefield-card-reflow" data-card-reflow-id={card.instanceId}>
      <div
        ref={(element) => guidedAnchorRegistry.set(
          guidedCardAnchorKey(card.instanceId),
          `battlefield:${side}:${card.instanceId}`,
          element,
        )}
        data-card-slot-id={card.instanceId}
        data-summoning={useNewSummoning && firstTimeOnThisBattlefield ? "true" : undefined}
        data-entry-delay={0}
        style={isFlying ? flyingIdleVariables(card.instanceId) : undefined}
        className={[
          compact ? "battlefield-card-slot-compact" : "battlefield-card-slot",
          isFlying ? "battlefield-card-flying" : "",
          flyingIdleActive ? "battlefield-card-flying-idle" : "",
          isOtherPermanent ? "battlefield-other-permanent-slot" : "",
          isLand ? "battlefield-land-slot" : "",
          selected ? "battlefield-card-selected" : "",
          actionable && !combatAvailabilityTone ? "battlefield-card-actionable" : "",
          showActivatedAbilityChrome && !showEffectAvailabilityBorder && !actionable ? "battlefield-card-effect-available" : "",
          side === "player" && attacking ? "player-attacker-readied" : "",
          side === "host" && attacking ? "host-attacker-readied" : "",
          visuallyDead ? "combat-card-visually-dead" : "",
          speciallyDead ? "special-card-visually-dead" : "",
          effectActive ? "effect-card-lifted" : "",
          effectClosing ? "effect-card-closing" : "",
          effectActivating ? "effect-card-activating" : "",
          burnSourceCardId === card.instanceId ? "burn-source-casting" : "",
          counterTargetable ? "counter-targetable-card" : "",
          counterTargetLocked ? "counter-target-locked-card" : "",
          tributeOfTheFourSorrowsTargetable ? "counter-targetable-card" : "",
          tributeOfTheFourSorrowsTargetLocked ? "counter-target-locked-card" : "",
          spellTargetable ? "spell-targetable-card" : "",
          spellTargetLocked ? (spellTargetLockedIsBuff ? "spell-target-locked-card spell-target-locked-buff" : "spell-target-locked-card spell-target-locked-attack") : "",
        ].join(" ")}
      >
      {isFlying && <span className="battlefield-flight-shadow" aria-hidden="true" />}
      {isFlying && <span className="battlefield-flight-wisp" aria-hidden="true" />}
      <span className="battlefield-card-depth" aria-hidden="true" />
      {side === "host" && !compact && card.kinds.includes("ECHO") && <HostAttackerMarker />}
      {heavyLandingEventId && (
        <HeavyCreatureLanding
          key={`heavy-landing-${heavyLandingEventId}`}
          cardId={card.instanceId}
          eventId={heavyLandingEventId}
          onComplete={(cardId, eventId) => {
            setHeavyLandingEvents((current) => {
              if (current[cardId] !== eventId) return current;
              const next = { ...current };
              delete next[cardId];
              return next;
            });
          }}
        />
      )}
      {buffAnimationActive && (
        buffAnimationVariant === "default"
          ? (
              <BuffSurgeAnimator
                key={`buff-surge-${buffAnimationEventId}`}
                eventId={buffAnimationEventId!}
                palette="holy"
                seedKey={card.instanceId}
              />
            )
          : buffAnimationVariant === "storm-strong"
            ? (
                <>
                  <BuffSurgeAnimator
                    key={`storm-surge-${buffAnimationEventId}`}
                    eventId={buffAnimationEventId!}
                    palette="storm"
                    seedKey={card.instanceId}
                  />
                  <StormBuffAnimator
                    key={`storm-${buffAnimationEventId}`}
                    eventId={buffAnimationEventId!}
                    seedKey={card.instanceId}
                  />
                </>
              )
            : (
              <>
                <BuffSurgeAnimator
                  key={`growth-surge-${buffAnimationEventId}`}
                  eventId={buffAnimationEventId!}
                  palette="nature"
                  seedKey={card.instanceId}
                />
                <GrowthBuffAnimator
                  key={`growth-${buffAnimationEventId}`}
                  eventId={buffAnimationEventId!}
                  variant={buffAnimationVariant}
                />
              </>
              )
      )}
      {card.flags.burnSmoke && <span className="burn-card-scorch" aria-hidden="true" />}
      {card.flags.burnSmoke && <span className="burn-card-smoke" aria-hidden="true"><i /><i /><i /></span>}
      {(burnImpactCardId === card.instanceId || burnImpactCardIds.includes(card.instanceId)) && (
        <span key={`burn-${burnImpactEventId}`} className="burn-card-scorch-flash" aria-hidden="true" />
      )}
      {isOtherPermanent && newlyArrived && <span className="other-permanent-arrival-glow" aria-hidden="true" />}
      <Card
        game={game}
        card={card}
        compact={compact}
        cropTopHalf={isLand}
        useBattlefieldArt={!compact && card.kinds.includes("ECHO") && cropCreatureCards}
        preferNativeImageRendering={shouldShowFullCardImage(card.definitionId)}
        showCroppedTitle={!compact && card.kinds.includes("ECHO") && cropCreatureCards}
        selected={selected}
        attacking={attacking}
        blocking={blocking}
        glowBorderWidth={4}
        actionable={cardActionable && !combatAvailabilityTone}
        effectAvailable={showActivatedAbilityChrome && !showEffectAvailabilityBorder}
        accentColor={side === "player" && !hostCombat ? assignedColor ?? attackerColor : undefined}
        linkLabel={defenseBadgeCount}
        selectionDisabled={selectionDisabled}
        muted={muted}
        suppressContextMenu={effectActive || counterTargetingActive || spellTargetingActive || tributeOfTheFourSorrowsSelectionActive}
        suppressHoverOverlay={counterTargetingActive || spellTargetingActive || tributeOfTheFourSorrowsSelectionActive}
        visualDamageMarked={hostCombatVisualDamage?.[card.instanceId]}
        onPointerDown={(event) => {
          if (attemptablePlayerAttacker && side === "player" && event.button === 0) {
            beginPlayerAttackDrag(card.instanceId, event);
            return;
          }
          if (!selectableBlocker || event.button !== 0) return;
          beginBlockDrag(card.instanceId, event);
        }}
        onContextMenu={() => {
          if (!effectActive) return;
          selectActiveEffectCard(undefined);
        }}
        shouldSuppressClick={() => {
          if (!suppressNextSelectIds.current.has(card.instanceId)) return false;
          suppressNextSelectIds.current.delete(card.instanceId);
          return true;
        }}
        onSelect={() => {
          if (tributeOfTheFourSorrowsSelectionActive) {
            if (tributeOfTheFourSorrowsTargetable) lockTributeOfTheFourSorrowsSelectionTarget(card.instanceId);
            return;
          }
          if (counterTargetingActive) {
            if (counterTargetable) lockCounterTarget(card.instanceId);
            return;
          }
          if (side === "player") {
            if (isLand) return;
            if (!hostCombat && !playerCombat && effectAvailable) {
              selectActiveEffectCard(effectActive ? undefined : card.instanceId);
              selectPlayerCreature(undefined);
              return;
            }
            if (hostCombat) {
              if (assignedAttackerId) {
                declareBlocker(card.instanceId, assignedAttackerId);
                selectPlayerCreature(card.instanceId);
                return;
              }
              selectPlayerCreature(selected ? undefined : card.instanceId);
              return;
            }
            if (playerCombat) {
              toggleAttacker(card.instanceId);
              return;
            }
            selectPlayerCreature(card.instanceId);
          } else {
            if (hostCombat && selectedPlayerCreatureId && game.combat.hostAttackers.includes(card.instanceId)) {
              declareBlocker(selectedPlayerCreatureId, card.instanceId);
              selectPlayerCreature(undefined);
              return;
            }
            selectHostCreature(card.instanceId);
          }
        }}
      />
      {defenseBadgeCount && (
        <CardDefenseBadge
          count={defenseBadgeCount}
          variant={side === "host" ? "host" : "player"}
        />
      )}
      {!compact && card.kinds.includes("ECHO") && cropCreatureCards && isFrontOfCardStack(stackIndex, stackSize) && (
        <CardTraitIconBadges
          game={game}
          card={card}
          variant={side === "host" ? "host" : "player"}
        />
      )}
      {combatAvailabilityTone && (
        <>
          <span
            className={[
              "battlefield-combat-available-border",
              combatAvailabilityTone === "attack"
                ? "battlefield-combat-available-attack"
                : "battlefield-combat-available-defense",
            ].join(" ")}
            aria-hidden="true"
          />
          <span
            className={[
              "battlefield-available-pulse",
              combatAvailabilityTone === "attack"
                ? "battlefield-available-pulse-attack"
                : "battlefield-available-pulse-defense",
            ].join(" ")}
            aria-hidden="true"
          />
        </>
      )}
      {showEffectAvailabilityBorder && (
        <>
          <span
            className="battlefield-combat-available-border battlefield-effect-available-border"
            aria-hidden="true"
          />
          <span
            className="battlefield-available-pulse battlefield-available-pulse-effect"
            aria-hidden="true"
          />
        </>
      )}
      {showActionGem && (
        <span
          className={[
            "card-actionable-gem card-actionable-gem-outside",
            actionGemTone,
            dragDefenseTargetable ? "card-defense-gem-host-target" : "",
          ].join(" ")}
          aria-hidden="true"
        />
      )}
      {effectActive && primaryAbility && (
        <button
          aria-label={abilityButtonText(primaryAbility)}
          data-audio-click="off"
          data-guided-anchor-extension="true"
          className="effect-action-button"
          onClick={(event) => {
            event.stopPropagation();
            selectActiveEffectCard(undefined);
            window.setTimeout(() => {
              useAudioStore.getState().playSfx("activateEffect");
              triggerEffectActivationPulse(card.instanceId);
            }, 180);
            window.setTimeout(() => {
              if (primaryAbility.cost?.exhaust) {
                useAudioStore.getState().playSfx("playLand");
              }
              activateAbility(card.instanceId, primaryAbility.id);
            }, 620);
          }}
        >
          {primaryAbility.effect.type === "GAIN_ENERGY" ? (
            <span className="effect-action-mana-copy">
              <span className="effect-action-symbol effect-action-symbol-tap" title={t("card.exhaustAction")}>
                <Hourglass aria-hidden="true" />
              </span>
              <span className="effect-action-mana-colon" aria-hidden="true">:</span>
              <span className="effect-action-mana-label">{t("card.generateEnergy")}</span>
              <span className="effect-action-symbol effect-action-symbol-energy" title={t("card.energy")}>
                <Zap aria-hidden="true" />
              </span>
            </span>
          ) : (
            <span className="effect-action-copy">
              <strong>{renderCardText(abilityButtonText(primaryAbility))}</strong>
            </span>
          )}
        </button>
      )}
      {counterBuffPreview && <BuffStatPreview card={card} stats={counterBuffPreview} />}
      {spellBuffPreview && <BuffStatPreview card={card} stats={spellBuffPreview} />}
      </div>
      </div>
      </motion.div>
    );
  }

  function findAssignedAttacker(blockerId: string): string | undefined {
    return Object.entries(game.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
  }

  function isSpellTargetable(card: CardInstance): boolean {
    const spellCard = spellTargetingActive ? game.player.hand.find((item) => item.instanceId === spellTargetingHandId) : undefined;
    const spellReq = spellCard?.requiresTargets[spellTargetingStepIndex ?? 0];
    const spellTargetsComplete = Boolean(spellTargetingActive && spellCard?.requiresTargets.every((req) => Boolean(spellTargetingTargets?.[req.id])));
    const spellCandidates = spellReq ? targetCandidatesWithSelectedTargets(game, "player", spellReq, spellTargetingTargets ?? {}) : [];
    return Boolean(
      spellTargetingActive &&
        !spellTargetsComplete &&
        spellReq &&
        spellCandidates.some((candidate) => candidate.instanceId === card.instanceId) &&
        !Object.values(spellTargetingTargets ?? {}).includes(card.instanceId),
    );
  }

  function isSpellTargetLocked(card: CardInstance): boolean {
    return Boolean(spellTargetingActive && Object.values(spellTargetingTargets ?? {}).includes(card.instanceId));
  }

  function getBlockerOrderLabel(blockerId: string, attackerId: string): string | undefined {
    const orderedBlockers = game.combat.blockers[attackerId] ?? [];
    const orderIndex = orderedBlockers.indexOf(blockerId);
    return orderIndex >= 0 ? `${orderIndex + 1}` : undefined;
  }

  function getAttackerColor(attackerId: string): string | undefined {
    const index = game.combat.hostAttackers.indexOf(attackerId);
    if (index === -1) return undefined;
    return blockColors[index % blockColors.length];
  }

  function hostEntryDelay(card: CardInstance): number {
    const index = cards.findIndex((item) => item.instanceId === card.instanceId);
    return Math.max(index, 0) * 0.04;
  }

  function canUseActivatedAbility(card: CardInstance, ability: CardInstance["activatedAbilities"][number] | undefined): boolean {
    if (spellTargetingActive) return false;
    if (side !== "player") return false;
    return Boolean(ability && !activatedAbilityFailureReason(game, card, ability));
  }

  function beginBlockDrag(blockerId: string, event: PointerEvent<HTMLElement>): void {
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    function suppressNextClickSelection() {
      suppressNextSelectIds.current.add(blockerId);
      window.setTimeout(() => suppressNextSelectIds.current.delete(blockerId), 80);
    }

    function handlePointerMove(moveEvent: PointerEventEvent) {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragStarted && distance < BLOCK_DRAG_THRESHOLD_PX) return;
      if (!dragStarted) {
        dragStarted = true;
        startBlockDrag(blockerId, startX, startY);
      }
      updateBlockDrag(moveEvent.clientX, moveEvent.clientY);
    }

    function handlePointerUp(upEvent: PointerEventEvent) {
      if (dragStarted) {
        suppressNextClickSelection();
        const dropResult = findDropBlockTarget(upEvent.clientX, upEvent.clientY, blockerId);
        if (dropResult.attackerId && dropResult.reason) {
          useGameStore.getState().declareBlocker(blockerId, dropResult.attackerId);
          cancelBlockDrag();
        } else if (dropResult.attackerId) {
          const latest = useGameStore.getState().game;
          const currentAttackerId = Object.entries(latest.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
          if (currentAttackerId && currentAttackerId !== dropResult.attackerId) {
            useGameStore.getState().declareBlocker(blockerId, currentAttackerId);
          }
          useGameStore.getState().declareBlocker(blockerId, dropResult.attackerId);
          useGameStore.getState().selectPlayerCreature(undefined);
        } else {
          cancelBlockDrag();
        }
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }

  function beginPlayerAttackDrag(attackerId: string, event: PointerEvent<HTMLElement>): void {
    const startX = event.clientX;
    const startY = event.clientY;
    let dragStarted = false;

    function suppressNextClickSelection() {
      suppressNextSelectIds.current.add(attackerId);
      window.setTimeout(() => suppressNextSelectIds.current.delete(attackerId), 80);
    }

    function handlePointerMove(moveEvent: PointerEventEvent) {
      const distance = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);
      if (!dragStarted && distance < PLAYER_ATTACK_DRAG_THRESHOLD_PX) return;
      if (!dragStarted) {
        dragStarted = true;
        startPlayerAttackDrag(attackerId, startX, startY);
      }
      updatePlayerAttackDrag(moveEvent.clientX, moveEvent.clientY);
    }

    function handlePointerUp(upEvent: PointerEventEvent) {
      if (dragStarted) {
        suppressNextClickSelection();
        if (isPlayerAttackDropTarget(upEvent.clientX, upEvent.clientY)) {
          const latest = useGameStore.getState().game;
          const alreadyAttacking = latest.combat.playerAttackers.includes(attackerId);
          useGameStore.getState().cancelPlayerAttackDrag();
          if (!alreadyAttacking) useGameStore.getState().toggleAttacker(attackerId);
          else useGameStore.getState().cancelPlayerAttackDrag();
        } else {
          cancelPlayerAttackDrag();
        }
      }
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
  }
}

function flyingIdleVariables(instanceId: string): CSSProperties {
  let hash = 0;
  for (const character of instanceId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const duration = 3600 + (hash % 900);
  const delay = -(hash % duration);
  const drift = hash % 2 === 0 ? 1.5 : -1.5;
  return {
    "--flying-idle-duration": `${duration}ms`,
    "--flying-idle-delay": `${delay}ms`,
    "--flying-idle-drift": `${drift}px`,
  } as CSSProperties;
}

type BuffStatPreviewValue = {
  power: number;
  endurance: number;
};

function BuffStatPreview({ card, stats }: { card: CardInstance; stats: BuffStatPreviewValue }) {
  const theme = cardThemeForDefinition(card.definitionId);
  const language = useLanguageStore((state) => state.language);
  return (
    <span
      aria-label={language === "es" ? `${stats.power} de Fuerza, ${stats.endurance} de Aguante después de potenciar` : `${stats.power} Power, ${stats.endurance} Endurance after empowering`}
      className={[
        "counter-target-stat-preview",
        theme ? `card-theme-${theme}` : "",
      ].join(" ")}
    >
      <b>{stats.power}</b>
      <i aria-hidden="true">/</i>
      <b>{stats.endurance}</b>
    </span>
  );
}

function counterBuffedStats(game: GameState, card: CardInstance): BuffStatPreviewValue {
  const stats = getPowerEndurance(game, card);
  return { power: stats.power + 1, endurance: stats.endurance + 1 };
}

function spellBuffedStats(game: GameState, card: CardInstance, spell: CardInstance, targets: Record<string, string | string[]>): BuffStatPreviewValue | undefined {
  const stats = getPowerEndurance(game, card);
  let powerDelta = 0;
  let toughnessDelta = 0;

  function collect(effect: CardInstance["effects"][number]) {
    if (effect.type === "MODIFY_STATS" || effect.type === "PUMP" || effect.type === "PUMP_UNTIL_END_OF_TURN") {
      const targetRef = typeof effect.targetRef === "string" ? effect.targetRef : typeof effect.target === "string" ? effect.target : undefined;
      const selected = targetRef ? targets[targetRef] : undefined;
      const applies = Array.isArray(selected) ? selected.includes(card.instanceId) : selected === card.instanceId;
      if (applies) {
        powerDelta += Number(effect.power) || 0;
        toughnessDelta += Number(effect.endurance) || 0;
      }
    }
    if (Array.isArray(effect.effects)) {
      for (const nested of effect.effects) collect(nested as CardInstance["effects"][number]);
    }
  }

  for (const effect of spell.effects) collect(effect);
  if (powerDelta === 0 && toughnessDelta === 0) return undefined;
  return {
    power: stats.power + powerDelta,
    endurance: stats.endurance + toughnessDelta,
  };
}

function abilityButtonText(ability: CardInstance["activatedAbilities"][number]): string {
  const language = useLanguageStore.getState().language;
  if (ability.effect.type === "GAIN_ENERGY") {
    const amount = Number(ability.effect.amount ?? 1);
    return language === "es"
      ? `Agota: genera ${amount} de Energía.`
      : `Exhaust: Generate ${amount} Energy.`;
  }
  if (
    (ability.effect.type === "PUMP_UNTIL_END_OF_TURN" ||
      ability.effect.type === "PUMP_UNTIL_NEXT_PLAYER_TURN") &&
    ability.effect.target === "SELF"
  ) {
    const life = Number(ability.cost?.life ?? 0);
    const stats = `${Number(ability.effect.power ?? 0) >= 0 ? "+" : ""}${Number(ability.effect.power ?? 0)}/${Number(ability.effect.endurance ?? 0) >= 0 ? "+" : ""}${Number(ability.effect.endurance ?? 0)}`;
    const untilNextTurn = ability.effect.type === "PUMP_UNTIL_NEXT_PLAYER_TURN";
    return canonicalizeRulesText(language === "es"
      ? `${life > 0 ? `Paga ${life} vidas: ` : ""}${stats} ${untilNextTurn ? "hasta tu próximo turno" : "este turno"}.`
      : `${life > 0 ? `Pay ${life} life: ` : ""}${stats} ${untilNextTurn ? "until your next turn" : "this turn"}.`, language);
  }
  return String(ability.effect.type).replaceAll("_", " ");
}

type PointerEventEvent = globalThis.PointerEvent;

function findDropBlockTarget(x: number, y: number, blockerId: string): { attackerId?: string; reason?: string } {
  const latest = useGameStore.getState().game;
  const blocker = latest.player.field.find((card) => card.instanceId === blockerId);
  if (!blocker) return {};
  for (const element of document.elementsFromPoint(x, y)) {
    const cardElement = element.closest<HTMLElement>("[data-card-id]");
    const candidateId = cardElement?.dataset.cardId;
    if (!candidateId || !latest.combat.hostAttackers.includes(candidateId)) continue;
    const attacker = latest.host.field.find((card) => card.instanceId === candidateId);
    if (!attacker) continue;
    const reason = blockRestrictionReason(latest, blocker, attacker);
    // An invalid drop is still an attempted block. Keep the target so `declareBlocker` can
    // publish the typed denial consumed by contextual guidance (Flying, Furtive, etc.).
    return reason ? { attackerId: candidateId, reason } : { attackerId: candidateId };
  }
  return {};
}

function isPlayerAttackDropTarget(x: number, y: number): boolean {
  return document.elementsFromPoint(x, y).some((element) => Boolean(element.closest<HTMLElement>("[data-battlefield-drop-target='player-attack']")));
}

function animateReadiedShift(element: HTMLElement, forward: boolean): void {
  element.animate([{ top: forward ? "0px" : "-18px" }, { top: forward ? "-18px" : "0px" }], {
    duration: 220,
    easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
  });
}

// Groups vertical positions into row "bands" so the creature row's line count can be
// compared before/after a render (used to tell whether a summon just wrapped the row).
function countRowBands(tops: number[]): number {
  if (tops.length === 0) return 0;
  const sorted = [...tops].sort((a, b) => a - b);
  let bands = 1;
  let bandTop = sorted[0];
  for (const top of sorted.slice(1)) {
    if (top - bandTop > 16) {
      bands += 1;
      bandTop = top;
    }
  }
  return bands;
}

function energySlotIsChanging(transition: EnergyTrackTransition | undefined, index: number): boolean {
  if (!transition) return false;
  const lower = Math.min(transition.from, transition.to);
  const upper = Math.max(transition.from, transition.to);
  return index >= lower && index < upper;
}

function energyTransitionStep(transition: EnergyTrackTransition, index: number): number {
  return transition.direction === "gain" ? index - transition.from : transition.from - index - 1;
}

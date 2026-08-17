import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { UI_FEATURE_FLAGS } from "../config/featureFlags";
import { canPayLifeCost, lifeCostAmount } from "../engine/ActionCosts";
import { MAX_PLAYER_LANDS, canPlayerPutAnotherLand, canPlayerRecycleEnergy } from "../engine/GameRules";
import { canPayWithAutomaticEnergy, totalEnergyCost } from "../engine/EnergySystem";
import { hasValidTargetSequence } from "../engine/Targeting";
import { isQuickSpell } from "../engine/hostfallVocabulary";
import { useGameStore } from "../store/useGameStore";
import { useSourceActionUiStore } from "../store/useSourceActionUiStore";
import { useTranslation } from "../i18n/useTranslation";
import { useToastStore } from "../store/useToastStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import {
  HAND_CARD_DISPLAY_HEIGHT,
  HAND_CARD_DISPLAY_WIDTH,
  HAND_HOVER_CARD_DISPLAY_HEIGHT,
  HAND_HOVER_CARD_DISPLAY_WIDTH,
} from "./cardDisplayGeometry";
import { getHandCardPresentationState, handArchiveEntryOffset } from "./handCardPresentation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion, motionValue, type MotionValue, type PanInfo, type Variants } from "framer-motion";
import {
  guidedAnchorRegistry,
  guidedCardAnchorKey,
  guidedPresentationActivity,
  guidedSurfaceAnchorKey,
  type GuidedPresentationActivityToken,
} from "../guidance";

const DRAG_PLAY_SCREEN_RATIO = 0.7;
const ENERGY_RECYCLE_SCREEN_RATIO = 0.82;
const ENERGY_RECYCLE_MIN_HORIZONTAL_DRAG = 48;
const HAND_ENTRY_STAGGER = 0.07;
const HAND_BASE_OVERLAP_RATIO = 0.12;
type HandCardMotionContext = {
  entryOrder: number;
  stagger: boolean;
  fromArchive: boolean;
  entryOffset: { x: number; y: number };
};
const handCardMotion: Variants = {
  initial: (custom: HandCardMotionContext) => ({
    opacity: 0,
    x: custom.fromArchive ? custom.entryOffset.x : 260,
    y: custom.fromArchive ? custom.entryOffset.y : 18,
    rotate: custom.fromArchive ? -4 : 3,
    scale: custom.fromArchive ? 0.3 : 0.94,
  }),
  animate: (custom: HandCardMotionContext) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      opacity: { duration: 0.2, delay: custom.stagger ? custom.entryOrder * HAND_ENTRY_STAGGER : 0, ease: "easeOut" },
      x: { type: "spring" as const, stiffness: 460, damping: 36, mass: 0.68, delay: custom.stagger ? custom.entryOrder * HAND_ENTRY_STAGGER : 0 },
      y: { type: "spring" as const, stiffness: 460, damping: 36, mass: 0.68, delay: custom.stagger ? custom.entryOrder * HAND_ENTRY_STAGGER : 0 },
      rotate: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.6, delay: custom.stagger ? custom.entryOrder * HAND_ENTRY_STAGGER : 0 },
      scale: { type: "spring" as const, stiffness: 500, damping: 36, mass: 0.62, delay: custom.stagger ? custom.entryOrder * HAND_ENTRY_STAGGER : 0 },
    },
  }),
  exit: {
    opacity: 0,
    transition: { duration: 0.1, ease: "easeOut" },
  },
};

export function Hand({ game }: { game: GameState }) {
  const t = useTranslation();
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHostCreatureId = useGameStore((state) => state.selectedHostCreatureId);
  // Primitive/stable selectors: avoids re-rendering the whole hand on every mousemove
  // while a CounterTargetingOverlay/SpellTargetingOverlay/TributeOfTheFourSorrowsSelectionOverlay arrow
  // is tracking the pointer (those only mutate x/y on the underlying object).
  const counterTargetingActive = useGameStore((state) => Boolean(state.counterTargeting));
  const tributeOfTheFourSorrowsSelectionActive = useGameStore((state) => Boolean(state.tributeOfTheFourSorrowsSelection));
  const tributeOfTheFourSorrowsSelectionKind = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.kind);
  const tributeOfTheFourSorrowsSelectionTargetId = useGameStore((state) => state.tributeOfTheFourSorrowsSelection?.targetId);
  const spellTargetingActive = useGameStore((state) => Boolean(state.spellTargeting));
  const spellTargetingHandId = useGameStore((state) => state.spellTargeting?.handId);
  const spellFightAnimation = useGameStore((state) => state.spellFightAnimation);
  const pendingSpellHandId = useGameStore((state) => state.pendingSpellHandId);
  const energyFlowAnimating = useGameStore((state) => Boolean(state.energyFlowAnimation));
  const hostMillAnimating = useGameStore((state) => state.hostMillAnimationQueue.length > 0);
  const playerDiscardAnimating = useGameStore((state) => state.playerDiscardAnimationQueue.length > 0);
  const hostAttackAnimating = useGameStore((state) => Boolean(state.hostAttackAnimation) || state.resolvingHostCombat);
  const playerAttackAnimating = useGameStore((state) => Boolean(state.playerAttackAnimation));
  const lifePaymentAnimating = useGameStore((state) => Boolean(state.lifePaymentAnimation));
  const bloodPactAnimation = useGameStore((state) => state.bloodPactAnimation);
  const bloodPactAnimating = Boolean(bloodPactAnimation);
  const energyRecycleAnimation = useGameStore((state) => state.energyRecycleAnimation);
  const handLimitDiscardActive = useGameStore((state) => state.handLimitDiscardActive);
  const handLimitSelectionId = useGameStore((state) => state.handLimitSelectionId);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const playerAutoTriggerCount = useGameStore((state) => state.playerAutoTriggerCount);
  const unresolvedTriggerCount = pendingTriggeredEffectCount + playerAutoTriggerCount;
  const selectHand = useGameStore((state) => state.selectHand);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const startEnergyRecycle = useGameStore((state) => state.startEnergyRecycle);
  const setEnergyRecycleDragActive = useGameStore((state) => state.setEnergyRecycleDragActive);
  const startSpellTargeting = useGameStore((state) => state.startSpellTargeting);
  const lockTributeOfTheFourSorrowsSelectionTarget = useGameStore((state) => state.lockTributeOfTheFourSorrowsSelectionTarget);
  const selectHandLimitDiscard = useGameStore((state) => state.selectHandLimitDiscard);
  const pushToast = useToastStore((state) => state.pushToast);
  const setDraggingRecyclableSourceId = useSourceActionUiStore((state) => state.setDraggingRecyclableSourceId);
  const [hoveredHandId, setHoveredHandId] = useState<string | undefined>();
  const [suppressedClickId, setSuppressedClickId] = useState<string | undefined>();
  const [draggingCardId, setDraggingCardId] = useState<string | undefined>();
  const [energyRecycleHint, setEnergyRecycleHint] = useState<EnergyRecycleHint>();
  const handRegionRef = useRef<HTMLDivElement>(null);
  const handCardsRef = useRef<HTMLDivElement>(null);
  const innerCardRefs = useRef(new Map<string, HTMLDivElement>());
  const dragMotionValues = useRef(new Map<string, { x: MotionValue<number>; y: MotionValue<number> }>());
  const dragOriginCenters = useRef(new Map<string, { x: number; y: number }>());
  const dragStartPointers = useRef(new Map<string, { x: number; y: number }>());
  const [handStackMargin, setHandStackMargin] = useState(0);
  const initialHandIds = useRef(new Set(game.player.hand.map((card) => card.instanceId)));
  const hiddenBloodPactDrawIds = new Set(
    bloodPactAnimation && bloodPactAnimation.phase !== "consumed"
      ? bloodPactAnimation.drawnCardIds
      : [],
  );
  const visibleHand = game.player.hand.filter((card) => !hiddenBloodPactDrawIds.has(card.instanceId));
  const handSize = visibleHand.length;
  const handLayoutSignature = visibleHand.map((card) => card.instanceId).join("|");
  const previousVisibleHandIds = useRef(new Set(visibleHand.map((card) => card.instanceId)));
  const animatedHandIds = useRef(new Set<string>());
  const handEntryActivities = useRef(new Map<string, GuidedPresentationActivityToken>());
  const enteringHandIds = visibleHand
    .filter((card) => !previousVisibleHandIds.current.has(card.instanceId))
    .map((card) => card.instanceId);
  const enteringHandOrder = new Map(enteringHandIds.map((id, index) => [id, index]));

  useEffect(() => () => {
    setEnergyRecycleDragActive(false);
    setDraggingRecyclableSourceId(undefined);
    for (const token of handEntryActivities.current.values()) token.end();
    handEntryActivities.current.clear();
  }, [setDraggingRecyclableSourceId, setEnergyRecycleDragActive]);

  useLayoutEffect(() => {
    const visibleIds = new Set(visibleHand.map((card) => card.instanceId));
    for (const id of animatedHandIds.current) {
      if (visibleIds.has(id)) continue;
      animatedHandIds.current.delete(id);
      handEntryActivities.current.get(id)?.end();
      handEntryActivities.current.delete(id);
    }
    for (const id of visibleIds) {
      if (animatedHandIds.current.has(id)) continue;
      animatedHandIds.current.add(id);
      handEntryActivities.current.set(id, guidedPresentationActivity.begin("hand.entry", id));
    }
    previousVisibleHandIds.current = new Set(visibleHand.map((card) => card.instanceId));
  }, [handLayoutSignature]);

  function completeHandEntry(id: string) {
    handEntryActivities.current.get(id)?.end();
    handEntryActivities.current.delete(id);
  }

  useLayoutEffect(() => {
    const region = handRegionRef.current;
    const cards = handCardsRef.current;
    if (!region || !cards) return;
    const observedRegion = region;
    const observedCards = cards;
    let frame = 0;

    function measure() {
      const firstSlot = observedCards.querySelector<HTMLElement>(".hand-card-slot");
      if (!firstSlot || handSize <= 1) {
        setHandStackMargin(0);
        return;
      }
      const regionStyles = window.getComputedStyle(observedRegion);
      const horizontalPadding = (Number.parseFloat(regionStyles.paddingLeft) || 0) + (Number.parseFloat(regionStyles.paddingRight) || 0);
      const availableWidth = Math.max(0, observedRegion.clientWidth - horizontalPadding);
      // offsetWidth is stable while Framer Motion is translating/scaling the card.
      // getBoundingClientRect() includes those temporary transforms and could leave
      // the hand overlap calculated from an in-between animation frame.
      // Measuring the slot (not the inner .hand-card) also keeps this stable while
      // a card grows in real width/height on hover, since the slot never resizes.
      const cardWidth =
        Number.parseFloat(window.getComputedStyle(firstSlot).width) ||
        firstSlot.offsetWidth;
      const gap = Number.parseFloat(window.getComputedStyle(observedCards).columnGap) || 0;
      const naturalWidth = handSize * cardWidth + (handSize - 1) * gap;
      const requiredMargin = Math.min(0, (availableWidth - naturalWidth) / (handSize - 1));
      const baseOverlapMargin = -(cardWidth * HAND_BASE_OVERLAP_RATIO + gap);
      const minimumVisibleStrip = 28;
      const desiredMargin = Math.max(
        -(cardWidth - minimumVisibleStrip),
        Math.min(baseOverlapMargin, requiredMargin),
      );
      setHandStackMargin(Math.round(desiredMargin));
    }

    function scheduleMeasure() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }

    const observer = new ResizeObserver(scheduleMeasure);
    observer.observe(observedRegion);
    const firstSlot = observedCards.querySelector<HTMLElement>(".hand-card-slot");
    if (firstSlot) observer.observe(firstSlot);
    scheduleMeasure();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [handLayoutSignature, handSize]);

  function getDragMotionValues(cardId: string) {
    let entry = dragMotionValues.current.get(cardId);
    if (!entry) {
      entry = { x: motionValue(0), y: motionValue(0) };
      dragMotionValues.current.set(cardId, entry);
    }
    return entry;
  }

  function beginCenterGrabDrag(cardId: string, pointerX: number, pointerY: number) {
    // Measure the inner .hand-card (not the fixed-size outer slot): it reflects
    // the card's true rendered size, including the hover/held grow-in-place.
    const el = innerCardRefs.current.get(cardId);
    if (!el) return;
    const visualCard = el.querySelector<HTMLElement>(".hand-card-face-scale") ?? el;
    const rect = visualCard.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    dragOriginCenters.current.set(cardId, center);
    dragStartPointers.current.set(cardId, { x: pointerX, y: pointerY });
    const { x, y } = getDragMotionValues(cardId);
    x.set(pointerX - center.x);
    y.set(pointerY - center.y);
  }

  function updateCenterGrabDrag(cardId: string, pointerX: number, pointerY: number) {
    const center = dragOriginCenters.current.get(cardId);
    if (!center) return;
    const { x, y } = getDragMotionValues(cardId);
    x.set(pointerX - center.x);
    y.set(pointerY - center.y);
  }

  function updateCardDrag(card: CardInstance, pointerX: number, pointerY: number) {
    updateCenterGrabDrag(card.instanceId, pointerX, pointerY);
    const inRecycleZone = isInEnergyRecycleZone(card, pointerX, pointerY);
    setEnergyRecycleHint(inRecycleZone
      ? { pointer: { x: pointerX, y: pointerY }, target: readEnergyRecycleTarget() }
      : undefined);
    setEnergyRecycleDragActive(inRecycleZone);
  }

  function isInEnergyRecycleZone(card: CardInstance, pointerX: number, pointerY: number): boolean {
    const dragStart = dragStartPointers.current.get(card.instanceId);
    return (
      card.kinds.includes("SOURCE") &&
      isEnergyRecyclable(game, card, unresolvedTriggerCount) &&
      pointerY <= window.innerHeight * DRAG_PLAY_SCREEN_RATIO &&
      pointerX >= window.innerWidth * ENERGY_RECYCLE_SCREEN_RATIO &&
      Boolean(dragStart && pointerX - dragStart.x >= ENERGY_RECYCLE_MIN_HORIZONTAL_DRAG)
    );
  }

  function playCard(card: CardInstance) {
    if (!card.kinds.includes("SOURCE") && card.requiresTargets.length > 0) {
      startSpellTargeting(card.instanceId, window.innerWidth * 0.5, window.innerHeight * 0.5);
      return;
    }
    concealCommittedHandCard(card.instanceId);
    playFromHand(card, castCard, playLand, selectedPlayerCreatureId, selectedHostCreatureId);
    restoreHandCardIfCommitFailed(card.instanceId);
  }

  function concealCommittedHandCard(cardId: string) {
    const element = innerCardRefs.current.get(cardId);
    if (element) element.style.visibility = "hidden";
  }

  function restoreHandCardIfCommitFailed(cardId: string) {
    window.requestAnimationFrame(() => {
      if (!useGameStore.getState().game.player.hand.some((card) => card.instanceId === cardId)) return;
      const element = innerCardRefs.current.get(cardId);
      if (element) element.style.visibility = "";
    });
  }

  function finishDrag(card: CardInstance, playable: boolean, info: PanInfo) {
    setSuppressedClickId(card.instanceId);
    window.setTimeout(() => setSuppressedClickId((current) => (current === card.instanceId ? undefined : current)), 240);
    setHoveredCardId(undefined);
    setHoveredHandId(undefined);
    setFocusedCardId(undefined);
    selectHand(undefined);
    setDraggingCardId(undefined);
    setEnergyRecycleHint(undefined);
    setEnergyRecycleDragActive(false);
    const releasedInRecycleZone = isInEnergyRecycleZone(card, info.point.x, info.point.y);
    setDraggingRecyclableSourceId(undefined);
    dragOriginCenters.current.delete(card.instanceId);
    dragStartPointers.current.delete(card.instanceId);
    const playZoneY = window.innerHeight * DRAG_PLAY_SCREEN_RATIO;
    const releasedInPlayZone = info.point.y <= playZoneY;
    if (releasedInRecycleZone) {
      concealCommittedHandCard(card.instanceId);
      startEnergyRecycle(card.instanceId, { x: info.point.x, y: info.point.y });
      window.requestAnimationFrame(() => {
        const element = innerCardRefs.current.get(card.instanceId);
        if (element) element.style.visibility = "";
      });
      return;
    }
    const shouldPlay = releasedInPlayZone && playable;
    if (shouldPlay) {
      playCard(card);
      return;
    }
    if (releasedInPlayZone && !playable) {
      // Sources rejected by a known rule still cross the engine/store boundary. Contextual help
      // needs the typed reason (especially the four-Source limit) instead of an inert disabled UI.
      if (card.kinds.includes("SOURCE")) {
        playLand(card.instanceId);
        return;
      }
      pushToast({
        title: t("error.cannotPlay"),
        message: getUnplayableReason(game, card, unresolvedTriggerCount, t),
        tone: "warning",
      });
    }
  }

  const tribute_of_the_four_sorrowsDiscardMode = tributeOfTheFourSorrowsSelectionKind === "discard";
  const handInteractionBlocked = Boolean(
    counterTargetingActive ||
      spellTargetingActive ||
      spellFightAnimation ||
      pendingSpellHandId ||
      hostMillAnimating ||
      playerDiscardAnimating ||
      hostAttackAnimating ||
      playerAttackAnimating ||
      lifePaymentAnimating ||
      bloodPactAnimating ||
      energyRecycleAnimation ||
      energyFlowAnimating ||
      unresolvedTriggerCount > 0 ||
      (tributeOfTheFourSorrowsSelectionActive && !tribute_of_the_four_sorrowsDiscardMode),
  );
  const hoverSuppressed = false;

  function handleHandPointerMove(event: React.MouseEvent<HTMLDivElement>) {
    if (handInteractionBlocked || hoverSuppressed || draggingCardId) return;
    const container = handCardsRef.current;
    if (!container) return;
    const cardEls = container.querySelectorAll<HTMLElement>("[data-hand-card-id]");
    if (cardEls.length === 0) return;
    let nearestId: string | undefined;
    let nearestDistance = Infinity;
    cardEls.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const distance = Math.abs(event.clientX - centerX);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestId = el.dataset.handCardId;
      }
    });
    if (nearestId && hoveredHandId !== nearestId) setHoveredHandId(nearestId);
  }

  function handleHandPointerLeave() {
    setHoveredHandId(undefined);
  }

  const handEntryGeometry = readHandEntryGeometry(handRegionRef.current, handCardsRef.current);

  return (
    <>
      {energyRecycleHint && <EnergyRecycleDragHint hint={energyRecycleHint} recycleLabel={t("hand.recycle")} hintLabel={t("hand.recycleHint")} />}
      <div className="hand-atmosphere-shell pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-64 overflow-hidden">
        <div className="hand-atmosphere absolute inset-0" />
      </div>
      <section className={[
        "player-hand-shell pointer-events-none fixed inset-x-0 bottom-0 h-56 overflow-visible",
        draggingCardId ? "z-[150]" : tribute_of_the_four_sorrowsDiscardMode || handLimitDiscardActive ? "z-[110]" : "z-[70]",
      ].join(" ")}>
        <div
          ref={(element) => {
            handRegionRef.current = element;
            guidedAnchorRegistry.set(guidedSurfaceAnchorKey("player.hand"), "hand:surface", element);
          }}
          className={[handInteractionBlocked ? "pointer-events-none" : "pointer-events-auto", "player-hand-region absolute bottom-0 flex h-56 items-end justify-center overflow-visible"].join(" ")}
        >
          <div
            ref={handCardsRef}
            className="player-hand-cards flex items-end justify-center overflow-visible"
            style={{
              "--hand-count": Math.max(handSize, 1),
              "--hand-stack-margin": `${handStackMargin}px`,
              "--hand-card-width": `${HAND_CARD_DISPLAY_WIDTH}px`,
              "--hand-card-height": `${HAND_CARD_DISPLAY_HEIGHT}px`,
              "--hand-card-held-width": `${HAND_HOVER_CARD_DISPLAY_WIDTH}px`,
              "--hand-card-held-height": `${HAND_HOVER_CARD_DISPLAY_HEIGHT}px`,
            } as React.CSSProperties}
            onMouseMove={handleHandPointerMove}
            onMouseLeave={handleHandPointerLeave}
          >
            <AnimatePresence mode="popLayout">
              {visibleHand.map((card, index) => {
            const playable = isPlayableFromHand(game, card, unresolvedTriggerCount);
            const energyRecyclable = isEnergyRecyclable(game, card, unresolvedTriggerCount);
            const discardTargetable = tributeOfTheFourSorrowsSelectionKind === "discard" && !tributeOfTheFourSorrowsSelectionTargetId;
            const discardTargetLocked = tributeOfTheFourSorrowsSelectionKind === "discard" && tributeOfTheFourSorrowsSelectionTargetId === card.instanceId;
            const handLimitTargetable = handLimitDiscardActive && !handLimitSelectionId;
            const handLimitTargetLocked = handLimitDiscardActive && handLimitSelectionId === card.instanceId;
            const cardAvailable =
              !handLimitDiscardActive &&
              !tributeOfTheFourSorrowsSelectionActive &&
              (playable || energyRecyclable);
            const cardActionable = handLimitDiscardActive ? handLimitTargetable : tributeOfTheFourSorrowsSelectionActive ? discardTargetable : cardAvailable;
            const cardTargetable = Boolean(handLimitTargetable || (tributeOfTheFourSorrowsSelectionActive && discardTargetable));
            const fanOffset = index - (handSize - 1) / 2;
            const fanAngle = handSize > 1 ? Math.max(-5.5, Math.min(5.5, fanOffset * 1.6)) : 0;
            const fanDip = Math.min(24, Math.abs(fanOffset) * 6.5);
            const isHovered = hoveredHandId === card.instanceId;
            const selectedForDiscard = discardTargetLocked || handLimitTargetLocked;
            const { raised: isHeld, zIndex: handZIndex } = getHandCardPresentationState({
              index,
              hovered: isHovered,
              selectedForDiscard,
              dragging: draggingCardId === card.instanceId,
            });
            const showFullImage = shouldShowFullCardImage(card.definitionId);
            const useNativeHdRendering =
              showFullImage &&
              UI_FEATURE_FLAGS.useNativeHdHandImageRendering;
            const { x: dragX, y: dragY } = getDragMotionValues(card.instanceId);
            const initialDealCard = initialHandIds.current.has(card.instanceId);
            const entryOffset = handArchiveEntryOffset({
              ...handEntryGeometry,
              cardWidth: HAND_CARD_DISPLAY_WIDTH,
              cardHeight: HAND_CARD_DISPLAY_HEIGHT,
              handSize,
              index,
              stackMargin: handStackMargin,
              fanY: 88 + fanDip,
            });
            return (
              <motion.div
                key={card.instanceId}
                layout="position"
                layoutDependency={handLayoutSignature}
                custom={{
                  entryOrder: initialDealCard ? index : enteringHandOrder.get(card.instanceId) ?? 0,
                  stagger: initialDealCard || enteringHandIds.length > 1,
                  fromArchive: !initialDealCard,
                  entryOffset,
                }}
                variants={handCardMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.55 },
                }}
                onAnimationComplete={() => completeHandEntry(card.instanceId)}
                className="hand-card-slot"
                style={{ position: "relative", zIndex: handZIndex }}
              >
                <motion.div
                  className="hand-card-drag-layer"
                  style={{ x: dragX, y: dragY }}
                  drag={!tributeOfTheFourSorrowsSelectionActive && !handLimitDiscardActive && !hostAttackAnimating && !playerAttackAnimating}
                  dragElastic={0.08}
                  dragMomentum={false}
                  dragSnapToOrigin
                  whileDrag={{ zIndex: 120, rotate: 0 }}
                  onDragStart={(_, info) => {
                    beginCenterGrabDrag(card.instanceId, info.point.x, info.point.y);
                    selectHand(card.instanceId);
                    setHoveredCardId(undefined);
                    setHoveredHandId(undefined);
                    setDraggingRecyclableSourceId(energyRecyclable ? card.instanceId : undefined);
                    setEnergyRecycleDragActive(false);
                    setDraggingCardId(card.instanceId);
                  }}
                  onDrag={(_, info) => updateCardDrag(card, info.point.x, info.point.y)}
                  onDragEnd={(_, info) => finishDrag(card, playable, info)}
                  onPointerUpCapture={(event) => {
                    if (suppressedClickId !== card.instanceId) return;
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                  onClickCapture={(event) => {
                    if (suppressedClickId !== card.instanceId) return;
                    event.stopPropagation();
                    event.preventDefault();
                  }}
                >
                  <motion.div
                  ref={(el) => {
                    if (el) innerCardRefs.current.set(card.instanceId, el);
                    else innerCardRefs.current.delete(card.instanceId);
                    guidedAnchorRegistry.set(guidedCardAnchorKey(card.instanceId), `hand:${card.instanceId}`, el);
                  }}
                  className={[
                    "hand-card",
                    isHeld ? "hand-card-held" : "",
                    useNativeHdRendering ? "hand-card-native-hd" : "",
                    cardAvailable && draggingCardId !== card.instanceId ? "hand-card-available" : "",
                    spellTargetingHandId === card.instanceId || pendingSpellHandId === card.instanceId ? "opacity-0" : "",
                    energyRecycleAnimation?.card.instanceId === card.instanceId ? "opacity-0" : "",
                    discardTargetable ? "counter-targetable-card" : "",
                    discardTargetLocked ? "counter-target-locked-card" : "",
                    handLimitTargetable ? "counter-targetable-card hand-limit-targetable" : "",
                    handLimitTargetLocked ? "counter-target-locked-card hand-limit-target-locked" : "",
                  ].join(" ")}
                  data-hand-card-id={card.instanceId}
                  style={{ "--hand-z": index + 1 } as React.CSSProperties}
                  initial={false}
                  animate={{
                    x: "-50%",
                    y: isHeld ? -100 : 88 + fanDip,
                    rotate: isHeld ? 0 : fanAngle,
                    transition: isHeld
                      ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  <div className="hand-card-face-scale">
                    <Card
                      game={game}
                      card={card}
                      selected={selectedHandId === card.instanceId}
                      dragging={draggingCardId === card.instanceId}
                      actionable={cardActionable}
                      suppressActionableChrome={cardAvailable}
                      suppressContextMenu={tributeOfTheFourSorrowsSelectionActive || handLimitDiscardActive}
                      suppressHoverOverlay
                      darkenOnHover={false}
                      highRes={isHeld}
                      sharpImageOverlay={!useNativeHdRendering}
                      showFullImage={showFullImage}
                      showCostBadge={showFullImage}
                      clipActionSweep={showFullImage && UI_FEATURE_FLAGS.alignHdHandActionSweep}
                      preferNativeImageRendering={useNativeHdRendering}
                      hideStats={!UI_FEATURE_FLAGS.showDynamicHandCardStats}
                      onSelect={() => {
                        if (handLimitDiscardActive) {
                          selectHandLimitDiscard(handLimitTargetLocked ? undefined : card.instanceId);
                          return;
                        }
                        if (tributeOfTheFourSorrowsSelectionActive) {
                          if (discardTargetable) lockTributeOfTheFourSorrowsSelectionTarget(card.instanceId);
                          return;
                        }
                        selectHand(card.instanceId);
                      }}
                      onKeyboardActivate={() => {
                        if (handLimitDiscardActive) {
                          selectHandLimitDiscard(handLimitTargetLocked ? undefined : card.instanceId);
                          return;
                        }
                        if (tributeOfTheFourSorrowsSelectionActive) {
                          if (discardTargetable) lockTributeOfTheFourSorrowsSelectionTarget(card.instanceId);
                          return;
                        }
                        if (playable) {
                          playCard(card);
                          return;
                        }
                        if (card.kinds.includes("SOURCE")) {
                          playLand(card.instanceId);
                          return;
                        }
                        pushToast({
                          title: t("error.cannotPlay"),
                          message: getUnplayableReason(game, card, unresolvedTriggerCount, t),
                          tone: "warning",
                        });
                      }}
                      onLeave={() => {
                        if (selectedHandId === card.instanceId) selectHand(undefined);
                      }}
                    />
                  </div>
                  {UI_FEATURE_FLAGS.showPlayerHandActionableGems &&
                    !tributeOfTheFourSorrowsSelectionActive &&
                    cardActionable &&
                    draggingCardId !== card.instanceId && (
                      <span
                        className={["card-actionable-gem card-actionable-gem-outside", cardTargetable ? "card-target-gem" : ""].join(" ")}
                        aria-hidden="true"
                      />
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            );
              })}
            </AnimatePresence>
            </div>
        </div>
      </section>
    </>
  );
}

function isPlayableFromHand(game: GameState, card: CardInstance, pendingTriggeredEffectCount = 0): boolean {
  if (pendingTriggeredEffectCount > 0) return false;
  if (!canPlayCardAtCurrentTiming(game, card)) return false;
  if (card.kinds.includes("SOURCE")) return !game.player.energyActionUsedThisTurn && canPlayerPutAnotherLand(game);
  if (!canPayLifeCost(game, card.additionalCost)) return false;
  if (!canPayWithAutomaticEnergy(game, totalEnergyCost(card.energyCost, card.variableCost?.hasX ? 1 : 0))) return false;
  return hasValidTargetSequence(game, "player", card.requiresTargets);
}

function readHandEntryGeometry(
  region: HTMLDivElement | null,
  cards: HTMLDivElement | null,
): {
  archiveCenter: { x: number; y: number };
  handCenterX: number;
  handBaselineY: number;
} {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      archiveCenter: { x: 0, y: 0 },
      handCenterX: 0,
      handBaselineY: 0,
    };
  }

  const archiveRect = document.querySelector<HTMLElement>("[data-player-archive-origin='true']")?.getBoundingClientRect();
  const regionRect = region?.getBoundingClientRect();
  const cardsRect = cards?.getBoundingClientRect();

  return {
    archiveCenter: archiveRect
      ? { x: archiveRect.left + archiveRect.width / 2, y: archiveRect.top + archiveRect.height / 2 }
      : { x: window.innerWidth - 110, y: window.innerHeight - 46 },
    handCenterX: regionRect ? regionRect.left + regionRect.width / 2 : window.innerWidth / 2,
    handBaselineY: cardsRect?.bottom ?? window.innerHeight,
  };
}

function isEnergyRecyclable(game: GameState, card: CardInstance, pendingTriggeredEffectCount = 0): boolean {
  return pendingTriggeredEffectCount === 0 && card.kinds.includes("SOURCE") && canPlayerRecycleEnergy(game);
}

function getUnplayableReason(game: GameState, card: CardInstance, pendingTriggeredEffectCount: number, t: ReturnType<typeof useTranslation>): string {
  if (game.winner) return t("error.gameOver");
  if (pendingTriggeredEffectCount > 0) return t("error.resolveBeforePlay");
  if (!canPlayCardAtCurrentTiming(game, card)) {
    if (isQuickSpell(card)) return t("error.instantTiming");
    return t("error.mainTiming");
  }
  if (card.kinds.includes("SOURCE")) {
    if (!canPlayerPutAnotherLand(game)) return t("error.landLimit", { count: MAX_PLAYER_LANDS });
    if (game.player.energyActionUsedThisTurn) return t("error.energyUsed");
    return t("error.landUnavailable");
  }
  if (!canPayLifeCost(game, card.additionalCost)) {
    return t("error.notEnoughLife", { amount: lifeCostAmount(card.additionalCost, game.player.life), card: card.displayName });
  }
  if (!hasValidTargetSequence(game, "player", card.requiresTargets)) return t("error.noTargets", { card: card.displayName });
  return t("error.notEnoughEnergy", { card: card.displayName });
}

type EnergyRecycleHint = {
  pointer: { x: number; y: number };
  target: { x: number; y: number };
};

function EnergyRecycleDragHint({ hint, recycleLabel, hintLabel }: { hint: EnergyRecycleHint; recycleLabel: string; hintLabel: string }) {
  const controlX = Math.max(hint.pointer.x, hint.target.x) + 34;
  const controlY = Math.min(hint.pointer.y, hint.target.y) - 44;
  const path = `M ${hint.pointer.x} ${hint.pointer.y} Q ${controlX} ${controlY} ${hint.target.x} ${hint.target.y}`;
  const labelX = (hint.pointer.x + hint.target.x) / 2;
  const labelY = (hint.pointer.y + hint.target.y) / 2 - 28;

  return (
    <div className="pointer-events-none fixed inset-0 z-[116]" aria-hidden="true">
      <svg className="absolute inset-0 h-full w-full overflow-visible">
        <defs>
          <marker id="energy-recycle-arrowhead" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
            <path d="M 0 0 L 9 4.5 L 0 9 z" fill="#b9e89b" />
          </marker>
        </defs>
        <path className="energy-recycle-drag-path-glow" d={path} />
        <path className="energy-recycle-drag-path" d={path} markerEnd="url(#energy-recycle-arrowhead)" />
      </svg>
      <div className="energy-recycle-drag-label" style={{ left: labelX, top: labelY }}>
        <strong>{recycleLabel}</strong>
        <span>{hintLabel}</span>
      </div>
      <span className="energy-recycle-target-ring" style={{ left: hint.target.x, top: hint.target.y }} />
    </div>
  );
}

function readEnergyRecycleTarget(): { x: number; y: number } {
  const rect = document.querySelector<HTMLElement>("[data-energy-recycle-target='true']")?.getBoundingClientRect();
  return rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth - 72, y: window.innerHeight - 64 };
}

function canPlayCardAtCurrentTiming(game: GameState, card: CardInstance): boolean {
  if (isQuickSpell(card)) {
    if (game.activeSide === "player" && (game.phase === "main" || game.phase === "combat")) return true;
    return game.activeSide === "host" && game.phase === "combat" && game.combat.hostAttackers.length > 0;
  }
  return game.activeSide === "player" && game.phase === "main";
}

function playFromHand(
  card: CardInstance,
  castCard: (id: string, options?: { xValue?: number; targets?: Record<string, string | string[]>; distribution?: Record<string, number> }) => void,
  playLand: (id: string) => void,
  friendly?: string,
  enemy?: string,
): void {
  if (card.kinds.includes("SOURCE")) {
    playLand(card.instanceId);
    return;
  }
  const xValue = card.variableCost?.hasX ? Number(window.prompt("X value", "1") ?? 0) : undefined;
  const targets: Record<string, string | string[]> = {};
  for (const req of card.requiresTargets) {
    if (req.controller === "SELF" && friendly) targets[req.id] = friendly;
    else if (req.controller === "OPPONENT" && enemy) targets[req.id] = enemy;
    else if (friendly) targets[req.id] = friendly;
  }
  castCard(card.instanceId, { xValue, targets });
}

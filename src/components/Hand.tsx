import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { MAX_PLAYER_LANDS, canPlayerPutAnotherLand } from "../engine/GameRules";
import { canPayWithAutomaticMana, parseManaCost } from "../engine/ManaSystem";
import { hasValidTargetSequence } from "../engine/Targeting";
import { getTutorialSpotlightZones, getTutorialStepId, isTutorialAwaitingContinue, isTutorialSeed } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { Card } from "./Card";
import { useLayoutEffect, useRef, useState } from "react";
import { motion, motionValue, type MotionValue, type PanInfo, type Variants } from "framer-motion";

const DRAG_PLAY_SCREEN_RATIO = 0.7;
const HAND_ENTRY_STAGGER = 0.07;
const handCardMotion: Variants = {
  initial: { opacity: 0, x: 260, y: 18, rotate: 3, scale: 0.94 },
  animate: (custom: { index: number; stagger: boolean }) => ({
    opacity: 1,
    x: 0,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      opacity: { duration: 0.16, delay: custom.stagger ? custom.index * HAND_ENTRY_STAGGER : 0, ease: "easeOut" },
      x: { type: "spring" as const, stiffness: 700, damping: 42, mass: 0.5, delay: custom.stagger ? custom.index * HAND_ENTRY_STAGGER : 0 },
      y: { type: "spring" as const, stiffness: 700, damping: 42, mass: 0.5, delay: custom.stagger ? custom.index * HAND_ENTRY_STAGGER : 0 },
      rotate: { type: "spring" as const, stiffness: 700, damping: 42, mass: 0.5, delay: custom.stagger ? custom.index * HAND_ENTRY_STAGGER : 0 },
      scale: { type: "spring" as const, stiffness: 700, damping: 42, mass: 0.5, delay: custom.stagger ? custom.index * HAND_ENTRY_STAGGER : 0 },
    },
  }),
};

export function Hand({ game }: { game: GameState }) {
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const hoveredCardId = useGameStore((state) => state.hoveredCardId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const counterTargeting = useGameStore((state) => state.counterTargeting);
  const smallpoxSelection = useGameStore((state) => state.smallpoxSelection);
  const spellTargeting = useGameStore((state) => state.spellTargeting);
  const spellFightAnimation = useGameStore((state) => state.spellFightAnimation);
  const pendingSpellHandId = useGameStore((state) => state.pendingSpellHandId);
  const hordeMillAnimating = useGameStore((state) => state.hordeMillAnimationQueue.length > 0);
  const playerDiscardAnimating = useGameStore((state) => state.playerDiscardAnimationQueue.length > 0);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const selectHand = useGameStore((state) => state.selectHand);
  const setHoveredCardId = useGameStore((state) => state.setHoveredCardId);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const startSpellTargeting = useGameStore((state) => state.startSpellTargeting);
  const lockSmallpoxSelectionTarget = useGameStore((state) => state.lockSmallpoxSelectionTarget);
  const pushToast = useToastStore((state) => state.pushToast);
  const [suppressedClickId, setSuppressedClickId] = useState<string | undefined>();
  const [draggingCardId, setDraggingCardId] = useState<string | undefined>();
  const handRegionRef = useRef<HTMLDivElement>(null);
  const handCardsRef = useRef<HTMLDivElement>(null);
  const innerCardRefs = useRef(new Map<string, HTMLDivElement>());
  const dragMotionValues = useRef(new Map<string, { x: MotionValue<number>; y: MotionValue<number> }>());
  const dragOriginCenters = useRef(new Map<string, { x: number; y: number }>());
  const [handStackMargin, setHandStackMargin] = useState(0);
  const initialHandIds = useRef(new Set(game.player.hand.map((card) => card.instanceId)));
  const handSize = game.player.hand.length;
  const handLayoutSignature = game.player.hand.map((card) => card.instanceId).join("|");

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
      const cardWidth = firstSlot.offsetWidth;
      const gap = Number.parseFloat(window.getComputedStyle(observedCards).columnGap) || 0;
      const naturalWidth = handSize * cardWidth + (handSize - 1) * gap;
      const requiredMargin = Math.min(0, (availableWidth - naturalWidth) / (handSize - 1));
      const minimumVisibleStrip = 28;
      setHandStackMargin(Math.max(-(cardWidth - minimumVisibleStrip), requiredMargin));
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
    const rect = el.getBoundingClientRect();
    const center = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    dragOriginCenters.current.set(cardId, center);
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

  function playCard(card: CardInstance) {
    if (!card.cardTypes.includes("Land") && card.requiresTargets.length > 0) {
      startSpellTargeting(card.instanceId, window.innerWidth * 0.5, window.innerHeight * 0.5);
      return;
    }
    playFromHand(card, castCard, playLand, selectedPlayerCreatureId, selectedHordeCreatureId);
  }

  function finishDrag(card: CardInstance, playable: boolean, info: PanInfo) {
    setSuppressedClickId(card.instanceId);
    window.setTimeout(() => setSuppressedClickId((current) => (current === card.instanceId ? undefined : current)), 240);
    setHoveredCardId(undefined);
    setFocusedCardId(undefined);
    selectHand(undefined);
    setDraggingCardId(undefined);
    dragOriginCenters.current.delete(card.instanceId);
    const playZoneY = window.innerHeight * DRAG_PLAY_SCREEN_RATIO;
    const releasedInPlayZone = info.point.y <= playZoneY;
    const shouldPlay = releasedInPlayZone && playable;
    if (shouldPlay) {
      playCard(card);
      return;
    }
    if (releasedInPlayZone && !playable) {
      pushToast({
        title: "Cannot play card",
        message: getUnplayableReason(game, card, pendingTriggeredEffectCount),
        tone: "warning",
      });
    }
  }

  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const tutorialStepId = isTutorialSeed(game) ? getTutorialStepId(game) : null;
  const tutorialZones = tutorialStepId ? getTutorialSpotlightZones(game, tutorialStepId, tutorialAcknowledgedStepId === tutorialStepId) : [];
  const tutorialHandTargetId = tutorialZones.find((zone) => zone.zone === "hand")?.definitionId ?? null;
  const tutorialAwaitingContinue = isTutorialAwaitingContinue(game, tutorialAcknowledgedStepId);
  const smallpoxDiscardMode = smallpoxSelection?.kind === "discard";
  const handInteractionBlocked = Boolean(
    counterTargeting ||
      spellTargeting ||
      spellFightAnimation ||
      pendingSpellHandId ||
      hordeMillAnimating ||
      playerDiscardAnimating ||
      pendingTriggeredEffectCount > 0 ||
      (smallpoxSelection && !smallpoxDiscardMode) ||
      tutorialAwaitingContinue,
  );
  const hoverSuppressed = Boolean(smallpoxSelection) || Boolean(tutorialStepId);

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
    if (nearestId && useGameStore.getState().hoveredCardId !== nearestId) setHoveredCardId(nearestId);
  }

  function handleHandPointerLeave() {
    setHoveredCardId(undefined);
  }

  return (
    <>
      <section className={["pointer-events-none fixed inset-x-0 bottom-0 h-56 overflow-visible", smallpoxDiscardMode || tutorialHandTargetId ? "z-[110]" : "z-[70]"].join(" ")}>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120b06]/90 via-[#3a2b18]/45 to-transparent" />
        <div ref={handRegionRef} className={[handInteractionBlocked ? "pointer-events-none" : "pointer-events-auto", "player-hand-region absolute bottom-0 flex h-56 items-end justify-center overflow-visible"].join(" ")}>
          <div
            ref={handCardsRef}
            className="player-hand-cards flex items-end justify-center overflow-visible"
            style={{ "--hand-count": Math.max(handSize, 1), "--hand-stack-margin": `${handStackMargin}px` } as React.CSSProperties}
            onMouseMove={handleHandPointerMove}
            onMouseLeave={handleHandPointerLeave}
          >
            {game.player.hand.map((card, index) => {
            const playable = isPlayableFromHand(game, card, pendingTriggeredEffectCount);
            const discardTargetable = smallpoxSelection?.kind === "discard" && !smallpoxSelection.targetId;
            const discardTargetLocked = smallpoxSelection?.kind === "discard" && smallpoxSelection.targetId === card.instanceId;
            const tutorialTarget = tutorialHandTargetId !== null && card.definitionId === tutorialHandTargetId;
            const tutorialDimmed = tutorialHandTargetId !== null && !tutorialTarget;
            const fanOffset = index - (handSize - 1) / 2;
            const fanAngle = handSize > 1 ? Math.max(-5.5, Math.min(5.5, fanOffset * 1.6)) : 0;
            const fanDip = Math.min(24, Math.abs(fanOffset) * 6.5);
            const isHovered = hoveredCardId === card.instanceId;
            const isHeld = isHovered || draggingCardId === card.instanceId;
            const { x: dragX, y: dragY } = getDragMotionValues(card.instanceId);
            return (
              <motion.div
                key={card.instanceId}
                layout="position"
                layoutDependency={handLayoutSignature}
                custom={{ index, stagger: initialHandIds.current.has(card.instanceId) }}
                variants={handCardMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  layout: { type: "spring", stiffness: 420, damping: 38, mass: 0.55 },
                }}
                className="hand-card-slot"
                style={{ position: "relative", zIndex: isHeld ? 80 : index + 1, x: dragX, y: dragY }}
                drag={!smallpoxSelection && !tutorialDimmed}
                dragElastic={0.08}
                dragMomentum={false}
                dragSnapToOrigin
                whileDrag={{ scale: 1.06, zIndex: 120, rotate: 0 }}
                onDragStart={(_, info) => {
                  beginCenterGrabDrag(card.instanceId, info.point.x, info.point.y);
                  if (!tutorialStepId) setFocusedCardId(card.instanceId);
                  selectHand(card.instanceId);
                  setHoveredCardId(undefined);
                  setDraggingCardId(card.instanceId);
                }}
                onDrag={(_, info) => updateCenterGrabDrag(card.instanceId, info.point.x, info.point.y)}
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
                  }}
                  className={[
                    "hand-card",
                    isHeld ? "hand-card-hovered" : "",
                    spellTargeting?.handId === card.instanceId || pendingSpellHandId === card.instanceId ? "opacity-0" : "",
                    discardTargetable ? "counter-targetable-card" : "",
                    discardTargetLocked ? "counter-target-locked-card" : "",
                    tutorialTarget ? "counter-targetable-card" : "",
                    tutorialDimmed ? "pointer-events-none opacity-30 saturate-50" : "",
                  ].join(" ")}
                  data-hand-card-id={card.instanceId}
                  style={{ "--hand-z": index + 1 } as React.CSSProperties}
                  initial={false}
                  animate={{
                    x: "-50%",
                    y: isHeld ? -86 : 48 + fanDip,
                    rotate: isHeld ? 0 : fanAngle,
                    transition: isHeld
                      ? { duration: 0.18, ease: [0.16, 1, 0.3, 1] }
                      : { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                  }}
                >
                  <Card
                    game={game}
                    card={card}
                    selected={selectedHandId === card.instanceId}
                    dragging={draggingCardId === card.instanceId}
                    actionable={!tutorialAwaitingContinue && (smallpoxSelection ? discardTargetable : tutorialHandTargetId !== null ? tutorialTarget : playable)}
                    suppressContextMenu={Boolean(smallpoxSelection)}
                    suppressHoverOverlay
                    darkenOnHover={false}
                    highRes={isHeld}
                    sharpImageOverlay
                    onSelect={() => {
                      if (smallpoxSelection) {
                        if (discardTargetable) lockSmallpoxSelectionTarget(card.instanceId);
                        return;
                      }
                      selectHand(card.instanceId);
                    }}
                    onLeave={() => {
                      if (selectedHandId === card.instanceId) selectHand(undefined);
                    }}
                  />
                </motion.div>
              </motion.div>
            );
          })}
            </div>
        </div>
      </section>
    </>
  );
}

function isPlayableFromHand(game: GameState, card: CardInstance, pendingTriggeredEffectCount = 0): boolean {
  if (pendingTriggeredEffectCount > 0) return false;
  if (!canPlayCardAtCurrentTiming(game, card)) return false;
  if (card.cardTypes.includes("Land")) return !game.player.landPlayedThisTurn && canPlayerPutAnotherLand(game);
  if (!canPayWithAutomaticMana(game, parseManaCost(card.manaCost, card.variableCost?.hasX ? 1 : 0))) return false;
  return hasValidTargetSequence(game, "player", card.requiresTargets);
}

function getUnplayableReason(game: GameState, card: CardInstance, pendingTriggeredEffectCount = 0): string {
  if (game.winner) return "The game is already over.";
  if (pendingTriggeredEffectCount > 0) return "Resolve the triggered effect before playing another card.";
  if (!canPlayCardAtCurrentTiming(game, card)) {
    if (card.cardTypes.includes("Instant")) return "Instants can be played during your main phase, battle phase, or defense.";
    return "Cards can only be played during your main phase.";
  }
  if (card.cardTypes.includes("Land")) {
    if (!canPlayerPutAnotherLand(game)) return `You cannot control more than ${MAX_PLAYER_LANDS} lands.`;
    if (game.player.landPlayedThisTurn) return "You already played a land this turn.";
    return "This land cannot be played right now.";
  }
  if (!hasValidTargetSequence(game, "player", card.requiresTargets)) return `No valid target sequence for ${card.displayName}.`;
  return `Not enough available mana to cast ${card.displayName}.`;
}

function canPlayCardAtCurrentTiming(game: GameState, card: CardInstance): boolean {
  if (card.cardTypes.includes("Instant")) {
    if (game.activeSide === "player" && (game.phase === "main" || game.phase === "combat")) return true;
    return game.activeSide === "horde" && game.phase === "combat" && game.combat.hordeAttackers.length > 0;
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
  if (card.cardTypes.includes("Land")) {
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
  const distribution = card.definitionId === "biogenic_upgrade" && friendly ? { [friendly]: 3 } : undefined;
  castCard(card.instanceId, { xValue, targets, distribution });
}

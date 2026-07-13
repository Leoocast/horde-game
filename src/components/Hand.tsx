import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { canPay, parseManaCost } from "../engine/ManaSystem";
import { targetCandidates } from "../engine/Targeting";
import { useGameStore } from "../store/useGameStore";
import { useToastStore } from "../store/useToastStore";
import { Card } from "./Card";
import { useRef, useState } from "react";
import { AnimatePresence, motion, type PanInfo, type Variants } from "framer-motion";

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
  exit: {
    opacity: 0,
    y: -80,
    rotate: 5,
    scale: 0.9,
    transition: {
      opacity: { duration: 0.12, ease: "easeOut" },
      y: { duration: 0.18, ease: "easeOut" },
      rotate: { duration: 0.16, ease: "easeOut" },
      scale: { duration: 0.16, ease: "easeOut" },
    },
  },
};

export function Hand({ game }: { game: GameState }) {
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const counterTargeting = useGameStore((state) => state.counterTargeting);
  const spellTargeting = useGameStore((state) => state.spellTargeting);
  const spellFightAnimation = useGameStore((state) => state.spellFightAnimation);
  const pendingTriggeredEffectCount = useGameStore((state) => state.pendingTriggeredEffectCount);
  const selectHand = useGameStore((state) => state.selectHand);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const startSpellTargeting = useGameStore((state) => state.startSpellTargeting);
  const pushToast = useToastStore((state) => state.pushToast);
  const [suppressedClickId, setSuppressedClickId] = useState<string | undefined>();
  const initialHandIds = useRef(new Set(game.player.hand.map((card) => card.instanceId)));
  const handSize = game.player.hand.length;

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
    setFocusedCardId(undefined);
    selectHand(undefined);
  }

  return (
    <>
      <section className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-56 overflow-visible">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120b06]/90 via-[#3a2b18]/45 to-transparent" />
        <div className={[counterTargeting || spellTargeting || spellFightAnimation || pendingTriggeredEffectCount > 0 ? "pointer-events-none" : "pointer-events-auto", "absolute bottom-0 left-1/2 flex h-56 w-[min(100vw-32px,1040px)] -translate-x-1/2 items-end justify-center overflow-visible px-8"].join(" ")}>
          <div className="flex items-end justify-center gap-2 overflow-visible" style={{ "--hand-count": Math.max(handSize, 1) } as React.CSSProperties}>
            <AnimatePresence mode="popLayout">
            {game.player.hand.map((card, index) => {
            const playable = isPlayableFromHand(game, card, pendingTriggeredEffectCount);
            return (
              <motion.div
                key={card.instanceId}
                layout
                custom={{ index, stagger: initialHandIds.current.has(card.instanceId) }}
                variants={handCardMotion}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  layout: { type: "spring", stiffness: 640, damping: 44, mass: 0.45 },
                }}
                drag
                dragElastic={0.08}
                dragMomentum={false}
                dragSnapToOrigin
                whileDrag={{ scale: 1.06, zIndex: 120, rotate: 0 }}
                onDragStart={() => {
                  setFocusedCardId(card.instanceId);
                  selectHand(card.instanceId);
                }}
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
                <div
                  className={["hand-card transition-opacity duration-200", spellTargeting?.handId === card.instanceId ? "opacity-0" : ""].join(" ")}
                  style={{ "--hand-z": index + 1 } as React.CSSProperties}
                >
                  <Card
                    game={game}
                    card={card}
                    selected={selectedHandId === card.instanceId}
                    actionable={playable}
                    onSelect={() => selectHand(card.instanceId)}
                    onLeave={() => {
                      if (selectedHandId === card.instanceId) selectHand(undefined);
                    }}
                  />
                </div>
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
  if (game.activeSide !== "player") return false;
  if (game.phase !== "main") return false;
  if (card.cardTypes.includes("Land")) return !game.player.landPlayedThisTurn;
  const pool = { ...game.player.manaPool };
  for (const land of game.player.battlefield) {
    if (!land.cardTypes.includes("Land") || land.tapped) continue;
    const ability = land.activatedAbilities.find((item) => item.effect.type === "ADD_MANA" && item.cost?.tap);
    if (!ability) continue;
    const mana = ability.effect.mana as Record<string, number> | undefined;
    const entry = mana ? Object.entries(mana)[0] : undefined;
    const color = entry?.[0] === "chosenColor" ? land.chosenColor ?? "G" : entry?.[0] ?? "G";
    const amount = entry?.[1] ?? Number(ability.effect.amount ?? 1);
    if (color === "G") pool.green += amount;
    else if (color === "R") pool.red += amount;
    else if (color === "U") pool.blue += amount;
    else if (color === "W") pool.white += amount;
    else if (color === "B") pool.black += amount;
    else pool.colorless += amount;
  }
  if (!canPay(pool, parseManaCost(card.manaCost, card.variableCost?.hasX ? 1 : 0))) return false;
  return card.requiresTargets.every((req) => targetCandidates(game, "player", req).length > 0);
}

function getUnplayableReason(game: GameState, card: CardInstance, pendingTriggeredEffectCount = 0): string {
  if (game.winner) return "The game is already over.";
  if (pendingTriggeredEffectCount > 0) return "Resolve the triggered effect before playing another card.";
  if (game.activeSide !== "player") return "Wait until your turn.";
  if (game.phase !== "main") return "Cards can only be played during your main phase.";
  if (card.cardTypes.includes("Land")) {
    if (game.player.landPlayedThisTurn) return "You already played a land this turn.";
    return "This land cannot be played right now.";
  }
  if (card.requiresTargets.some((req) => targetCandidates(game, "player", req).length === 0)) return `No valid targets for ${card.displayName}.`;
  return `Not enough available land mana to cast ${card.displayName}.`;
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

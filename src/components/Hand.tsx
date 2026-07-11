import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { canPay, parseManaCost } from "../engine/ManaSystem";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";
import { useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";

const DRAG_PLAY_SCREEN_RATIO = 0.7;

export function Hand({ game }: { game: GameState }) {
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const selectHand = useGameStore((state) => state.selectHand);
  const setFocusedCardId = useGameStore((state) => state.setFocusedCardId);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const [newHorizonsCard, setNewHorizonsCard] = useState<CardInstance | undefined>();
  const [suppressedClickId, setSuppressedClickId] = useState<string | undefined>();
  const handSize = game.player.hand.length;

  function playCard(card: CardInstance) {
    if (card.definitionId === "new_horizons") {
      setNewHorizonsCard(card);
      return;
    }
    playFromHand(card, castCard, playLand, selectedPlayerCreatureId, selectedHordeCreatureId);
  }

  function finishDrag(card: CardInstance, playable: boolean, info: PanInfo) {
    setSuppressedClickId(card.instanceId);
    window.setTimeout(() => setSuppressedClickId((current) => (current === card.instanceId ? undefined : current)), 240);
    const playZoneY = window.innerHeight * DRAG_PLAY_SCREEN_RATIO;
    const shouldPlay = info.point.y <= playZoneY && playable;
    if (shouldPlay) {
      playCard(card);
      return;
    }
    setFocusedCardId(undefined);
    selectHand(undefined);
  }

  return (
    <>
      <section className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-56 overflow-visible">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#120b06]/90 via-[#3a2b18]/45 to-transparent" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 border-t-2 border-[#b88945]/70 bg-[#17100a]" />
        <div className="pointer-events-auto absolute bottom-0 left-1/2 flex h-56 w-[min(100vw-32px,1040px)] -translate-x-1/2 items-end justify-center overflow-visible px-8">
          <div className="flex items-end justify-center gap-2 overflow-visible" style={{ "--hand-count": Math.max(handSize, 1) } as React.CSSProperties}>
            <AnimatePresence initial={false} mode="popLayout">
            {game.player.hand.map((card, index) => {
            const playable = isPlayableFromHand(game, card);
            return (
              <motion.div
                key={card.instanceId}
                layout
                initial={{ opacity: 0, y: 56, rotate: -2, scale: 0.92 }}
                animate={{ opacity: 1, y: 0, rotate: 0, scale: 1 }}
                exit={{ opacity: 0, y: -80, rotate: 5, scale: 0.9 }}
                transition={{ type: "spring", stiffness: 520, damping: 38, mass: 0.62 }}
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
                  className="hand-card"
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
      {newHorizonsCard && (
        <NewHorizonsTargetModal
          game={game}
          card={newHorizonsCard}
          onCancel={() => setNewHorizonsCard(undefined)}
          onConfirm={(targets) => {
            castCard(newHorizonsCard.instanceId, { targets });
            setNewHorizonsCard(undefined);
          }}
        />
      )}
    </>
  );
}

function NewHorizonsTargetModal({
  game,
  card,
  onCancel,
  onConfirm,
}: {
  game: GameState;
  card: CardInstance;
  onCancel: () => void;
  onConfirm: (targets: Record<string, string>) => void;
}) {
  const lands = game.player.battlefield.filter((item) => item.cardTypes.includes("Land"));
  const creatures = game.player.battlefield.filter((item) => item.cardTypes.includes("Creature"));
  const [targetLand, setTargetLand] = useState(lands[0]?.instanceId ?? "");
  const [targetCreature, setTargetCreature] = useState(creatures[0]?.instanceId ?? "");

  return (
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-[#090604]/80 p-6 text-[#f6e6b8]">
      <section className="old-panel w-full max-w-md p-5">
        <h2 className="old-title text-lg font-black">{card.displayName}</h2>
        <p className="mt-1 text-sm text-[#d6b879]">Choose the enchanted land and the creature that gets the +1/+1 counter.</p>

        <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-[#d6b879]">Land</label>
        <select value={targetLand} onChange={(event) => setTargetLand(event.target.value)} className="old-input mt-2 h-11 w-full px-3 outline-none focus:border-[#f4cc74]">
          {lands.map((land) => (
            <option key={land.instanceId} value={land.instanceId}>
              {land.displayName}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#d6b879]">+1/+1 counter</label>
        <select value={targetCreature} onChange={(event) => setTargetCreature(event.target.value)} className="old-input mt-2 h-11 w-full px-3 outline-none focus:border-[#f4cc74]">
          <option value="">No counter</option>
          {creatures.map((creature) => (
            <option key={creature.instanceId} value={creature.instanceId}>
              {creature.displayName}
            </option>
          ))}
        </select>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="old-button h-11 text-sm font-bold uppercase tracking-wide" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="old-button-green h-11 text-sm font-black uppercase tracking-wide disabled:opacity-40"
            disabled={!targetLand}
            onClick={() => onConfirm({ targetLand, ...(targetCreature ? { targetCreature } : {}) })}
          >
            Play
          </button>
        </div>
      </section>
    </div>
  );
}

function isPlayableFromHand(game: GameState, card: CardInstance): boolean {
  if (game.activeSide !== "player") return false;
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
  return canPay(pool, parseManaCost(card.manaCost, card.variableCost?.hasX ? 1 : 0));
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

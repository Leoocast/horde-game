import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { canPay, parseManaCost } from "../engine/ManaSystem";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";
import { useState } from "react";

export function Hand({ game }: { game: GameState }) {
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const selectHand = useGameStore((state) => state.selectHand);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const [newHorizonsCard, setNewHorizonsCard] = useState<CardInstance | undefined>();
  const handSize = game.player.hand.length;
  return (
    <>
      <section className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] h-56 overflow-visible">
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-stone-950/25 via-stone-500/20 to-transparent" />
        <div className="pointer-events-auto absolute bottom-0 left-1/2 flex h-56 w-[min(100vw-32px,1040px)] -translate-x-1/2 items-end justify-center overflow-visible px-8">
          <div className="flex items-end justify-center gap-2 overflow-visible" style={{ "--hand-count": Math.max(handSize, 1) } as React.CSSProperties}>
            {game.player.hand.map((card, index) => {
            return (
              <div
                key={card.instanceId}
                className="hand-card"
                style={{ "--hand-z": index + 1 } as React.CSSProperties}
              >
                <Card
                  game={game}
                  card={card}
                  selected={selectedHandId === card.instanceId}
                  onSelect={() => selectHand(card.instanceId)}
                  onLeave={() => {
                    if (selectedHandId === card.instanceId) selectHand(undefined);
                  }}
                  playDisabled={!isPlayableFromHand(game, card)}
                  onPlay={() => {
                    if (card.definitionId === "new_horizons") setNewHorizonsCard(card);
                    else playFromHand(card, castCard, playLand, selectedPlayerCreatureId, selectedHordeCreatureId);
                  }}
                />
              </div>
            );
          })}
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
    <div className="fixed inset-0 z-[135] flex items-center justify-center bg-stone-950/70 p-6 text-white backdrop-blur-sm">
      <section className="w-full max-w-md rounded-3xl border border-emerald-200/20 bg-stone-950/90 p-5 shadow-2xl shadow-black/45">
        <h2 className="text-lg font-black">{card.displayName}</h2>
        <p className="mt-1 text-sm text-stone-300">Elige la tierra encantada y la criatura que recibe el contador +1/+1.</p>

        <label className="mt-5 block text-xs font-bold uppercase tracking-wide text-stone-300">Land</label>
        <select value={targetLand} onChange={(event) => setTargetLand(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-stone-900 px-3 text-white outline-none focus:border-emerald-300/70">
          {lands.map((land) => (
            <option key={land.instanceId} value={land.instanceId}>
              {land.displayName}
            </option>
          ))}
        </select>

        <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-stone-300">+1/+1 counter</label>
        <select value={targetCreature} onChange={(event) => setTargetCreature(event.target.value)} className="mt-2 h-11 w-full rounded-xl border border-white/15 bg-stone-900 px-3 text-white outline-none focus:border-emerald-300/70">
          <option value="">No counter</option>
          {creatures.map((creature) => (
            <option key={creature.instanceId} value={creature.instanceId}>
              {creature.displayName}
            </option>
          ))}
        </select>

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button className="h-11 rounded-xl border border-white/15 bg-white/10 text-sm font-bold uppercase tracking-wide text-stone-200 hover:bg-white/15" onClick={onCancel}>
            Cancel
          </button>
          <button
            className="h-11 rounded-xl border border-emerald-200/35 bg-emerald-500/90 text-sm font-black uppercase tracking-wide text-stone-950 hover:bg-emerald-300 disabled:opacity-40"
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

import type { GameState } from "../engine/GameTypes";
import type { CardInstance } from "../engine/GameTypes";
import { canPay, parseManaCost } from "../engine/ManaSystem";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";

export function Hand({ game }: { game: GameState }) {
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const selectHand = useGameStore((state) => state.selectHand);
  const castCard = useGameStore((state) => state.castCard);
  const playLand = useGameStore((state) => state.playLand);
  const handSize = game.player.hand.length;
  return (
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
                onPlay={() => playFromHand(card, castCard, playLand, selectedPlayerCreatureId, selectedHordeCreatureId)}
              />
            </div>
          );
        })}
        </div>
      </div>
    </section>
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

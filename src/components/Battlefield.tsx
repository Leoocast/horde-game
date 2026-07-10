import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { canAttack, canBlockAttacker } from "../engine/Keywords";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";
import { Zone } from "./Zone";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef } from "react";

type Props = {
  game: GameState;
  side: Side;
  cards: CardInstance[];
};

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];

export function Battlefield({ game, side, cards }: Props) {
  const seenCardIds = useRef<Set<string>>(new Set());
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const selectPlayerCreature = useGameStore((state) => state.selectPlayerCreature);
  const selectHordeCreature = useGameStore((state) => state.selectHordeCreature);
  const tapForMana = useGameStore((state) => state.tapForMana);
  const toggleAttacker = useGameStore((state) => state.toggleAttacker);
  const declareBlocker = useGameStore((state) => state.declareBlocker);

  const creatures = cards.filter((card) => card.cardTypes.includes("Creature"));
  const lands = cards.filter((card) => card.cardTypes.includes("Land"));
  const others = cards.filter((card) => !card.cardTypes.includes("Creature") && !card.cardTypes.includes("Land"));
  const hordeCombat = game.activeSide === "horde" && game.phase === "combat" && game.combat.hordeAttackers.length > 0;

  useEffect(() => {
    for (const card of cards) seenCardIds.current.add(card.instanceId);
  }, [cards]);

  return (
    <Zone title={side === "player" ? "Player Battlefield" : "Horde Battlefield"} count={cards.length}>
      <div className="space-y-3">
        <BattlefieldRow title="Creatures" cards={creatures} />
        {(side === "player" || others.length > 0) && <ResourceRow lands={side === "player" ? lands : []} others={others} showLands={side === "player"} />}
      </div>
    </Zone>
  );

  function BattlefieldRow({ title, cards: rowCards, compact = false }: { title: string; cards: CardInstance[]; compact?: boolean }) {
    return (
      <div className="old-panel-soft p-2">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="old-title text-[11px] font-bold uppercase tracking-wide">{title}</h3>
          <span className="text-[11px] font-semibold text-[#d6b879]">{rowCards.length}</span>
        </div>
        {rowCards.length === 0 ? (
          <div className={compact ? "battlefield-empty-compact" : "battlefield-empty"}>Empty</div>
        ) : (
          <div className="flex flex-wrap justify-center gap-2">
            <AnimatePresence initial={false}>
              {rowCards.map((card) => renderCard(card, compact))}
            </AnimatePresence>
          </div>
        )}
      </div>
    );
  }

  function ResourceRow({ lands, others, showLands }: { lands: CardInstance[]; others: CardInstance[]; showLands: boolean }) {
    return (
      <div className="old-panel-soft p-2">
        <div className={showLands ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(150px,260px)]" : ""}>
          {showLands && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="old-title text-[11px] font-bold uppercase tracking-wide">Lands</h3>
                <span className="text-[11px] font-semibold text-[#d6b879]">{lands.length}</span>
              </div>
              {lands.length === 0 ? (
                <div className="battlefield-empty-compact">Empty</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <AnimatePresence initial={false}>
                    {lands.map((card) => renderCard(card, true, "land"))}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="old-title text-[11px] font-bold uppercase tracking-wide">Other permanents</h3>
              <span className="text-[11px] font-semibold text-[#d6b879]">{others.length}</span>
            </div>
            {others.length === 0 ? (
              <div className="battlefield-empty-compact">Empty</div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <AnimatePresence initial={false}>
                  {others.map((card) => renderCard(card, true, "other"))}
                </AnimatePresence>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  function renderCard(card: CardInstance, compact = false, keyPrefix = "card") {
    const firstTimeOnThisBattlefield = !seenCardIds.current.has(card.instanceId);
    const selected = side === "player" ? selectedPlayerCreatureId === card.instanceId : selectedHordeCreatureId === card.instanceId;
    const assignedAttackerId = findAssignedAttacker(card.instanceId);
    const blocking = Boolean(assignedAttackerId);
    const attacking = game.combat.playerAttackers.includes(card.instanceId) || game.combat.hordeAttackers.includes(card.instanceId);
    const attackerColor = getAttackerColor(card.instanceId);
    const assignedColor = assignedAttackerId ? getAttackerColor(assignedAttackerId) : undefined;
    const blockersAssigned = game.combat.blockers[card.instanceId]?.length ?? 0;
    const selectedBlocker = selectedPlayerCreatureId ? game.player.battlefield.find((item) => item.instanceId === selectedPlayerCreatureId) : undefined;
    const selectedBlockerAssigned = selectedBlocker ? Boolean(findAssignedAttacker(selectedBlocker.instanceId)) : false;
    const isLand = card.cardTypes.includes("Land");
    const playerCombat = game.activeSide === "player" && game.phase === "combat";
    const selectedPlayerAttacker = game.combat.playerAttackers.includes(card.instanceId);
    const legalAttacker = Boolean(playerCombat && side === "player" && card.cardTypes.includes("Creature") && (selectedPlayerAttacker || canAttack(game, card)));
    const legalBlocker = Boolean(
      hordeCombat &&
        side === "player" &&
        card.cardTypes.includes("Creature") &&
        !blocking &&
        game.combat.hordeAttackers.some((attackerId) => {
          const attacker = game.horde.battlefield.find((item) => item.instanceId === attackerId);
          return attacker ? canBlockAttacker(game, card, attacker) : false;
        }),
    );
    const legalBlockTarget = Boolean(hordeCombat && side === "horde" && selectedBlocker && !selectedBlockerAssigned && game.combat.hordeAttackers.includes(card.instanceId) && canBlockAttacker(game, selectedBlocker, card));
    const selectionDisabled =
      isLand ||
      (playerCombat && side === "player" && !legalAttacker) ||
      (playerCombat && side === "horde") ||
      (hordeCombat && side === "player" && !legalBlocker) ||
      (hordeCombat && side === "horde" && !legalBlockTarget);
    const muted =
      (playerCombat && side === "player" && !legalAttacker && !selectedPlayerAttacker && !isLand) ||
      (playerCombat && side === "horde");

    return (
      <motion.div
        key={`${keyPrefix}-${card.instanceId}`}
        layout
        initial={
          firstTimeOnThisBattlefield
            ? {
                opacity: 0,
                y: side === "horde" ? -46 : 46,
                scale: 1.55,
                rotate: side === "horde" ? -3 : 3,
                filter: "brightness(1.8) saturate(1.25)",
              }
            : false
        }
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0, filter: "brightness(1) saturate(1)" }}
        exit={{ opacity: 0, y: side === "horde" ? 28 : -28, scale: 0.78, rotate: side === "horde" ? 3 : -3 }}
        transition={{
          layout: { type: "spring", stiffness: 760, damping: 54, mass: 0.38 },
          opacity: { duration: 0.18, ease: "easeOut", delay: entryDelay(card) },
          scale: { duration: 0.34, ease: [0.16, 1, 0.3, 1], delay: entryDelay(card) },
          y: { duration: 0.34, ease: [0.16, 1, 0.3, 1], delay: entryDelay(card) },
          rotate: { duration: 0.28, ease: "easeOut", delay: entryDelay(card) },
          filter: { duration: 0.36, ease: "easeOut", delay: entryDelay(card) },
        }}
        className="battlefield-layout-slot"
      >
      <div data-card-slot-id={card.instanceId} className={compact ? "battlefield-card-slot-compact" : "battlefield-card-slot"}>
      <Card
        game={game}
        card={card}
        compact={compact}
        selected={selected}
        attacking={attacking}
        blocking={blocking}
        accentColor={assignedColor ?? attackerColor}
        linkLabel={side === "horde" && blockersAssigned > 0 ? `${blockersAssigned}` : undefined}
        selectionDisabled={selectionDisabled}
        muted={muted}
        onSelect={() => {
          if (side === "player") {
            if (isLand) return;
            if (playerCombat) {
              toggleAttacker(card.instanceId);
              return;
            }
            selectPlayerCreature(card.instanceId);
          } else {
            if (hordeCombat && selectedPlayerCreatureId && game.combat.hordeAttackers.includes(card.instanceId)) {
              declareBlocker(selectedPlayerCreatureId, card.instanceId);
              selectPlayerCreature(undefined);
              return;
            }
            selectHordeCreature(card.instanceId);
          }
        }}
        onMana={side === "player" ? () => tapForMana(card.instanceId) : undefined}
      />
      </div>
      </motion.div>
    );
  }

  function findAssignedAttacker(blockerId: string): string | undefined {
    return Object.entries(game.combat.blockers).find(([, blockerIds]) => blockerIds.includes(blockerId))?.[0];
  }

  function getAttackerColor(attackerId: string): string | undefined {
    const index = game.combat.hordeAttackers.indexOf(attackerId);
    if (index === -1) return undefined;
    return blockColors[index % blockColors.length];
  }

  function entryDelay(card: CardInstance): number {
    if (side !== "horde" || seenCardIds.current.has(card.instanceId)) return 0;
    const index = cards.findIndex((item) => item.instanceId === card.instanceId);
    return Math.max(index, 0) * 0.04;
  }
}

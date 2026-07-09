import type { CardInstance, GameState, Side } from "../engine/GameTypes";
import { canAttack, canBlockAttacker } from "../engine/Keywords";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";
import { Zone } from "./Zone";

type Props = {
  game: GameState;
  side: Side;
  cards: CardInstance[];
};

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];

export function Battlefield({ game, side, cards }: Props) {
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
      <div className="rounded-xl border border-white/15 bg-white/10 p-2 shadow-inner backdrop-blur-sm">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-stone-100/90">{title}</h3>
          <span className="text-[11px] font-semibold text-stone-100/65">{rowCards.length}</span>
        </div>
        {rowCards.length === 0 ? (
          <div className={compact ? "battlefield-empty-compact" : "battlefield-empty"}>Empty</div>
        ) : (
          <div className="flex flex-wrap gap-2">{rowCards.map((card) => renderCard(card, compact))}</div>
        )}
      </div>
    );
  }

  function ResourceRow({ lands, others, showLands }: { lands: CardInstance[]; others: CardInstance[]; showLands: boolean }) {
    return (
      <div className="rounded-xl border border-white/15 bg-white/10 p-2 shadow-inner backdrop-blur-sm">
        <div className={showLands ? "grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(150px,260px)]" : ""}>
          {showLands && (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[11px] font-bold uppercase tracking-wide text-stone-100/90">Lands</h3>
                <span className="text-[11px] font-semibold text-stone-100/65">{lands.length}</span>
              </div>
              {lands.length === 0 ? <div className="battlefield-empty-compact">Empty</div> : <div className="flex flex-wrap gap-2">{lands.map((card) => renderCard(card, true, "land"))}</div>}
            </div>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-stone-100/90">Other permanents</h3>
              <span className="text-[11px] font-semibold text-stone-100/65">{others.length}</span>
            </div>
            {others.length === 0 ? <div className="battlefield-empty-compact">Empty</div> : <div className="flex flex-wrap gap-2">{others.map((card) => renderCard(card, true, "other"))}</div>}
          </div>
        </div>
      </div>
    );
  }

  function renderCard(card: CardInstance, compact = false, keyPrefix = "card") {
    const selected = side === "player" ? selectedPlayerCreatureId === card.instanceId : selectedHordeCreatureId === card.instanceId;
    const assignedAttackerId = findAssignedAttacker(card.instanceId);
    const blocking = Boolean(assignedAttackerId);
    const attacking = game.combat.playerAttackers.includes(card.instanceId) || game.combat.hordeAttackers.includes(card.instanceId);
    const attackerColor = getAttackerColor(card.instanceId);
    const assignedColor = assignedAttackerId ? getAttackerColor(assignedAttackerId) : undefined;
    const blockersAssigned = game.combat.blockers[card.instanceId]?.length ?? 0;
    const selectedAttacker = selectedHordeCreatureId ? game.horde.battlefield.find((item) => item.instanceId === selectedHordeCreatureId) : undefined;
    const isLand = card.cardTypes.includes("Land");
    const playerCombat = game.activeSide === "player" && game.phase === "combat";
    const selectedPlayerAttacker = game.combat.playerAttackers.includes(card.instanceId);
    const legalAttacker = Boolean(playerCombat && side === "player" && card.cardTypes.includes("Creature") && (selectedPlayerAttacker || canAttack(game, card)));
    const legalBlocker = Boolean(hordeCombat && side === "player" && selectedAttacker && canBlockAttacker(game, card, selectedAttacker));
    const selectionDisabled =
      isLand ||
      (playerCombat && side === "player" && !legalAttacker) ||
      (playerCombat && side === "horde") ||
      (hordeCombat && side === "player" && !legalBlocker) ||
      (hordeCombat && side === "horde" && !game.combat.hordeAttackers.includes(card.instanceId));
    const muted =
      (playerCombat && side === "player" && !legalAttacker && !selectedPlayerAttacker && !isLand) ||
      (playerCombat && side === "horde") ||
      (hordeCombat && side === "player" && !legalBlocker && !blocking && !isLand) ||
      (hordeCombat && side === "horde" && !game.combat.hordeAttackers.includes(card.instanceId));

    return (
      <div key={`${keyPrefix}-${card.instanceId}`} className={compact ? "battlefield-card-slot-compact" : "battlefield-card-slot"}>
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
            if (selectedHordeCreatureId && game.combat.hordeAttackers.includes(selectedHordeCreatureId)) declareBlocker(card.instanceId, selectedHordeCreatureId);
          } else {
            selectHordeCreature(card.instanceId);
          }
        }}
        onMana={side === "player" ? () => tapForMana(card.instanceId) : undefined}
      />
      </div>
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
}

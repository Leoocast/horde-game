import { Play, RefreshCcw, Sparkles, Sword, Wand2 } from "lucide-react";
import { useGameStore } from "../store/useGameStore";
import type { CardInstance } from "../engine/GameTypes";

export function ActionPanel() {
  const game = useGameStore((state) => state.game);
  const selectedHandId = useGameStore((state) => state.selectedHandId);
  const selectedPlayerCreatureId = useGameStore((state) => state.selectedPlayerCreatureId);
  const selectedHordeCreatureId = useGameStore((state) => state.selectedHordeCreatureId);
  const seed = useGameStore((state) => state.seed);
  const setSeed = useGameStore((state) => state.setSeed);
  const reset = useGameStore((state) => state.reset);
  const playLand = useGameStore((state) => state.playLand);
  const castCard = useGameStore((state) => state.castCard);
  const activateAbility = useGameStore((state) => state.activateAbility);
  const resolvePlayerCombat = useGameStore((state) => state.resolvePlayerCombat);
  const resolveHordeCombat = useGameStore((state) => state.resolveHordeCombat);
  const finishHordeTurn = useGameStore((state) => state.finishHordeTurn);
  const selectedHand = game.player.hand.find((card) => card.instanceId === selectedHandId);
  const selectedPermanent = game.player.battlefield.find((card) => card.instanceId === selectedPlayerCreatureId);

  return (
    <aside className="space-y-3 border border-stone-300 bg-white p-3">
      <div>
        <label className="text-xs font-bold uppercase tracking-wide text-stone-600">Seed</label>
        <div className="mt-1 flex gap-2">
          <input value={seed} onChange={(event) => setSeed(event.target.value)} className="min-w-0 flex-1 border border-stone-300 px-2 py-1 text-sm" />
          <button className="icon-button" onClick={() => reset(seed)} title="Reset">
            <RefreshCcw size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center text-sm">
        <Metric label="Life" value={game.player.life} />
        <Metric label="Horde deck" value={game.horde.library.length} />
        <Metric label="RNG" value={game.currentRandomState.toString(16).slice(0, 5)} />
      </div>
      <div className="grid grid-cols-6 gap-1 text-center text-xs">
        <Mana label="G" value={game.player.manaPool.green} />
        <Mana label="R" value={game.player.manaPool.red} />
        <Mana label="U" value={game.player.manaPool.blue} />
        <Mana label="W" value={game.player.manaPool.white} />
        <Mana label="B" value={game.player.manaPool.black} />
        <Mana label="C" value={game.player.manaPool.colorless} />
      </div>
      <div className="space-y-2">
        <button className="wide-button" disabled={!selectedHand} onClick={() => selectedHand && castSelected(selectedHand, castCard, playLand, selectedPlayerCreatureId, selectedHordeCreatureId)}>
          <Play size={16} />
          <span>Cast / Play</span>
        </button>
        {selectedPermanent?.activatedAbilities.map((ability) => (
          <button key={ability.id} className="wide-button" onClick={() => activateAbility(selectedPermanent.instanceId, ability.id, selectedHordeCreatureId ? { targets: { target: selectedHordeCreatureId } } : undefined)}>
            <Wand2 size={16} />
            <span>{ability.id.replaceAll("_", " ")}</span>
          </button>
        ))}
        <button className="wide-button" onClick={resolvePlayerCombat}>
          <Sword size={16} />
          <span>Resolve Player Combat</span>
        </button>
        <button className="wide-button" onClick={resolveHordeCombat}>
          <Sparkles size={16} />
          <span>Resolve Horde Combat</span>
        </button>
        <button className="wide-button" onClick={finishHordeTurn}>
          <RefreshCcw size={16} />
          <span>Finish Horde Turn</span>
        </button>
      </div>
    </aside>
  );
}

function castSelected(
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

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-stone-200 bg-stone-50 p-2">
      <div className="text-xs text-stone-500">{label}</div>
      <div className="font-bold text-stone-950">{value}</div>
    </div>
  );
}

function Mana({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-stone-200 bg-emerald-50 p-1">
      <div className="font-bold text-emerald-900">{label}</div>
      <div className="text-stone-800">{value}</div>
    </div>
  );
}

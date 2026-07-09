import { Heart, Skull, Swords } from "lucide-react";
import type { GameState } from "../engine/GameTypes";
import { getPowerToughness } from "../engine/StaticEffects";
import type { DifficultyMode } from "./StartMenu";

export function DuelHud({ game }: { game: GameState }) {
  const pendingDamage = game.combat.playerAttackers.reduce((total, id) => {
    const attacker = game.player.battlefield.find((card) => card.instanceId === id);
    return attacker ? total + getPowerToughness(game, attacker).power : total;
  }, 0);
  const pendingMill = Math.floor(pendingDamage / 3);

  return (
    <div className="fixed right-4 top-[4.5rem] z-50 space-y-2 text-white">
      <div className="flex min-w-44 items-center justify-end gap-3 rounded-2xl border border-white/15 bg-stone-950/75 px-3 py-2 shadow-2xl shadow-black/30 backdrop-blur-md">
        <div className="text-right">
          <div className="text-xs font-bold uppercase tracking-wide text-stone-300">Horde Deck</div>
          <div className="text-3xl font-black leading-none">{game.horde.library.length}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border border-rose-400 bg-rose-950/80">
          <Skull size={20} />
        </div>
      </div>
      {game.phase === "combat" && game.activeSide === "player" && game.setupTurnsRemaining === 0 && (
        <div className="ml-auto flex min-w-44 items-center justify-end gap-2 rounded-2xl border border-rose-300/25 bg-rose-950/70 px-3 py-2 shadow-xl shadow-black/25 backdrop-blur-md">
          <Swords size={18} className="text-rose-200" />
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-rose-100/80">Attack Damage</div>
            <div className="text-sm font-black">
              {pendingDamage} dmg / 3 = -{pendingMill}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function PlayerLifePanel({ game, playerName, mode }: { game: GameState; playerName: string; mode: DifficultyMode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-white/15 bg-stone-950/70 px-4 py-3 text-white shadow-2xl shadow-black/25 backdrop-blur-md">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-emerald-300/70 bg-emerald-950/80">
        <Heart size={22} />
      </div>
      <div>
        <div className="text-xs font-bold uppercase tracking-wide text-stone-300">{playerName}</div>
        <div className="text-4xl font-black leading-none">{game.player.life}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-stone-400">{mode}</div>
      </div>
    </div>
  );
}

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
    <div className="fixed right-4 top-[4.5rem] z-50 space-y-2 text-[#f6e6b8]">
      <div className="old-panel flex min-w-44 items-center justify-end gap-3 px-3 py-2">
        <div className="text-right">
          <div className="old-title text-xs font-bold uppercase tracking-wide">Horde Deck</div>
          <div className="text-3xl font-black leading-none text-[#fff0b2]">{game.horde.library.length}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#b88945] bg-[#41100b] text-[#ffd59b]">
          <Skull size={20} />
        </div>
      </div>
      {game.phase === "combat" && game.activeSide === "player" && game.setupTurnsRemaining === 0 && (
        <div className="old-panel ml-auto flex min-w-44 items-center justify-end gap-2 px-3 py-2">
          <Swords size={18} className="text-[#ffbe72]" />
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#d6b879]">Attack Damage</div>
            <div className="text-sm font-black text-[#ffe6aa]">
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
    <div className="old-panel flex items-center gap-3 px-4 py-3 text-[#f6e6b8]">
      <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#d0a050] bg-[#16340e] text-[#caff9f]">
        <Heart size={22} />
      </div>
      <div>
        <div className="old-title text-xs font-bold uppercase tracking-wide">{playerName}</div>
        <div className="text-4xl font-black leading-none text-[#fff0b2]">{game.player.life}</div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-wide text-[#bda574]">{mode}</div>
      </div>
    </div>
  );
}

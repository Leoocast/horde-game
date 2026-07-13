import { Archive, Droplet, Heart, Skull, Swords } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { getPowerToughness } from "../engine/StaticEffects";
import { useGameStore } from "../store/useGameStore";

export function DuelHud({ game }: { game: GameState }) {
  const hordeMillQueue = useGameStore((state) => state.hordeMillAnimationQueue);
  const hordeMillPreviewCards = useGameStore((state) => state.hordeMillPreviewCards);
  const normalMillQueueLength = hordeMillQueue.filter((item) => !item.preview).length;
  const hordeLibraryIds = new Set(game.horde.library.map((card) => card.instanceId));
  const previewMillPendingInLibrary = hordeMillPreviewCards.filter((card) => hordeLibraryIds.has(card.instanceId)).length;
  const pendingMilledAfterActive = Math.max(0, normalMillQueueLength - 1);
  const visualHordeLibraryCount = game.horde.library.length + pendingMilledAfterActive - previewMillPendingInLibrary;
  const visualHordeGraveyardCount = Math.max(0, game.horde.graveyard.length - pendingMilledAfterActive + previewMillPendingInLibrary);
  const pendingDamage = game.combat.playerAttackers.reduce((total, id) => {
    const attacker = game.player.battlefield.find((card) => card.instanceId === id);
    return attacker ? total + getPowerToughness(game, attacker).power : total;
  }, 0);
  const pendingMill = Math.floor(pendingDamage / 3);

  return (
    <div className="fixed right-4 top-[4.5rem] z-50 space-y-2 text-[#f6e6b8]">
      <div data-player-attack-target="horde-deck" className="old-panel flex min-w-44 items-center justify-end gap-3 px-3 py-2">
        <div className="text-right">
          <div className="old-title text-xs font-bold uppercase tracking-wide">Horde Deck</div>
          <div className="flex items-end justify-end gap-2 leading-none">
            <div className="mb-0.5 flex items-center gap-1.5 rounded-full border border-[#0d0906]/80 bg-[#130d09]/80 px-2 py-0.5 text-[13px] font-black text-[#d7b878] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.45)]">
              <Archive size={14} strokeWidth={2.6} />
              <span>{visualHordeGraveyardCount}</span>
            </div>
            <div className="text-3xl font-black text-[#fff0b2]">{visualHordeLibraryCount}</div>
          </div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#b88945] bg-[#41100b] text-[#ffd59b]">
          <Skull size={20} />
        </div>
      </div>
      {game.horde.poisonCounters > 0 && (
        <div className="old-panel ml-auto flex min-w-44 items-center justify-end gap-2 px-3 py-2">
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wide text-[#cfa7ff]">Poison</div>
            <div className="text-sm font-black text-[#f0d7ff]">{game.horde.poisonCounters}/3</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-[#8b5cf6] bg-[#251036] text-[#d8b4fe] shadow-[0_0_16px_rgba(168,85,247,0.42)]">
            <Droplet size={19} fill="currentColor" strokeWidth={2.2} />
          </div>
        </div>
      )}
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

export function PlayerLifePanel({ game, playerName }: { game: GameState; playerName: string }) {
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);
  const lifeBuffAnimationId = useGameStore((state) => state.lifeBuffAnimationId);
  const [visualLife, setVisualLife] = useState(game.player.life);
  const [takingDamage, setTakingDamage] = useState(false);
  const lastEventId = useRef<number | undefined>(undefined);

  useEffect(() => {
    setVisualLife(game.player.life);
    lastEventId.current = undefined;
  }, [game.player.life]);

  useEffect(() => {
    if (!hordeAttackAnimation || hordeAttackAnimation.eventId === lastEventId.current || hordeAttackAnimation.playerDamage <= 0) return;
    lastEventId.current = hordeAttackAnimation.eventId;
    setVisualLife((life) => Math.max(0, life - hordeAttackAnimation.playerDamage));
    setTakingDamage(false);
    const frame = window.requestAnimationFrame(() => setTakingDamage(true));
    const timeout = window.setTimeout(() => setTakingDamage(false), 430);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [hordeAttackAnimation]);

  return (
    <div className={["old-panel fixed bottom-3 left-3 z-[75] flex min-w-44 items-center justify-start gap-3 overflow-hidden px-3 py-2 text-[#f6e6b8]", takingDamage ? "player-life-damage" : "", lifeBuffAnimationId ? "player-life-buff" : ""].join(" ")}>
      {lifeBuffAnimationId && <span key={lifeBuffAnimationId} className="buff-rise-lines life-buff-lines buff-rise-lines-green" aria-hidden="true" />}
      <div className="flex h-10 w-10 items-center justify-center rounded-full border-2 border-[#b88945] bg-[#16340e] text-[#caff9f]">
        <Heart size={20} />
      </div>
      <div className="text-left">
        <div className="old-title text-xs font-bold uppercase tracking-wide">{playerName}</div>
        <div className="text-3xl font-black leading-none text-[#fff0b2]">{visualLife}</div>
      </div>
    </div>
  );
}

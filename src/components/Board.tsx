import { Crown, Skull } from "lucide-react";
import { useEffect } from "react";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { AppHeader } from "./AppHeader";
import { Battlefield } from "./Battlefield";
import { CardContextMenu } from "./CardContextMenu";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { CounterTargetingOverlay } from "./CounterTargetingOverlay";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { GameStatusBadge } from "./GameStatusBadge";
import { Hand } from "./Hand";
import { HordeAttackAnimator } from "./HordeAttackAnimator";
import { HordeMillAnimator } from "./HordeMillAnimator";
import { InfoMenu } from "./InfoMenu";
import { PhaseBanner } from "./PhaseBanner";
import { PhaseOrb } from "./PhaseOrb";
import { PlayerDiscardAnimator } from "./PlayerDiscardAnimator";
import { PlayerAttackAnimator } from "./PlayerAttackAnimator";
import { SmallpoxSelectionOverlay } from "./SmallpoxSelectionOverlay";
import { SpellFightAnimator } from "./SpellFightAnimator";
import { SpellTargetingOverlay } from "./SpellTargetingOverlay";
import { ToastStack } from "./ToastStack";
import { TurnPhaseHud } from "./TurnPhaseHud";
import { DefeatModal } from "./DefeatModal";
import { VictoryModal } from "./VictoryModal";

type Props = {
  playerName: string;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function Board({ playerName, setupTurns, onReturnToMenu }: Props) {
  const game = useGameStore((state) => state.game);
  const triggerEndGame = useGameStore((state) => state.triggerEndGame);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const hordeAutoTriggerCount = useGameStore((state) => state.hordeAutoTriggerCount);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);
  const isDeveloperMode = game.seed.trim().toLowerCase() === "developer";

  useEffect(() => {
    setMusicVariant(game.player.life <= 10 ? "climax" : "battle");
  }, [game.player.life, setMusicVariant]);

  return (
    <main className="duel-table h-screen overflow-hidden">
      <AppHeader left={<GameStatusBadge game={game} />} center={<TurnPhaseHud game={game} />} right={<InfoMenu setupTurns={setupTurns} />} onReturnToMenu={onReturnToMenu} />
      <DuelHud game={game} />
      <PhaseBanner game={game} />
      <PhaseOrb game={game} />
      <CombatArrows game={game} />
      <CounterTargetingOverlay game={game} />
      <SmallpoxSelectionOverlay game={game} />
      <SpellTargetingOverlay game={game} />
      <HordeAttackAnimator />
      <HordeMillAnimator />
      <PlayerDiscardAnimator />
      <PlayerAttackAnimator />
      <SpellFightAnimator />
      {hordeAutoTriggerCount > 0 && <div data-audio-click="off" className="fixed inset-0 z-[79]" />}
      {(activeEffectCardId || closingEffectCardId) && (
        <div data-audio-click="off" className={["effect-focus-backdrop", closingEffectCardId ? "effect-focus-backdrop-closing" : ""].join(" ")} onClick={() => selectActiveEffectCard(undefined)} />
      )}
      <CardPreview />
      <CardContextMenu />
      <PlayerLifePanel game={game} playerName={playerName} />
      <ToastStack />
      <div className="grid h-[calc(100vh-56px)] grid-cols-1 items-start gap-3 overflow-hidden px-3 pb-56 pt-3">
        <section className="old-panel space-y-3 p-3">
          <Battlefield game={game} side="horde" cards={game.horde.battlefield} />
          <Battlefield game={game} side="player" cards={game.player.battlefield} />
        </section>
      </div>
      <Hand game={game} />
      
      {isDeveloperMode && !game.winner && (
        <div className="fixed bottom-4 left-4 z-[300] flex gap-2 rounded-lg bg-black/60 p-2 backdrop-blur-md">
          <button className="old-button-green flex h-8 items-center gap-2 px-3 text-[10px] font-bold uppercase" onClick={() => triggerEndGame("player")} title="Force Victory">
            <Crown size={12} /> Win
          </button>
          <button className="old-button flex h-8 items-center gap-2 px-3 text-[10px] font-bold uppercase" onClick={() => triggerEndGame("horde")} title="Force Defeat">
            <Skull size={12} /> Lose
          </button>
        </div>
      )}

      {game.winner === "horde" && <DefeatModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}
      {game.winner === "player" && <VictoryModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}
    </main>
  );
}

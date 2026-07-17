import { AlertTriangle, Home } from "lucide-react";
import { useEffect, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { AppHeader } from "./AppHeader";
import { Battlefield } from "./Battlefield";
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
import { TutorialGuide } from "./TutorialGuide";
import { DefeatModal } from "./DefeatModal";
import { VictoryModal } from "./VictoryModal";

type Props = {
  playerName: string;
  setupTurns: number;
  onReturnToMenu: () => void;
};

export function Board({ playerName, setupTurns, onReturnToMenu }: Props) {
  const game = useGameStore((state) => state.game);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const hordeAutoTriggerCount = useGameStore((state) => state.hordeAutoTriggerCount);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);
  const playCollection = useAudioStore((state) => state.playCollection);
  const [showHomeConfirmation, setShowHomeConfirmation] = useState(false);

  useEffect(() => {
    if (game.player.life <= 10) setMusicVariant("climax");
  }, [game.player.life, setMusicVariant]);

  useEffect(() => {
    if (game.winner === "player") playCollection("winTheme");
    else if (game.winner === "horde") playCollection("lossTheme");
  }, [game.winner, playCollection]);

  return (
    <main className="duel-table h-screen overflow-hidden">
      <AppHeader
        left={
          <div className="flex min-w-0 items-center">
            <button
              className="old-button ml-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              type="button"
              onClick={() => setShowHomeConfirmation(true)}
              title="Return home"
              aria-label="Return to home menu"
            >
              <Home size={18} />
            </button>
            <GameStatusBadge game={game} />
          </div>
        }
        center={<TurnPhaseHud game={game} />}
        right={<InfoMenu setupTurns={setupTurns} />}
        onReturnToMenu={() => setShowHomeConfirmation(true)}
      />
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
      <PlayerLifePanel game={game} playerName={playerName} />
      <ToastStack />
      <TutorialGuide game={game} onReturnToMenu={onReturnToMenu} />
      <div className="grid h-[calc(100vh-56px)] grid-cols-1 gap-3 overflow-hidden px-3 pb-40 pt-3">
        <section className="battlefield-board-grid">
          <div className="battlefield-side battlefield-side-horde">
            <Battlefield game={game} side="horde" cards={game.horde.battlefield} />
          </div>
          <div className="battlefield-side battlefield-side-player">
            <Battlefield game={game} side="player" cards={game.player.battlefield} />
          </div>
        </section>
      </div>
      <Hand game={game} />

      {game.winner === "horde" && <DefeatModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}
      {game.winner === "player" && <VictoryModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}

      {showHomeConfirmation && (
        <div className="fixed inset-0 z-[450] flex items-center justify-center bg-[#090604]/90 p-6 text-[#f6e6b8] backdrop-blur-sm" role="presentation">
          <section className="old-panel w-full max-w-md p-5 shadow-2xl shadow-black/70" role="dialog" aria-modal="true" aria-labelledby="return-home-title">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[#b97637] bg-[#3a1b0d] text-[#ffbd73]">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 id="return-home-title" className="old-title text-lg font-black uppercase tracking-wide text-[#f4cc74]">
                  Return home?
                </h2>
                <p className="mt-1 text-sm text-[#d6b879]">Your current game progress will be lost.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="old-button flex h-11 items-center justify-center text-sm font-black uppercase tracking-wide" type="button" onClick={() => setShowHomeConfirmation(false)}>
                Cancel
              </button>
              <button className="old-button-green flex h-11 items-center justify-center gap-2 text-sm font-black uppercase tracking-wide" type="button" onClick={onReturnToMenu}>
                <Home size={16} />
                Return home
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

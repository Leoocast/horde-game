import { AlertTriangle, Home } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { AppHeader } from "./AppHeader";
import { Battlefield } from "./Battlefield";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { CounterTargetingOverlay } from "./CounterTargetingOverlay";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { Hand } from "./Hand";
import { HandLimitOverlay } from "./HandLimitOverlay";
import { HordeAttackAnimator } from "./HordeAttackAnimator";
import { HordeMillAnimator } from "./HordeMillAnimator";
import { PhaseBanner } from "./PhaseBanner";
import { PhaseOrb } from "./PhaseOrb";
import { PlayerDiscardAnimator } from "./PlayerDiscardAnimator";
import { PlayerAttackAnimator } from "./PlayerAttackAnimator";
import { LandPlayAnimator } from "./LandPlayAnimator";
import { SmallpoxSelectionOverlay } from "./SmallpoxSelectionOverlay";
import { SpellFightAnimator } from "./SpellFightAnimator";
import { SpellTargetingOverlay } from "./SpellTargetingOverlay";
import { ToastStack } from "./ToastStack";
import { TurnPhaseHud } from "./TurnPhaseHud";
import { TutorialGuide } from "./TutorialGuide";
import { DefeatModal } from "./DefeatModal";
import { VictoryModal } from "./VictoryModal";
import { SurgeTransition } from "./SurgeTransition";

type Props = {
  playerName: string;
  setupTurns: number;
  encounterEntering?: boolean;
  onReturnToMenu: () => void;
};

export function Board({ playerName, setupTurns, encounterEntering = false, onReturnToMenu }: Props) {
  const game = useGameStore((state) => state.game);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const hordeAutoTriggerCount = useGameStore((state) => state.hordeAutoTriggerCount);
  const surgeTransitionActive = useGameStore((state) => state.surgeTransitionActive);
  const completeSurgeTransition = useGameStore((state) => state.completeSurgeTransition);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);
  const playCollection = useAudioStore((state) => state.playCollection);
  const [showHomeConfirmation, setShowHomeConfirmation] = useState(false);
  const homeConfirmationPresence = useAnimatedPresence(showHomeConfirmation, 210);

  useEffect(() => {
    if (game.player.life <= 10) setMusicVariant("climax");
  }, [game.player.life, setMusicVariant]);

  useEffect(() => {
    if (game.winner === "player") playCollection("winTheme");
    else if (game.winner === "horde") playCollection("lossTheme");
  }, [game.winner, playCollection]);

  return (
    <main className={`duel-table game-screen h-screen overflow-hidden ${encounterEntering ? "is-encounter-entering" : ""}`}>
      <BattlefieldFireflies />
      <AppHeader
        left={<TurnPhaseHud game={game} />}
        setupTurns={setupTurns}
        onReturnToMenu={() => setShowHomeConfirmation(true)}
      />
      <DuelHud game={game} />
      <PhaseBanner game={game} suspended={encounterEntering} />
      <PhaseOrb game={game} />
      <CombatArrows game={game} />
      <CounterTargetingOverlay game={game} />
      <SmallpoxSelectionOverlay game={game} />
      <SpellTargetingOverlay game={game} />
      <HordeAttackAnimator />
      <HordeMillAnimator />
      <PlayerDiscardAnimator />
      <LandPlayAnimator />
      <HandLimitOverlay game={game} />
      <PlayerAttackAnimator />
      <SpellFightAnimator />
      {hordeAutoTriggerCount > 0 && <div data-audio-click="off" className="fixed inset-0 z-[79]" />}
      {(activeEffectCardId || closingEffectCardId) && (
        <div data-audio-click="off" className={["effect-focus-backdrop", closingEffectCardId ? "effect-focus-backdrop-closing" : ""].join(" ")} onClick={() => selectActiveEffectCard(undefined)} />
      )}
      <CardPreview />
      <PlayerLifePanel game={game} playerName={playerName} />
      <ToastStack variant={game.winner ? "menu" : "game"} />
      <TutorialGuide game={game} onReturnToMenu={onReturnToMenu} />
      {surgeTransitionActive && <SurgeTransition onComplete={completeSurgeTransition} />}
      <div className="game-battlefield-stage grid h-[calc(100vh-72px)] grid-cols-1 overflow-hidden pb-40">
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

      {homeConfirmationPresence.mounted && (
        <div className={["game-home-backdrop fixed inset-0 z-[450] flex items-center justify-center p-6 text-[#e4ddc2]", homeConfirmationPresence.closing ? "is-closing" : ""].join(" ")} role="presentation">
          <section className={["old-panel game-dialog game-home-dialog w-full max-w-md p-6", homeConfirmationPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="return-home-title">
            <div className="flex items-start gap-3">
              <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="game-dialog-kicker">Leave the battlefield</div>
                <h2 id="return-home-title" className="old-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">
                  Return home?
                </h2>
                <p className="mt-2 text-sm text-[#8d9a94]">Your current game progress will be lost.</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="game-dialog-action flex h-11 items-center justify-center text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setShowHomeConfirmation(false)}>
                Cancel
              </button>
              <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}>
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

function BattlefieldFireflies() {
  return (
    <div className="game-battlefield-fireflies" aria-hidden="true">
      {Array.from({ length: 10 }, (_, index) => {
        const left = 6 + ((index * 37 + 11) % 87);
        const top = 8 + ((index * 53 + 17) % 69);
        const style = {
          left: `${left}%`,
          top: `${top}%`,
          "--battlefly-delay": `${-(index * 1.37)}s`,
          "--battlefly-duration": `${7.5 + (index % 4) * 1.45}s`,
          "--battlefly-x": `${index % 2 === 0 ? 22 + index * 2 : -18 - index * 2}px`,
          "--battlefly-y": `${index % 3 === 0 ? -34 : 24 + index}px`,
        } as CSSProperties;
        return <span key={index} style={style} />;
      })}
    </div>
  );
}

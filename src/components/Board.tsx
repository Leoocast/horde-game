import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useState, type CSSProperties } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { hostInSurge } from "../engine/StaticEffects";
import { useTranslation } from "../i18n/useTranslation";
import { AppHeader } from "./AppHeader";
import { Battlefield } from "./Battlefield";
import { CardPreview } from "./CardPreview";
import { CombatArrows } from "./CombatArrows";
import { CounterTargetingOverlay } from "./CounterTargetingOverlay";
import { DuelHud, PlayerLifePanel } from "./DuelHud";
import { Hand } from "./Hand";
import { HandLimitOverlay } from "./HandLimitOverlay";
import { OpeningHandOverlay } from "./OpeningHandOverlay";
import { HostAttackAnimator } from "./HostAttackAnimator";
import { HostMillAnimator } from "./HostMillAnimator";
import { PhaseBanner } from "./PhaseBanner";
import { PhaseOrb } from "./PhaseOrb";
import { PlayerDiscardAnimator } from "./PlayerDiscardAnimator";
import { PlayerAttackAnimator } from "./PlayerAttackAnimator";
import { LandPlayAnimator } from "./LandPlayAnimator";
import { EnergyRecycleAnimator } from "./EnergyRecycleAnimator";
import { TributeOfTheFourSorrowsSelectionOverlay } from "./TributeOfTheFourSorrowsSelectionOverlay";
import { SpellFightAnimator } from "./SpellFightAnimator";
import { SpellTargetingOverlay } from "./SpellTargetingOverlay";
import { ToastStack } from "./ToastStack";
import { TurnPhaseHud } from "./TurnPhaseHud";
import { DefeatModal } from "./DefeatModal";
import { VictoryModal } from "./VictoryModal";
import { SurgeTransition } from "./SurgeTransition";
import { BurnAnimator } from "./BurnAnimator";
import { BloodPactAnimator } from "./BloodSiphonAnimator";
import { LifePaymentAnimator } from "./LifePaymentAnimator";
import { LifestealAttackAnimator } from "./LifestealAttackAnimator";
import { PersonalBiteAttackAnimator } from "./PersonalBiteAttackAnimator";
import { DrainEssenceBiteAnimator } from "./DrainEssenceBiteAnimator";
import { DrainEssenceSmokeAnimator } from "./DrainEssenceAnimator";
import { FinalBanquetAnimator } from "./FinalBanquetAnimator";
import { RootsTouchedSkyAnimator } from "./RootsTouchedSkyAnimator";
import { EnergyFlowAnimator } from "./EnergyFlowAnimator";
import { GuidedTutorialOverlay } from "./GuidedTutorialOverlay";
import { useHiddenDefenseLinkIds } from "./useDefenseLinkVisibility";
import { IS_DEV } from "../utils/devMode";

type Props = {
  playerName: string;
  setupTurns: number;
  encounterEntering?: boolean;
  sessionKind?: "normal" | "tutorial";
  tutorialInterrupted?: boolean;
  tutorialErrorMessage?: string;
  onRestartTutorial?: () => void;
  onReturnToMenu: () => void;
};

export function Board({
  playerName,
  setupTurns,
  encounterEntering = false,
  sessionKind = "normal",
  tutorialInterrupted = false,
  tutorialErrorMessage,
  onRestartTutorial,
  onReturnToMenu,
}: Props) {
  const t = useTranslation();
  const game = useGameStore((state) => state.game);
  const activeEffectCardId = useGameStore((state) => state.activeEffectCardId);
  const closingEffectCardId = useGameStore((state) => state.closingEffectCardId);
  const hostAutoTriggerCount = useGameStore((state) => state.hostAutoTriggerCount);
  const playerAutoTriggerCount = useGameStore((state) => state.playerAutoTriggerCount);
  const burnAnimationActive = useGameStore((state) => Boolean(state.burnAnimation));
  const lifePaymentAnimationActive = useGameStore((state) => Boolean(state.lifePaymentAnimation));
  const bloodPactAnimationActive = useGameStore((state) => Boolean(state.bloodPactAnimation));
  const drainEssenceAnimationActive = useGameStore((state) => Boolean(state.drainEssenceAnimation));
  const finalBanquetAnimationActive = useGameStore((state) => Boolean(state.finalBanquetAnimation));
  const rootsTouchedSkyAnimationActive = useGameStore((state) => Boolean(state.rootsTouchedSkyAnimation));
  const energyFlowAnimationActive = useGameStore((state) => Boolean(state.energyFlowAnimation));
  const poisonConsumeAnimationActive = useGameStore((state) => Boolean(state.poisonConsumeAnimation));
  const resolvingHostCombat = useGameStore((state) => state.resolvingHostCombat);
  // Tribute of the Four Sorrows turns the Host's auto-trigger against the player, so hostAutoTriggerCount stays > 0
  // while they must pick a card to discard / creatures & lands to sacrifice. The board-wide input
  // blocker below would swallow those clicks, so drop it while a Tribute of the Four Sorrows selection is pending — the
  // overlay's own backdrop dims the rest of the board and each zone only allows target-locking.
  const tributeOfTheFourSorrowsSelectionActive = useGameStore((state) => Boolean(state.tributeOfTheFourSorrowsSelection));
  const surgeTransitionActive = useGameStore((state) => state.surgeTransitionActive);
  const surgeTransitionShown = useGameStore((state) => state.surgeTransitionShown);
  const completeSurgeTransition = useGameStore((state) => state.completeSurgeTransition);
  const stopGamePresentation = useGameStore((state) => state.stopGamePresentation);
  const selectActiveEffectCard = useGameStore((state) => state.selectActiveEffectCard);
  const setMusicVariant = useAudioStore((state) => state.setMusicVariant);
  const playCollection = useAudioStore((state) => state.playCollection);
  const playSfx = useAudioStore((state) => state.playSfx);
  const [showHomeConfirmation, setShowHomeConfirmation] = useState(false);
  const homeConfirmationPresence = useAnimatedPresence(showHomeConfirmation, 210);
  const surgeReached = surgeTransitionShown || hostInSurge(game);
  const hiddenDefenseLinkIds = useHiddenDefenseLinkIds(game);

  useEffect(() => {
    if (game.player.life <= 10 || surgeReached) setMusicVariant("climax");
  }, [game.player.life, setMusicVariant, surgeReached]);

  useEffect(() => {
    if (game.winner === "player") playCollection("winTheme");
    else if (game.winner === "host") playCollection("lossTheme");
  }, [game.winner, playCollection]);

  useLayoutEffect(() => {
    if (game.winner === "host") stopGamePresentation();
  }, [game.winner, stopGamePresentation]);

  useEffect(() => {
    if (!game.openingHandAccepted || encounterEntering) return;
    playSfx("skipNextBattle");
  }, [encounterEntering, game.openingHandAccepted, playSfx]);

  return (
    <main className={`duel-table game-screen h-screen overflow-hidden ${encounterEntering ? "is-encounter-entering" : ""}`}>
      <GameFireflies chaos={game.gameMode === "chaos"} />
      <AppHeader
        left={game.openingHandAccepted ? <TurnPhaseHud game={game} setupTurns={setupTurns} /> : undefined}
        setupTurns={setupTurns}
        elevated={!game.openingHandAccepted}
        sessionKind={sessionKind}
        onRestartTutorial={onRestartTutorial}
        onReturnToMenu={() => setShowHomeConfirmation(true)}
      />
      <DuelHud game={game} />
      <PhaseBanner game={game} setupTurns={setupTurns} suspended={encounterEntering || !game.openingHandAccepted} />
      {game.openingHandAccepted && <PhaseOrb game={game} />}
      <CombatArrows game={game} hiddenDefenseLinkIds={hiddenDefenseLinkIds} />
      <CounterTargetingOverlay game={game} />
      <TributeOfTheFourSorrowsSelectionOverlay game={game} />
      <SpellTargetingOverlay game={game} />
      <HostAttackAnimator />
      <HostMillAnimator />
      <PlayerDiscardAnimator />
      <LandPlayAnimator />
      <EnergyRecycleAnimator />
      <HandLimitOverlay game={game} />
      <PlayerAttackAnimator />
      <SpellFightAnimator />
      <BurnAnimator />
      <BloodPactAnimator />
      <LifePaymentAnimator />
      <LifestealAttackAnimator />
      <PersonalBiteAttackAnimator />
      <DrainEssenceBiteAnimator />
      <DrainEssenceSmokeAnimator />
      <FinalBanquetAnimator />
      <RootsTouchedSkyAnimator />
      <EnergyFlowAnimator />
      {!game.winner && (hostAutoTriggerCount > 0 || playerAutoTriggerCount > 0 || burnAnimationActive || lifePaymentAnimationActive || bloodPactAnimationActive || drainEssenceAnimationActive || finalBanquetAnimationActive || rootsTouchedSkyAnimationActive || energyFlowAnimationActive || poisonConsumeAnimationActive || resolvingHostCombat) && !tributeOfTheFourSorrowsSelectionActive && <div data-audio-click="off" className="fixed inset-0 z-[189]" />}
      {(activeEffectCardId || closingEffectCardId) && (
        <div data-audio-click="off" className={["effect-focus-backdrop", closingEffectCardId ? "effect-focus-backdrop-closing" : ""].join(" ")} onClick={() => selectActiveEffectCard(undefined)} />
      )}
      <CardPreview />
      <PlayerLifePanel game={game} playerName={playerName} setupTurns={setupTurns} />
      <ToastStack variant={game.winner ? "menu" : "game"} />
      {surgeTransitionActive && <SurgeTransition onComplete={completeSurgeTransition} />}
      <div className="game-battlefield-stage grid h-[calc(100vh-72px)] grid-cols-1 overflow-hidden pb-40">
        <section className="battlefield-board-grid">
          <div className="battlefield-side battlefield-side-host">
            <Battlefield game={game} side="host" cards={game.host.field} hiddenDefenseLinkIds={hiddenDefenseLinkIds} />
          </div>
          <div className="battlefield-side battlefield-side-player">
            <Battlefield game={game} side="player" cards={game.player.field} hiddenDefenseLinkIds={hiddenDefenseLinkIds} />
          </div>
        </section>
      </div>
      {game.openingHandAccepted && <Hand game={game} />}
      <OpeningHandOverlay game={game} />
      <GuidedTutorialOverlay />

      {sessionKind === "normal" && game.winner === "host" && <DefeatModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}
      {sessionKind === "normal" && game.winner === "player" && <VictoryModal game={game} setupTurns={setupTurns} onReturnToMenu={onReturnToMenu} />}

      {sessionKind === "tutorial" && tutorialInterrupted && (
        <div data-guided-system-control="true" className="game-home-backdrop fixed inset-0 z-[20040] flex items-center justify-center p-6 text-[#e4ddc2]" role="presentation">
          <section className="old-panel game-dialog game-home-dialog w-full max-w-md p-6" role="dialog" aria-modal="true" aria-labelledby="tutorial-interrupted-title">
            <div className="flex items-start gap-3">
              <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center"><AlertTriangle size={20} /></div>
              <div>
                <div className="game-dialog-kicker">{t("guided.lifecycle.interruptedKicker")}</div>
                <h2 id="tutorial-interrupted-title" className="old-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">{t("guided.lifecycle.interruptedTitle")}</h2>
                <p className="mt-2 text-sm text-[#8d9a94]">{t("guided.lifecycle.interruptedBody")}</p>
                {IS_DEV && tutorialErrorMessage && <pre className="mt-3 max-h-24 overflow-auto whitespace-pre-wrap text-xs text-[#c8a985]">{tutorialErrorMessage}</pre>}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="game-dialog-action flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}>
                <Home size={16} /> {t("guided.lifecycle.exit")}
              </button>
              <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onRestartTutorial}>
                <RotateCcw size={16} /> {t("guided.lifecycle.restart")}
              </button>
            </div>
          </section>
        </div>
      )}

      {homeConfirmationPresence.mounted && (
        <div
          {...(sessionKind === "tutorial" ? { "data-guided-system-control": "true" } : {})}
          className={[`game-home-backdrop fixed inset-0 ${sessionKind === "tutorial" ? "z-[20040]" : "z-[450]"} flex items-center justify-center p-6 text-[#e4ddc2]`, homeConfirmationPresence.closing ? "is-closing" : ""].join(" ")}
          role="presentation"
        >
          <section className={["old-panel game-dialog game-home-dialog w-full max-w-md p-6", homeConfirmationPresence.closing ? "is-closing" : ""].join(" ")} role="dialog" aria-modal="true" aria-labelledby="return-home-title">
            <div className="flex items-start gap-3">
              <div className="game-dialog-icon flex h-10 w-10 shrink-0 items-center justify-center">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="game-dialog-kicker">{t(sessionKind === "tutorial" ? "guided.lifecycle.leaveKicker" : "game.leaveBattlefield")}</div>
                <h2 id="return-home-title" className="old-title mt-1 text-xl font-medium uppercase tracking-[0.08em]">
                  {t(sessionKind === "tutorial" ? "guided.lifecycle.leaveTitle" : "game.returnHomeQuestion")}
                </h2>
                <p className="mt-2 text-sm text-[#8d9a94]">{t(sessionKind === "tutorial" ? "guided.lifecycle.leaveBody" : "game.progressLost")}</p>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button className="game-dialog-action flex h-11 items-center justify-center text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={() => setShowHomeConfirmation(false)}>
                {t("common.cancel")}
              </button>
              <button className="game-dialog-action game-dialog-action-primary flex h-11 items-center justify-center gap-2 text-xs font-black uppercase tracking-[0.14em]" type="button" onClick={onReturnToMenu}>
                <Home size={16} />
                {t(sessionKind === "tutorial" ? "guided.lifecycle.exit" : "game.returnHome")}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function GameFireflies({ chaos }: { chaos: boolean }) {
  return (
    <div className={["game-ambient-fireflies", chaos ? "is-chaos" : ""].join(" ")} aria-hidden="true">
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

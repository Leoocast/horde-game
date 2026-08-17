import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { hostInSurge } from "../engine/StaticEffects";
import { useTranslation } from "../i18n/useTranslation";
import { captureDesktopViewport } from "../platform/desktopBridge";
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
import { TemporalBackdrop } from "./TemporalBackdrop";
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
  onRewriteFuture?: () => void;
  onContemplateFuture?: () => void;
  onReturnToMenu: () => void;
};

/** Espera a que la limpieza del combate y Vida 0 lleguen al compositor desktop. */
function waitForDefeatCapturePaint(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Copia píxeles ya pintados. No clona cartas ni vuelve a resolver sus URLs, de modo que repetir
 * una derrota no puede convertir sus imágenes en recursos rotos.
 */
async function capturePaintedDefeatFrame(): Promise<HTMLImageElement | null> {
  try {
    const dataUrl = await captureDesktopViewport();
    if (!dataUrl) return null;
    const image = new Image();
    image.decoding = "async";
    image.src = dataUrl;
    await image.decode();
    return image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null;
  } catch {
    return null;
  }
}

function settleDefeatCapture(
  task: Promise<HTMLImageElement | null>,
  timeoutMs = 1800,
): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (snapshot: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(snapshot);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    task.then(finish).catch(() => finish(null));
  });
}

export function Board({
  playerName,
  setupTurns,
  encounterEntering = false,
  sessionKind = "normal",
  tutorialInterrupted = false,
  tutorialErrorMessage,
  onRestartTutorial,
  onRewriteFuture,
  onContemplateFuture,
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
  // undefined = preparando el frame final; null = la captura nativa no está disponible.
  const [defeatSnapshot, setDefeatSnapshot] = useState<HTMLImageElement | null | undefined>(undefined);
  const defeatCaptureTaskRef = useRef<Promise<HTMLImageElement | null> | null>(null);
  const homeConfirmationPresence = useAnimatedPresence(showHomeConfirmation, 210);
  const surgeReached = surgeTransitionShown || hostInSurge(game);
  const hiddenDefenseLinkIds = useHiddenDefenseLinkIds(game);
  // El fondo reacciona al mismo umbral que lleva la música a clímax, sin estado propio.
  const climaxReached = game.player.life <= 10 || surgeReached;

  // El disco de grados mide cómo se mueve el futuro. Lo acumula el store impacto a
  // impacto, que es quien conoce cada golpe y cada baja; aquí sólo se lee.
  const destinyDial = useGameStore((state) => state.destinyDial);
  const defeatOutcomeReady = game.winner === "host" && !resolvingHostCombat;
  const defeatReady = defeatOutcomeReady && defeatSnapshot !== undefined;
  const gameplayPresentationActive = (
    hostAutoTriggerCount > 0
    || playerAutoTriggerCount > 0
    || burnAnimationActive
    || lifePaymentAnimationActive
    || bloodPactAnimationActive
    || drainEssenceAnimationActive
    || finalBanquetAnimationActive
    || rootsTouchedSkyAnimationActive
    || energyFlowAnimationActive
    || poisonConsumeAnimationActive
    || resolvingHostCombat
  );
  const defeatPresentationPending = game.winner === "host"
    && (resolvingHostCombat || defeatSnapshot === undefined);
  const presentationInputBlocked = (
    (!game.winner && gameplayPresentationActive)
    || defeatPresentationPending
  );

  useEffect(() => {
    if (!defeatOutcomeReady) {
      defeatCaptureTaskRef.current = null;
      setDefeatSnapshot(undefined);
      return;
    }

    let active = true;
    const prepareSnapshot = async () => {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
      await waitForDefeatCapturePaint();
      return settleDefeatCapture(capturePaintedDefeatFrame());
    };
    const task = defeatCaptureTaskRef.current ?? prepareSnapshot();
    defeatCaptureTaskRef.current = task;
    void task.then((snapshot) => {
      if (active) setDefeatSnapshot(snapshot);
    });
    return () => {
      active = false;
    };
  }, [defeatOutcomeReady]);

  useEffect(() => {
    if (climaxReached) setMusicVariant("climax");
  }, [climaxReached, setMusicVariant]);

  useEffect(() => {
    if (game.winner === "player") playCollection("winTheme");
    else if (defeatOutcomeReady) playCollection("lossTheme");
  }, [defeatOutcomeReady, game.winner, playCollection]);

  useLayoutEffect(() => {
    if (defeatOutcomeReady) stopGamePresentation();
  }, [defeatOutcomeReady, stopGamePresentation]);

  useEffect(() => {
    if (!game.openingHandAccepted || encounterEntering) return;
    playSfx("skipNextBattle");
  }, [encounterEntering, game.openingHandAccepted, playSfx]);

  return (
    <main className={`duel-table game-screen h-screen overflow-hidden ${encounterEntering ? "is-encounter-entering" : ""}`}>
      <TemporalBackdrop
        grid
        climax={climaxReached ? 1 : 0}
        dial={destinyDial}
      />
      {/* El fondo permanece vivo bajo la placa capturada y aparece entre los trozos. */}
      <div className="game-screen-ambience" aria-hidden="true" />
      <AppHeader
        left={game.openingHandAccepted ? <TurnPhaseHud game={game} setupTurns={setupTurns} /> : undefined}
        setupTurns={setupTurns}
        elevated={!game.openingHandAccepted}
        sessionKind={sessionKind}
        onRestartTutorial={onRestartTutorial}
        onRewriteFuture={onRewriteFuture}
        onContemplateFuture={onContemplateFuture}
        futureSeed={game.seed}
        onReturnToMenu={() => setShowHomeConfirmation(true)}
      />
      <DuelHud game={game} />
      <PhaseBanner
        game={game}
        setupTurns={setupTurns}
        suspended={encounterEntering || !game.openingHandAccepted || sessionKind === "tutorial"}
      />
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
      {presentationInputBlocked && !tributeOfTheFourSorrowsSelectionActive && (
        <div data-audio-click="off" className="fixed inset-0 z-[189]" />
      )}
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

      {sessionKind === "normal" && defeatReady && onRewriteFuture && onContemplateFuture && (
        <DefeatModal
          game={game}
          snapshotImage={defeatSnapshot ?? undefined}
          onRewriteFuture={onRewriteFuture}
          onContemplateFuture={onContemplateFuture}
        />
      )}
      {sessionKind === "normal" && game.winner === "player" && onRewriteFuture && onContemplateFuture && (
        <VictoryModal game={game} onRewriteFuture={onRewriteFuture} onContemplateFuture={onContemplateFuture} />
      )}

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

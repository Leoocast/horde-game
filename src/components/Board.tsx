import { AlertTriangle, Home, RotateCcw } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAnimatedPresence } from "../hooks/useAnimatedPresence";
import { useGameStore, type GameStore } from "../store/useGameStore";
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
import { northUprightDialDegrees } from "./temporalDialPresentation";
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
import { ContextualTutorialCallout } from "./ContextualTutorialCallout";
import { useHiddenDefenseLinkIds } from "./useDefenseLinkVisibility";
import { IS_DEV } from "../utils/devMode";
import { guidedPresentationActivity } from "../guidance";

type Props = {
  playerName: string;
  setupTurns: number;
  encounterEntering?: boolean;
  /** El signo del Futuro se está trazando sobre el Campo: el tablero llega desnudo. */
  overtureActive?: boolean;
  /** El signo entregó el aro y se está apagando mientras entra el HUD. */
  overtureSettling?: boolean;
  /** El HUD todavía no abrió espacio suficiente para presentar la Mano. */
  overtureHandPending?: boolean;
  /** El disco de grados todavía no fue entregado por el signo. */
  overtureDialPending?: boolean;
  sessionKind?: "normal" | "tutorial";
  tutorialInterrupted?: boolean;
  tutorialErrorMessage?: string;
  onRestartTutorial?: () => void;
  onRewriteFuture?: () => void;
  onContemplateFuture?: () => void;
  onReturnToMenu: () => void;
};

const OUTCOME_PRESENTATION_SETTLE_TIMEOUT_MS = 6000;
// No beat normal se acerca a este presupuesto. Es solamente una salida de emergencia para que un
// token o callback defectuoso no deje la partida terminada bloqueada para siempre.
const OUTCOME_DRAIN_WATCHDOG_MS = 15000;

const subscribeToPresentationActivity = (listener: () => void) =>
  guidedPresentationActivity.subscribe(listener);
const readPresentationActivity = () => guidedPresentationActivity.snapshot();

/** Trabajo visual finito que todavía debe completar su último frame. Se ignoran los idles
 * infinitos del tablero (vuelo, agua, energía y ambiente), porque nunca forman parte de un beat. */
function runningFiniteDocumentAnimations(): Animation[] {
  return document.getAnimations().filter((animation) => {
    if (animation.playState !== "running" && !animation.pending) return false;
    const endTime = animation.effect?.getComputedTiming().endTime;
    return typeof endTime === "number" && Number.isFinite(endTime);
  });
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

/** Espera dos paints consecutivos sin animación finita. El reescaneo importa: soltar una baja
 * puede crear un reflow en el frame posterior al que terminó su efecto. */
async function waitForFiniteDocumentAnimations(
  timeoutMs = OUTCOME_PRESENTATION_SETTLE_TIMEOUT_MS,
): Promise<void> {
  const deadline = performance.now() + timeoutMs;
  let quietFrames = 0;
  while (performance.now() < deadline && quietFrames < 2) {
    await waitForAnimationFrame();
    const animations = runningFiniteDocumentAnimations();
    if (animations.length === 0) {
      quietFrames += 1;
      continue;
    }
    quietFrames = 0;
    const remaining = Math.max(0, deadline - performance.now());
    await Promise.race([
      Promise.allSettled(animations.map((animation) => animation.finished)),
      new Promise<void>((resolve) => window.setTimeout(resolve, Math.min(250, remaining))),
    ]);
  }
}

/** Todo trabajo de presentación observable desde Zustand que tiene un final automático. Los
 * estados que requieren input no entran aquí: con la partida terminada ya no pueden resolverse y
 * la limpieza final los cierra justo antes de la captura.
 *
 * La barrera es común a los dos desenlaces: la derrota necesita drenarla para capturar el frame
 * exacto que va a romperse, y la victoria para que el tablero no empiece a retirarse encima de
 * un beat todavía en curso. */
function outcomePresentationActive(state: GameStore): boolean {
  return Boolean(
    state.hostAttackAnimation
    || state.burnAnimation
    || state.lifePaymentAnimation
    || state.lifestealAttackAnimations.length > 0
    || state.poisonAttackAnimation
    || state.poisonConsumeAnimation
    || state.bloodPactAnimation
    || state.drainEssenceAnimation
    || state.finalBanquetAnimation
    || state.energyFlowAnimation
    || state.deathRevealCard
    || state.hostSpellCard
    || state.pendingStaticAuras.length > 0
    || state.playerAttackAnimation
    || state.resolvingHostCombat
    || state.summoningAnimationCount > 0
    || state.hostAutoTriggerCount > 0
    || state.playerAutoTriggerCount > 0
    || state.surgeTransitionActive
    || state.hostCombatDeadCardIds.length > 0
    || state.specialDeadCardIds.length > 0
    || state.hostMillAnimationQueue.length > 0
    || state.hostMillPreviewCards.length > 0
    || state.playerDiscardAnimationQueue.length > 0
    || state.landPlayAnimationQueue.length > 0
    || state.energyRecycleAnimation
    || state.autoPaidLandAnimation
    || state.spellFightAnimation
    || state.rootsTouchedSkyAnimation
    || state.buffAnimationCardIds.length > 0
    || state.lifeBuffAnimationId
    || state.activatingEffectCardId
    || state.closingEffectCardId
  );
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
  overtureActive = false,
  overtureSettling = false,
  overtureHandPending = false,
  overtureDialPending = false,
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
  const storePresentationActive = useGameStore(outcomePresentationActive);
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
  const [forcedOutcomeDrainSessionId, setForcedOutcomeDrainSessionId] = useState<number>();
  const defeatCaptureTaskRef = useRef<Promise<HTMLImageElement | null> | null>(null);
  const defeatCaptureGenerationRef = useRef(0);
  const homeConfirmationPresence = useAnimatedPresence(showHomeConfirmation, 210);
  const surgeReached = surgeTransitionShown || hostInSurge(game);
  const hiddenDefenseLinkIds = useHiddenDefenseLinkIds(game);
  // El fondo reacciona al mismo umbral que lleva la música a clímax, sin estado propio.
  const climaxReached = game.player.life <= 10 || surgeReached;

  // El disco de grados mide cómo se mueve el futuro. Lo acumula el store impacto a
  // impacto, que es quien conoce cada golpe y cada baja; aquí sólo se lee.
  const destinyDial = useGameStore((state) => state.destinyDial);
  const destinyDialRevision = useGameStore((state) => state.destinyDialRevision);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const [settledDestinyDialRevision, setSettledDestinyDialRevision] = useState(destinyDialRevision);
  const localPresentation = useSyncExternalStore(
    subscribeToPresentationActivity,
    readPresentationActivity,
    readPresentationActivity,
  );
  const destinyDialSettled = settledDestinyDialRevision === destinyDialRevision;
  const forcedOutcomeDrain = Boolean(game.winner)
    && forcedOutcomeDrainSessionId === gameSessionId;
  // La barrera se abre igual para los dos desenlaces: sólo lo que ocurre después difiere.
  const outcomeOutroReady = Boolean(game.winner)
    && destinyDialSettled
    && (
      forcedOutcomeDrain
      || (!storePresentationActive && localPresentation.activeCount === 0)
    );
  const defeatOutcomeReady = outcomeOutroReady && game.winner === "host";
  const defeatReady = defeatOutcomeReady && defeatSnapshot !== undefined;
  // La victoria no captura nada: en cuanto la presentación se asienta, el tablero puede retirarse.
  const victoryReady = outcomeOutroReady && game.winner === "player";
  const outcomePresentationPending = Boolean(game.winner) && !defeatReady && !victoryReady;
  /* Al preservarse el Futuro el instrumento vuelve a su Norte mientras las motas todavía viajan:
     la constelación es cardinal y sus puntas tienen que clavarse sobre las marcas, no al lado.
     Es sólo presentación, así que el ángulo acumulado del store no se toca. */
  const presentedDestinyDial = victoryReady
    ? northUprightDialDegrees(destinyDial)
    : destinyDial;
  const presentationInputBlocked = (
    (!game.winner && storePresentationActive)
    || outcomePresentationPending
  );

  useEffect(() => {
    if (!game.winner) {
      setForcedOutcomeDrainSessionId(undefined);
      return;
    }
    // Once the real barrier opened, capture has its own bounded timeout; do not let the emergency
    // timer fire later while the already-correct shatter/result screen is playing.
    if (outcomeOutroReady) return;
    const watchedSessionId = gameSessionId;
    const timer = window.setTimeout(() => {
      const current = useGameStore.getState();
      if (current.gameSessionId !== watchedSessionId || !current.game.winner) return;
      // La ruta normal espera todos los finales observables. El watchdog sólo invalida trabajo
      // huérfano después de 15 s y pide al dial su frame exacto antes de abrir el desenlace.
      stopGamePresentation();
      setForcedOutcomeDrainSessionId(watchedSessionId);
    }, OUTCOME_DRAIN_WATCHDOG_MS);
    return () => window.clearTimeout(timer);
  }, [outcomeOutroReady, game.winner, gameSessionId, stopGamePresentation]);

  useEffect(() => {
    if (!defeatOutcomeReady) {
      defeatCaptureGenerationRef.current += 1;
      defeatCaptureTaskRef.current = null;
      setDefeatSnapshot(undefined);
      return;
    }

    let active = true;
    let task = defeatCaptureTaskRef.current;
    if (!task) {
      const generation = ++defeatCaptureGenerationRef.current;
      const prepareSnapshot = async () => {
        const sessionId = useGameStore.getState().gameSessionId;
        const dialTarget = destinyDial;
        const dialTargetRevision = destinyDialRevision;
        const canCleanDefeat = () => {
          const current = useGameStore.getState();
          return active
            && defeatCaptureGenerationRef.current === generation
            && current.gameSessionId === sessionId
            && current.game.winner === "host"
            && current.destinyDial === dialTarget
            && current.destinyDialRevision === dialTargetRevision
            && !outcomePresentationActive(current)
            && guidedPresentationActivity.snapshot().activeCount === 0;
        };

        await waitForFiniteDocumentAnimations();
        if (!canCleanDefeat()) return null;
        // Una sola autoridad cierra selecciones y timers: sólo después de drenar cada beat visible.
        stopGamePresentation();
        await waitForFiniteDocumentAnimations();
        if (!canCleanDefeat()) return null;
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return null;
        return settleDefeatCapture(capturePaintedDefeatFrame());
      };
      task = prepareSnapshot();
      defeatCaptureTaskRef.current = task;
    }
    void task.then((snapshot) => {
      if (active) setDefeatSnapshot(snapshot);
    });
    return () => {
      active = false;
    };
  }, [defeatOutcomeReady, destinyDial, destinyDialRevision, stopGamePresentation]);

  useEffect(() => {
    if (climaxReached) setMusicVariant("climax");
  }, [climaxReached, setMusicVariant]);

  // El tema entra con el desenlace, no con el último golpe: así la música cambia en el mismo
  // instante en que el tablero empieza a retirarse.
  useEffect(() => {
    if (victoryReady) playCollection("winTheme");
    else if (defeatOutcomeReady) playCollection("lossTheme");
  }, [defeatOutcomeReady, playCollection, victoryReady]);

  useEffect(() => {
    if (!game.openingHandAccepted || encounterEntering) return;
    playSfx("skipNextBattle");
  }, [encounterEntering, game.openingHandAccepted, playSfx]);

  /* El panel de Energía se renderiza mediante portal bajo document.body, fuera de <main>.
     Reflejamos la fase antes del paint para que no aparezca un fotograma antes que el HUD. */
  useLayoutEffect(() => {
    document.body.classList.toggle("board-overture-active", overtureActive);
    document.body.classList.toggle("board-overture-settling", overtureSettling);
    return () => {
      document.body.classList.remove("board-overture-active", "board-overture-settling");
    };
  }, [overtureActive, overtureSettling]);

  return (
    <main
      className={[
        "duel-table game-screen h-screen overflow-hidden",
        encounterEntering ? "is-encounter-entering" : "",
        overtureActive ? "is-overture" : "",
        overtureSettling ? "is-overture-settling" : "",
      ].filter(Boolean).join(" ")}
    >
      <TemporalBackdrop
        grid
        dialHidden={overtureDialPending}
        climax={climaxReached ? 1 : 0}
        dial={presentedDestinyDial}
        dialRevision={destinyDialRevision}
        settleDialImmediately={forcedOutcomeDrain}
        onDialSettled={setSettledDestinyDialRevision}
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
        suspended={encounterEntering || overtureActive || !game.openingHandAccepted || sessionKind === "tutorial"}
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
      {presentationInputBlocked && (!tributeOfTheFourSorrowsSelectionActive || outcomePresentationPending) && (
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
      {/* La Mano entra durante el fundido final del signo, después de que el HUD ya empezó
          a ocupar los bordes. La espera es independiente del final completo del shader. */}
      {!overtureHandPending && <OpeningHandOverlay game={game} />}
      <GuidedTutorialOverlay />
      <ContextualTutorialCallout />

      {sessionKind === "normal" && defeatReady && onRewriteFuture && onContemplateFuture && (
        <DefeatModal
          game={game}
          snapshotImage={defeatSnapshot ?? undefined}
          onRewriteFuture={onRewriteFuture}
          onContemplateFuture={onContemplateFuture}
        />
      )}
      {sessionKind === "normal" && victoryReady && onRewriteFuture && onContemplateFuture && (
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

import { Suspense, lazy, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { DestinyRewriteTransition, type DestinyTransitionKind } from "./components/DestinyRewriteTransition";
import { ENCOUNTER_IMPACT_MS, ENCOUNTER_OPEN_MS, ENCOUNTER_TRANSITION_MS, EncounterTransition } from "./components/EncounterTransition";
import { ChronicleSigilOverture } from "./components/ChronicleSigilOverture";
import { GameLoadingScreen } from "./components/GameLoadingScreen";
import { LearnToPlayIntroModal } from "./components/LearnToPlayIntroModal";
import { StartMenu, type HowToPlayMenuEntry } from "./components/StartMenu";
import {
  createOpaqueMatchOrigin,
  matchOriginVisualSeed,
  type MatchOrigin,
} from "./content/MatchOrigin";
import {
  GUIDED_LESSON_BOARD_SESSION,
  LEARN_TO_PLAY_BOARD_SESSION,
  NORMAL_BOARD_SESSION,
} from "./components/boardSessionPolicies";
import { findInspectableDeck, hostInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import type { GameMode } from "./engine/GameTypes";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";
import { useToastStore } from "./store/useToastStore";
import { useTranslation } from "./i18n/useTranslation";
import { IS_DEV } from "./utils/devMode";
import { hasCompletedOnboarding, hasPreloadedGameAssets, markGameAssetsPreloaded, readStoredPlayerName } from "./utils/appPersistence";
import { preloadGameAssets, type LoadingLabel } from "./utils/assetPreloader";
import { registerDesktopLifecycle } from "./platform/desktopLifecycle";
import { initializeDesktopPreferences } from "./persistence/desktopPreferences";
import {
  resumeDeckIds,
  type DesktopResumeLoad,
} from "./persistence/resumeService";
import { productResumeRuntime } from "./persistence/resumeRuntime";
import { restoreResumeGame } from "./persistence/resumeSave";
import { initializeGuidedProgressPersistence } from "./persistence/guidedProgressPersistence";
import { guidedProductLifecycle } from "./guidance/productRuntime";
import { guidedLessonRegistry } from "./guidance/registry";
import { HOW_TO_PLAY_CATALOG } from "./guidance/howToPlayCatalog";
import { LEARN_TO_PLAY_JOURNEY, learnToPlayJourneyLifecycle } from "./guidance/learnToPlayJourney";
import { createLearnToPlayFirstMatchOrigin } from "./guidance/learnToPlayHandoff";
import { guidedProgressStore } from "./guidance/progress";
import { productMatchLifecycle } from "./history/historyRuntime";

// The conditional imports are compile-time: release builds remove every developer module instead
// of merely hiding their entry buttons.
const PlaygroundScreen = import.meta.env.DEV
  ? lazy(() => import("./playground/PlaygroundScreen").then((module) => ({ default: module.PlaygroundScreen })))
  : undefined;
const AudioLabScreen = import.meta.env.DEV
  ? lazy(() => import("./audio-lab/AudioLabScreen").then((module) => ({ default: module.AudioLabScreen })))
  : undefined;
const SeedExplorerScreen = import.meta.env.DEV
  ? lazy(() => import("./seed-explorer/SeedExplorerScreen").then((module) => ({ default: module.SeedExplorerScreen })))
  : undefined;
const UIReferenceScreen = import.meta.env.DEV
  ? lazy(() => import("./ui-reference/UIReferenceScreen").then((module) => ({ default: module.UIReferenceScreen })))
  : undefined;

type AppScreen =
  | "start"
  | "deckInspector"
  | "game"
  | "tutorial"
  | "journey"
  | "playground"
  | "audioLab"
  | "seedExplorer"
  | "uiReference";

type LaunchTransitionState = {
  id: number;
  chronicleDeckId: string;
  hostDeckId: string;
  gameMode: GameMode;
  startedAtMs: number;
  reducedMotion: boolean;
  historySettled: Promise<unknown>;
};

type BoardOvertureState = {
  id: number;
  seed: string;
  dialPending: boolean;
  startsAtMs: number;
  phase: "sigil" | "overlap";
  handReady: boolean;
  sigilComplete: boolean;
};

type DestinyTransitionState = {
  id: number;
  kind: DestinyTransitionKind;
  seed: string;
  origin?: MatchOrigin;
  destination: "standard" | "history-replay" | "learn-to-play-first-seed";
};

/** La Mano empieza a subir mientras el último rastro del signo termina de apagarse. */
const BOARD_OVERTURE_HAND_DELAY_MS = 650;

const subscribeGuidedLifecycle = (listener: () => void) => guidedProductLifecycle.subscribe(listener);
const readGuidedLifecycle = () => guidedProductLifecycle.snapshot();
const subscribeJourneyLifecycle = (listener: () => void) => learnToPlayJourneyLifecycle.subscribe(listener);
const readJourneyLifecycle = () => learnToPlayJourneyLifecycle.snapshot();
const subscribeMatchLifecycle = (listener: () => void) => productMatchLifecycle.subscribe(listener);
const readMatchLifecycle = () => productMatchLifecycle.snapshot();

export default function App() {
  const t = useTranslation();
  const reset = useGameStore((state) => state.reset);
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playSfx = useAudioStore((state) => state.playSfx);
  const stopMusic = useAudioStore((state) => state.stopMusic);
  const pushToast = useToastStore((state) => state.pushToast);
  const [screen, setScreen] = useState<AppScreen>("start");
  const [playerName, setPlayerName] = useState(() => readStoredPlayerName());
  const [bootRevision, setBootRevision] = useState(0);
  const [loading, setLoading] = useState(() => !hasPreloadedGameAssets());
  const [loadingLeaving, setLoadingLeaving] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<{ percent: number; label: LoadingLabel }>({ percent: 0, label: "opening" });
  const [requestInitialName, setRequestInitialName] = useState(() => !hasCompletedOnboarding());
  const [setupTurns, setSetupTurns] = useState(3);
  const [selectedDeckId, setSelectedDeckId] = useState(playerInspectableDecks[0].id);
  const [selectedHostDeckId, setSelectedHostDeckId] = useState(hostInspectableDecks[0].id);
  const [inspectorDeckId, setInspectorDeckId] = useState(playerInspectableDecks[0].id);
  const [menuReturnScreen, setMenuReturnScreen] = useState<"home" | "setup" | "chaos" | "chronicles" | "hosts">("home");
  const [preserveMenuMusic, setPreserveMenuMusic] = useState(false);
  const [launchTransition, setLaunchTransition] = useState<LaunchTransitionState | null>(null);
  /* Obertura del tablero: el signo del Futuro aparece sellado sobre el Campo desnudo cuando
     el encuentro empieza a abrirse y le entrega el instrumento de grados. Vive aquí porque el
     lanzamiento ya se secuencia en App; `Board` sólo se entera de en qué fase está. */
  const [boardOverture, setBoardOverture] = useState<BoardOvertureState | null>(null);
  const [destinyTransition, setDestinyTransition] = useState<DestinyTransitionState | null>(null);
  const [matchOrigin, setMatchOrigin] = useState<MatchOrigin | null>(null);
  const launchIdRef = useRef(0);
  const destinyIdRef = useRef(0);
  const destinyTransitionRef = useRef<DestinyTransitionState | null>(null);
  const resolvedDestinyIdRef = useRef<number | null>(null);
  const navigationPendingRef = useRef(false);
  const seenHistoryWarningRevisionRef = useRef(0);
  const [desktopResume, setDesktopResume] = useState<DesktopResumeLoad>({ status: "none" });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [requiredTutorialOffered, setRequiredTutorialOffered] = useState(false);
  const [learnToPlayIntroOpen, setLearnToPlayIntroOpen] = useState(false);
  const guidedLifecycle = useSyncExternalStore(subscribeGuidedLifecycle, readGuidedLifecycle, readGuidedLifecycle);
  const journeyLifecycle = useSyncExternalStore(subscribeJourneyLifecycle, readJourneyLifecycle, readJourneyLifecycle);
  const matchLifecycle = useSyncExternalStore(subscribeMatchLifecycle, readMatchLifecycle, readMatchLifecycle);
  // The generic lesson gate remains available, but the current catalog contains only optional
  // Preparation. Learn to Play does not enter first-open gating until its later handoff phase.
  const requiredLesson = IS_DEV ? undefined : guidedProductLifecycle.nextRequiredLesson();
  const boardSessionPolicy = screen === "tutorial"
    ? GUIDED_LESSON_BOARD_SESSION
    : screen === "journey"
      ? LEARN_TO_PLAY_BOARD_SESSION
      : NORMAL_BOARD_SESSION;
  const clearResumeForProduct = useCallback(() => {
    void productResumeRuntime.clear().catch(() => undefined);
    if (productResumeRuntime.enabled) setDesktopResume({ status: "none" });
  }, []);

  useEffect(() => {
    return registerDesktopLifecycle();
  }, []);

  useEffect(() => {
    void productMatchLifecycle.initialize();
  }, []);

  useEffect(() => {
    if (!matchLifecycle.lastWarning) return;
    if (matchLifecycle.warningRevision <= seenHistoryWarningRevisionRef.current) return;
    seenHistoryWarningRevisionRef.current = matchLifecycle.warningRevision;
    const messageKey = matchLifecycle.lastWarning.kind === "begin"
      ? "toast.historyBeginNotDurable"
      : matchLifecycle.lastWarning.kind === "close"
        ? "toast.historyCloseNotDurable"
        : "toast.historyUnavailable";
    pushToast({
      title: t("toast.historyNotDurable"),
      message: t(messageKey),
      tone: "warning",
    });
  }, [matchLifecycle.lastWarning, matchLifecycle.warningRevision, pushToast, t]);

  useEffect(() => {
    let active = true;
    void productResumeRuntime.load()
      .then((resume) => {
        if (active) setDesktopResume(resume);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!productResumeRuntime.enabled || !boardSessionPolicy.autosave || screen !== "game") return;
    return productResumeRuntime.startCheckpointing({ setupTurns, playerName });
  }, [boardSessionPolicy, playerName, screen, setupTurns]);

  useEffect(() => {
    let active = true;
    let dispose: (() => void) | undefined;
    const disposeGuidedProgress = initializeGuidedProgressPersistence();
    void initializeDesktopPreferences()
      .then((cleanup) => {
        if (active) {
          dispose = cleanup;
          setPreferencesReady(true);
        } else cleanup();
      })
      .catch(() => {
        if (active) setPreferencesReady(true);
      });
    return () => {
      active = false;
      dispose?.();
      disposeGuidedProgress();
    };
  }, []);

  useEffect(() => {
    const disableBrowserHistory = (root: ParentNode) => {
      if (root instanceof HTMLFormElement) root.setAttribute("autocomplete", "off");
      if (root instanceof HTMLInputElement || root instanceof HTMLTextAreaElement) {
        const textLike = root instanceof HTMLTextAreaElement || ["text", "search", "email", "password", "url", "tel"].includes((root as HTMLInputElement).type);
        root.setAttribute("autocomplete", textLike ? "one-time-code" : "off");
        root.setAttribute("data-lpignore", "true");
        root.setAttribute("data-1p-ignore", "true");
      }
      root.querySelectorAll("form").forEach((form) => form.setAttribute("autocomplete", "off"));
      root.querySelectorAll("input, textarea").forEach((field) => {
        const input = field as HTMLInputElement;
        const textLike = field instanceof HTMLTextAreaElement || ["text", "search", "email", "password", "url", "tel"].includes(input.type);
        field.setAttribute("autocomplete", textLike ? "one-time-code" : "off");
        field.setAttribute("data-lpignore", "true");
        field.setAttribute("data-1p-ignore", "true");
      });
    };

    disableBrowserHistory(document);
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) disableBrowserHistory(node);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!loading) return;
    let active = true;
    const startedAt = Date.now();
    setLoading(true);
    setLoadingLeaving(false);
    setLoadingProgress({ percent: 0, label: "opening" });
    void preloadGameAssets((progress) => {
      if (active) setLoadingProgress({ percent: progress.percent, label: progress.label });
    }).then(() => {
      markGameAssetsPreloaded();
      const remaining = Math.max(0, 1050 - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (!active) return;
        setLoadingProgress({ percent: 100, label: "ready" });
        setRequestInitialName(!hasCompletedOnboarding());
        setPlayerName(readStoredPlayerName());
        setLoading(false);
        setLoadingLeaving(true);
        window.setTimeout(() => {
          if (!active) return;
          setLoadingLeaving(false);
        }, 520);
      }, remaining);
    });
    return () => { active = false; };
  }, [bootRevision]);

  useEffect(() => {
    if (loading) return;
    void preloadGameAssets(() => undefined);
  }, [loading]);

  useEffect(() => {
    if (!launchTransition) return;
    const { id, reducedMotion, startedAtMs, historySettled } = launchTransition;
    let active = true;
    const timers = new Set<number>();
    const remainingUntil = (offsetMs: number) => Math.max(0, startedAtMs + offsetMs - performance.now());
    const waitUntil = (offsetMs: number) => new Promise<void>((resolve) => {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        resolve();
      }, remainingUntil(offsetMs));
      timers.add(timer);
    });
    void Promise.all([
      historySettled,
      waitUntil(reducedMotion ? 80 : ENCOUNTER_IMPACT_MS),
    ]).then(async () => {
      if (!active) return;
      startBattleMusic(true);
      setScreen("game");
      await waitUntil(reducedMotion ? 180 : ENCOUNTER_TRANSITION_MS);
      if (!active) return;
      setLaunchTransition((current) => (current?.id === id ? null : current));
    });
    return () => {
      active = false;
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [launchTransition, startBattleMusic]);

  /* Al entregar el aro, signo, HUD y Mano se solapan de forma deliberada. La bandera de
     final evita desmontar el shader antes de su último frame si la Mano llega primero. */
  useEffect(() => {
    if (boardOverture?.phase !== "overlap" || boardOverture.handReady) return;
    const id = boardOverture.id;
    const timer = window.setTimeout(() => {
      setBoardOverture((current) => {
        if (current?.id !== id) return current;
        return current.sigilComplete ? null : { ...current, handReady: true };
      });
    }, BOARD_OVERTURE_HAND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [boardOverture?.handReady, boardOverture?.id, boardOverture?.phase]);

  /* Salir del tablero a mitad de la obertura la deja pendiente, y la siguiente partida
     montaría con el HUD apagado. Mientras existe `launchTransition` seguimos en el menú a
     propósito: la obertura ya está armada para el primer render del tablero. */
  useEffect(() => {
    if (screen === "game" || launchTransition) return;
    setBoardOverture(null);
  }, [launchTransition, screen]);

  useEffect(() => {
    if (loading || !preferencesReady || requestInitialName || requiredTutorialOffered || screen !== "start") return;
    if (!requiredLesson) return;
    setRequiredTutorialOffered(true);
    launchGuidedLesson(requiredLesson.id);
  }, [guidedLifecycle.cursor, loading, preferencesReady, requestInitialName, requiredLesson, requiredTutorialOffered, screen]);

  useEffect(() => {
    if (screen !== "tutorial" || guidedLifecycle.status !== "completed") return;
    setPreserveMenuMusic(false);
    setMenuReturnScreen("home");
    setScreen("start");
  }, [guidedLifecycle.status, screen]);

  function launchGuidedLesson(lessonId: string) {
    const lesson = guidedLessonRegistry.require(lessonId);
    setSetupTurns(lesson.scenario.setupTurnsTotal);
    setPreserveMenuMusic(false);
    setMatchOrigin(null);
    stopMusic();
    guidedProductLifecycle.start(lesson.id);
    setScreen("tutorial");
    startBattleMusic(true);
  }

  function restartGuidedLesson() {
    guidedProductLifecycle.restart();
  }

  function launchLearnToPlayJourney() {
    setLearnToPlayIntroOpen(true);
  }

  function beginLearnToPlayJourney() {
    setSetupTurns(LEARN_TO_PLAY_JOURNEY.setupTurns);
    setPreserveMenuMusic(false);
    setMatchOrigin(null);
    if (!learnToPlayJourneyLifecycle.start()) return;
    setLearnToPlayIntroOpen(false);
    stopMusic();
    setScreen("journey");
    startBattleMusic(true);
  }

  function restartLearnToPlayJourney() {
    learnToPlayJourneyLifecycle.restart();
  }

  const beginDestinyTransition = useCallback((
    kind: DestinyTransitionKind,
    destination: DestinyTransitionState["destination"] = "standard",
    requestedOrigin?: MatchOrigin,
  ): boolean => {
    if (destinyTransitionRef.current) return false;
    const gameStore = useGameStore.getState();
    const origin = destination === "history-replay"
      ? requestedOrigin
      : destination === "standard"
        ? matchOrigin ?? undefined
        : undefined;
    if (kind === "rewrite" && !origin) return false;
    gameStore.stopGamePresentation();
    const transition = {
      id: ++destinyIdRef.current,
      kind,
      seed: origin ? matchOriginVisualSeed(origin) : gameStore.game.seed,
      origin,
      destination,
    };
    destinyTransitionRef.current = transition;
    resolvedDestinyIdRef.current = null;
    setDestinyTransition(transition);
    return true;
  }, [matchOrigin]);

  const resolveDestinyTransition = useCallback((transitionId: number, release: () => void) => {
    const transition = destinyTransitionRef.current;
    if (!transition || transition.id !== transitionId || resolvedDestinyIdRef.current === transitionId) {
      release();
      return;
    }
    resolvedDestinyIdRef.current = transitionId;
    void (async () => {
      try {
        if (transition.kind === "rewrite") {
          if (!transition.origin) return;
          await productMatchLifecycle.closeActive("rewrite");
          if (destinyTransitionRef.current?.id !== transitionId) return;
          const origin = transition.origin;
          if (transition.destination === "history-replay") {
            clearResumeForProduct();
            setPreserveMenuMusic(false);
            stopMusic();
          }
          const launch = productMatchLifecycle.beginLaunch({
            source: transition.destination === "history-replay" ? "history-replay" : "rewrite",
            sessionKind: origin.rngSeed === "developer" ? "developer" : "normal",
            origin,
            commit: () => reset(
              origin.rngSeed,
              origin.preparationTurns,
              origin.playerDeckId,
              origin.hostDeckId,
              origin.difficulty,
              origin.gameMode,
            ),
          });
          if (!launch.committed) return;
          setMatchOrigin(origin);
          setSetupTurns(origin.preparationTurns);
          setSelectedDeckId(origin.playerDeckId);
          setSelectedHostDeckId(origin.hostDeckId);
          if (transition.destination === "history-replay") setScreen("game");
          await launch.settled;
          startBattleMusic(true);
          return;
        }

        await productMatchLifecycle.closeActive("contemplate");
        if (destinyTransitionRef.current?.id !== transitionId) return;
        if (transition.destination === "learn-to-play-first-seed") {
          clearResumeForProduct();
          setPreserveMenuMusic(false);
          const origin = createLearnToPlayFirstMatchOrigin();
          const launch = productMatchLifecycle.beginLaunch({
            source: "learn-to-play-handoff",
            sessionKind: "normal",
            origin,
            commit: () => reset(
              origin.rngSeed,
              origin.preparationTurns,
              origin.playerDeckId,
              origin.hostDeckId,
              origin.difficulty,
              origin.gameMode,
            ),
          });
          if (!launch.committed) return;
          setMatchOrigin(origin);
          setSetupTurns(origin.preparationTurns);
          setSelectedDeckId(origin.playerDeckId);
          setSelectedHostDeckId(origin.hostDeckId);
          setScreen("game");
          await launch.settled;
          startBattleMusic(true);
          return;
        }

        clearResumeForProduct();
        setPreserveMenuMusic(false);
        setMatchOrigin(null);
        setMenuReturnScreen("setup");
        setScreen("start");
      } finally {
        release();
      }
    })();
  }, [clearResumeForProduct, reset, startBattleMusic, stopMusic]);

  const completeDestinyTransition = useCallback((transitionId: number) => {
    if (destinyTransitionRef.current?.id !== transitionId) return;
    destinyTransitionRef.current = null;
    resolvedDestinyIdRef.current = null;
    setDestinyTransition((current) => (current?.id === transitionId ? null : current));
  }, []);

  function continueLearnToPlayIntoFirstCanonFuture() {
    if (!beginDestinyTransition("contemplate", "learn-to-play-first-seed")) return;
    // Clicking the CTA is the authored completion boundary. The board remains mounted beneath
    // the vortex until `onCovered` replaces it with the new, normal Future.
    learnToPlayJourneyLifecycle.stop();
    guidedProgressStore.markJourneyCompleted(LEARN_TO_PLAY_JOURNEY.id, LEARN_TO_PLAY_JOURNEY.revision);
  }

  function leaveGuidedLesson() {
    guidedProductLifecycle.stop();
    setPreserveMenuMusic(false);
    setMatchOrigin(null);
    setMenuReturnScreen("home");
    setScreen("start");
  }

  function leaveLearnToPlayJourney() {
    learnToPlayJourneyLifecycle.stop();
    setPreserveMenuMusic(false);
    setMatchOrigin(null);
    setMenuReturnScreen("home");
    setScreen("start");
  }

  const returnNormalMatchToMenu = useCallback(() => {
    if (navigationPendingRef.current) return;
    navigationPendingRef.current = true;
    void productMatchLifecycle.closeActive("menu").then(() => {
      clearResumeForProduct();
      setPreserveMenuMusic(false);
      setMatchOrigin(null);
      setMenuReturnScreen("home");
      setScreen("start");
    }).finally(() => {
      navigationPendingRef.current = false;
    });
  }, [clearResumeForProduct]);

  if (loading || !preferencesReady) {
    return <GameLoadingScreen percent={loading ? loadingProgress.percent : 100} label={loading ? loadingProgress.label : "ready"} leaving={loadingLeaving} />;
  }

  const transitionOverlay = launchTransition ? (
    <EncounterTransition
      key={`encounter-${launchTransition.id}`}
      chronicleDeckId={launchTransition.chronicleDeckId}
      hostDeckId={launchTransition.hostDeckId}
      gameMode={launchTransition.gameMode}
    />
  ) : null;
  const destinyTransitionOverlay = destinyTransition ? (
    <DestinyRewriteTransition
      key={`destiny-${destinyTransition.id}`}
      transitionId={destinyTransition.id}
      kind={destinyTransition.kind}
      seed={destinyTransition.seed}
      onCovered={resolveDestinyTransition}
      onComplete={completeDestinyTransition}
    />
  ) : null;

  if (screen === "playground" && PlaygroundScreen) {
    return (
      // A plain dark hold, not the game's loading screen: the playground chunk resolves in a frame
      // or two, and flashing the full boot art on the way into a developer tool reads like the game
      // is starting over.
      <Suspense fallback={<div className="playground-chunk-fallback" />}>
        <AudioClickListener />
        <PlaygroundScreen
          onReturnToMenu={() => {
            setPreserveMenuMusic(false);
            setMenuReturnScreen("home");
            setScreen("start");
          }}
        />
      </Suspense>
    );
  }

  if (screen === "audioLab" && AudioLabScreen) {
    return (
      <Suspense fallback={<div className="playground-chunk-fallback" />}>
        <AudioLabScreen
          onReturnToMenu={() => {
            setPreserveMenuMusic(false);
            setMenuReturnScreen("home");
            setScreen("start");
          }}
        />
      </Suspense>
    );
  }

  if (screen === "seedExplorer" && SeedExplorerScreen) {
    return (
      <Suspense fallback={<div className="playground-chunk-fallback" />}>
        <AudioClickListener />
        <SeedExplorerScreen
          onReturnToMenu={() => {
            setPreserveMenuMusic(false);
            setMenuReturnScreen("home");
            setScreen("start");
          }}
        />
      </Suspense>
    );
  }

  if (screen === "uiReference" && UIReferenceScreen) {
    return (
      <Suspense fallback={<div className="playground-chunk-fallback" />}>
        <AudioClickListener />
        <UIReferenceScreen
          onReturnToMenu={() => {
            setPreserveMenuMusic(false);
            setMenuReturnScreen("home");
            setScreen("start");
          }}
        />
      </Suspense>
    );
  }

  if (screen === "deckInspector") {
    return (
      <>
        <AudioClickListener />
        <DeckInspector
          deck={findInspectableDeck(inspectorDeckId)}
          backLabel={menuReturnScreen === "chronicles" ? "Chronicles" : menuReturnScreen === "hosts" ? "Hosts" : menuReturnScreen === "chaos" ? "Chaos" : "Play"}
          onBack={() => setScreen("start")}
        />
        {transitionOverlay}
      </>
    );
  }

  if (screen === "start") {
    const howToPlayEntries: readonly HowToPlayMenuEntry[] = HOW_TO_PLAY_CATALOG.map((entry) => {
      if (entry.launcher.kind === "guided-lesson") {
        const lesson = guidedLessonRegistry.find(entry.launcher.lessonId);
        return {
          ...entry,
          onLaunch: lesson ? () => {
            setRequiredTutorialOffered(true);
            launchGuidedLesson(lesson.id);
          } : undefined,
        };
      }
      return {
        ...entry,
        onLaunch: launchLearnToPlayJourney,
      };
    });
    return (
      <>
        <AudioClickListener />
        <StartMenu
          decks={playerInspectableDecks}
          selectedDeckId={selectedDeckId}
          onSelectDeck={setSelectedDeckId}
          onOpenDeck={(deckId) => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen(playerInspectableDecks.some((deck) => deck.id === deckId) ? "chronicles" : "hosts");
            setInspectorDeckId(deckId);
            setScreen("deckInspector");
          }}
          onViewDeck={(returnScreen = "setup") => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen(returnScreen);
            setInspectorDeckId(selectedDeckId);
            setScreen("deckInspector");
          }}
          hostDecks={hostInspectableDecks}
          selectedHostDeckId={selectedHostDeckId}
          onSelectHostDeck={setSelectedHostDeckId}
          onViewHostDeck={(returnScreen = "setup") => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen(returnScreen);
            setInspectorDeckId(selectedHostDeckId);
            setScreen("deckInspector");
          }}
          initialScreen={menuReturnScreen}
          preserveMusicOnMount={preserveMenuMusic}
          requestInitialName={requestInitialName}
          onNameSaved={(name) => {
            setPlayerName(name);
            setRequestInitialName(false);
          }}
          onOpenPlayground={IS_DEV ? () => {
            stopMusic();
            setScreen("playground");
          } : undefined}
          onOpenAudioLab={IS_DEV ? () => {
            stopMusic();
            setScreen("audioLab");
          } : undefined}
          onOpenSeedExplorer={IS_DEV ? () => {
            stopMusic();
            setScreen("seedExplorer");
          } : undefined}
          onOpenUiReference={IS_DEV ? () => {
            stopMusic();
            setScreen("uiReference");
          } : undefined}
          howToPlayEntries={howToPlayEntries}
          resumeEnabled={productResumeRuntime.enabled}
          resumeStatus={desktopResume.status}
          continueDisabled={Boolean(requiredLesson)}
          onContinue={productResumeRuntime.enabled && !requiredLesson && desktopResume.save ? () => {
            const save = desktopResume.save!;
            const deckIds = resumeDeckIds(save);
            const restoredGame = restoreResumeGame(save);
            const restoredOrigin = createOpaqueMatchOrigin({
              rngSeed: restoredGame.seed,
              playerDeckKey: save.playerDeckKey,
              hostDeckKey: save.hostDeckKey,
              difficulty: restoredGame.difficulty,
              preparationTurns: save.setupTurns,
              gameMode: restoredGame.gameMode,
              deterministicRevision: `resume-v${save.formatVersion}`,
            });
            stopMusic();
            setPlayerName(save.playerName);
            setSetupTurns(save.setupTurns);
            setSelectedDeckId(deckIds.playerDeckId);
            setSelectedHostDeckId(deckIds.hostDeckId);
            setMatchOrigin(restoredOrigin);
            loadScenario(restoredGame, deckIds);
            setDesktopResume({ status: "none" });
            setScreen("game");
            startBattleMusic(true);
          } : undefined}
          onDiscardResume={productResumeRuntime.enabled && desktopResume.status === "corrupt"
            ? clearResumeForProduct
            : undefined}
          onReplayFuture={(origin) => {
            void beginDestinyTransition("rewrite", "history-replay", origin);
          }}
          onRestartFirstTime={() => {
            setRequiredTutorialOffered(false);
            setScreen("start");
            setMenuReturnScreen("home");
            setPreserveMenuMusic(false);
            setLoading(true);
            setBootRevision((revision) => revision + 1);
          }}
          onStart={(options) => {
            if (requiredLesson) {
              setRequiredTutorialOffered(true);
              launchGuidedLesson(requiredLesson.id);
              return;
            }
            clearResumeForProduct();
            setPreserveMenuMusic(false);
            setPlayerName(options.playerName);
            setMatchOrigin(options.origin);
            setSetupTurns(options.origin.preparationTurns);
            setSelectedDeckId(options.origin.playerDeckId);
            setSelectedHostDeckId(options.origin.hostDeckId);
            stopMusic();
            playSfx("draw");
            playSfx("playMonsterHeavy", { rate: 0.92 });
            const launch = productMatchLifecycle.beginLaunch({
              source: "play",
              sessionKind: options.origin.rngSeed === "developer" ? "developer" : "normal",
              origin: options.origin,
              commit: () => reset(
                options.origin.rngSeed,
                options.origin.preparationTurns,
                options.origin.playerDeckId,
                options.origin.hostDeckId,
                options.origin.difficulty,
                options.origin.gameMode,
              ),
            });
            if (!launch.committed) return;
            const id = ++launchIdRef.current;
            const startedAtMs = performance.now();
            const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            /* Se arma en el mismo evento que crea la partida, antes de que pueda existir un
               primer render del tablero. `id` impide que un callback viejo cierre otra
               obertura y el reloj absoluto la ancla a la apertura real de las cortinas. */
            setBoardOverture(reducedMotion ? null : {
              id,
              seed: matchOriginVisualSeed(options.origin),
              dialPending: true,
              startsAtMs: startedAtMs + ENCOUNTER_OPEN_MS,
              phase: "sigil",
              handReady: false,
              sigilComplete: false,
            });
            setLaunchTransition({
              id,
              chronicleDeckId: options.origin.playerDeckId,
              hostDeckId: options.origin.hostDeckId,
              gameMode: options.origin.gameMode,
              startedAtMs,
              reducedMotion,
              historySettled: launch.settled,
            });
          }}
        />
        <LearnToPlayIntroModal
          open={learnToPlayIntroOpen}
          chroniclerName={playerName}
          onClose={() => setLearnToPlayIntroOpen(false)}
          onComplete={beginLearnToPlayJourney}
        />
        {transitionOverlay}
        {destinyTransitionOverlay}
        {loadingLeaving && <GameLoadingScreen percent={100} label="ready" leaving />}
      </>
    );
  }

  return (
    <>
      <AudioClickListener />
      <Board
        key={gameSessionId}
        playerName={playerName}
        matchOrigin={screen === "game" ? matchOrigin ?? undefined : undefined}
        setupTurns={setupTurns}
        encounterEntering={Boolean(launchTransition)}
        overtureActive={boardOverture?.phase === "sigil"}
        overtureSettling={boardOverture?.phase === "overlap"}
        overtureHandPending={Boolean(boardOverture && !boardOverture.handReady)}
        overtureDialPending={Boolean(boardOverture?.dialPending)}
        outcomePersistenceReady={productMatchLifecycle.outcomeReady(`game:${gameSessionId}`)}
        sessionPolicy={boardSessionPolicy}
        tutorialInterrupted={screen === "tutorial" && (guidedLifecycle.status === "aborted" || guidedLifecycle.status === "failed")}
        tutorialErrorMessage={screen === "tutorial" ? guidedLifecycle.errorMessage : journeyLifecycle.errorMessage}
        onRestartTutorial={screen === "tutorial"
          ? restartGuidedLesson
          : screen === "journey"
            ? restartLearnToPlayJourney
            : undefined}
        onRewriteFuture={screen === "game" ? () => beginDestinyTransition("rewrite") : undefined}
        onContemplateFuture={screen === "game"
          ? () => beginDestinyTransition("contemplate")
          : screen === "journey"
            ? continueLearnToPlayIntoFirstCanonFuture
            : undefined}
        onReturnToMenu={screen === "tutorial"
          ? leaveGuidedLesson
          : screen === "journey"
            ? leaveLearnToPlayJourney
            : returnNormalMatchToMenu}
      />
      {/* Conserva el mismo slot que ocupa junto a StartMenu. Si la obertura se insertara
          antes, React remontaría EncounterTransition al revelar Board y el choque empezaría
          por segunda vez mientras el signo ya corre con el reloj original. */}
      {transitionOverlay}
      {boardOverture && !boardOverture.sigilComplete && (
        <ChronicleSigilOverture
          key={`overture-${boardOverture.id}`}
          seed={boardOverture.seed}
          startsAtMs={boardOverture.startsAtMs}
          onDialReady={() => {
            const id = boardOverture.id;
            setBoardOverture((current) => (
              current?.id === id
                ? { ...current, dialPending: false, phase: "overlap" }
                : current
            ));
          }}
          onComplete={() => {
            const id = boardOverture.id;
            setBoardOverture((current) => {
              if (current?.id !== id) return current;
              return current.handReady
                ? null
                : { ...current, dialPending: false, sigilComplete: true };
            });
          }}
        />
      )}
      {destinyTransitionOverlay}
    </>
  );
}

import { Suspense, lazy, useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { DestinyRewriteTransition, type DestinyTransitionKind } from "./components/DestinyRewriteTransition";
import { ENCOUNTER_IMPACT_MS, ENCOUNTER_TRANSITION_MS, EncounterTransition } from "./components/EncounterTransition";
import { GameLoadingScreen } from "./components/GameLoadingScreen";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hostInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import type { GameMode } from "./engine/GameTypes";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";
import { IS_DEV } from "./utils/devMode";
import { hasCompletedOnboarding, hasPreloadedGameAssets, markGameAssetsPreloaded, readStoredPlayerName } from "./utils/appPersistence";
import { preloadGameAssets, type LoadingLabel } from "./utils/assetPreloader";
import { registerDesktopLifecycle } from "./platform/desktopLifecycle";
import { initializeDesktopPreferences } from "./persistence/desktopPreferences";
import {
  deleteDesktopResume,
  loadDesktopResume,
  resumeDeckIds,
  startDesktopResumeCheckpointing,
  type DesktopResumeLoad,
} from "./persistence/resumeService";
import { restoreResumeGame } from "./persistence/resumeSave";
import { initializeGuidedProgressPersistence } from "./persistence/guidedProgressPersistence";
import { guidedProductLifecycle } from "./guidance/productRuntime";
import { BASIC_TUTORIAL_LESSON_ID, guidedLessonRegistry } from "./guidance/registry";

// The conditional imports are compile-time: release builds remove both developer modules instead
// of merely hiding their entry buttons.
const PlaygroundScreen = import.meta.env.DEV
  ? lazy(() => import("./playground/PlaygroundScreen").then((module) => ({ default: module.PlaygroundScreen })))
  : undefined;
const AudioLabScreen = import.meta.env.DEV
  ? lazy(() => import("./audio-lab/AudioLabScreen").then((module) => ({ default: module.AudioLabScreen })))
  : undefined;

type AppScreen = "start" | "deckInspector" | "game" | "tutorial" | "playground" | "audioLab";

const subscribeGuidedLifecycle = (listener: () => void) => guidedProductLifecycle.subscribe(listener);
const readGuidedLifecycle = () => guidedProductLifecycle.snapshot();

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const loadScenario = useGameStore((state) => state.loadScenario);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playSfx = useAudioStore((state) => state.playSfx);
  const stopMusic = useAudioStore((state) => state.stopMusic);
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
  const [launchTransition, setLaunchTransition] = useState<{
    chronicleDeckId: string;
    hostDeckId: string;
    gameMode: GameMode;
  } | null>(null);
  const [destinyTransition, setDestinyTransition] = useState<{
    kind: DestinyTransitionKind;
    seed: string;
  } | null>(null);
  const [desktopResume, setDesktopResume] = useState<DesktopResumeLoad>({ status: "none" });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [requiredTutorialOffered, setRequiredTutorialOffered] = useState(false);
  const guidedLifecycle = useSyncExternalStore(subscribeGuidedLifecycle, readGuidedLifecycle, readGuidedLifecycle);
  // Development keeps required lessons opt-in so reloads never interrupt iteration. Release builds
  // preserve the mandatory first-run gate.
  const requiredLesson = IS_DEV ? undefined : guidedProductLifecycle.nextRequiredLesson();
  const basicTutorialLesson = guidedLessonRegistry.find(BASIC_TUTORIAL_LESSON_ID);

  useEffect(() => {
    return registerDesktopLifecycle();
  }, []);

  useEffect(() => {
    let active = true;
    void loadDesktopResume()
      .then((resume) => {
        if (active) setDesktopResume(resume);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (screen !== "game") return;
    return startDesktopResumeCheckpointing({ setupTurns, playerName });
  }, [playerName, screen, setupTurns]);

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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealTimeout = window.setTimeout(() => {
      startBattleMusic(true);
      setScreen("game");
    }, reducedMotion ? 80 : ENCOUNTER_IMPACT_MS);
    const finishTimeout = window.setTimeout(() => {
      setLaunchTransition(null);
    }, reducedMotion ? 180 : ENCOUNTER_TRANSITION_MS);
    return () => {
      window.clearTimeout(revealTimeout);
      window.clearTimeout(finishTimeout);
    };
  }, [launchTransition, startBattleMusic]);

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
    stopMusic();
    guidedProductLifecycle.start(lesson.id);
    setScreen("tutorial");
    startBattleMusic(true);
  }

  function restartGuidedLesson() {
    guidedProductLifecycle.restart();
  }

  const beginDestinyTransition = useCallback((kind: DestinyTransitionKind) => {
    if (destinyTransition) return;
    const gameStore = useGameStore.getState();
    gameStore.stopGamePresentation();
    setDestinyTransition({ kind, seed: gameStore.game.seed });
  }, [destinyTransition]);

  const resolveDestinyTransition = useCallback(() => {
    if (!destinyTransition) return;
    if (destinyTransition.kind === "rewrite") {
      reset(destinyTransition.seed, setupTurns);
      startBattleMusic(true);
      return;
    }

    void deleteDesktopResume();
    setDesktopResume({ status: "none" });
    setPreserveMenuMusic(false);
    setMenuReturnScreen("setup");
    setScreen("start");
  }, [destinyTransition, reset, setupTurns, startBattleMusic]);

  const completeDestinyTransition = useCallback(() => {
    setDestinyTransition(null);
  }, []);

  function leaveGuidedLesson() {
    guidedProductLifecycle.stop();
    setPreserveMenuMusic(false);
    setMenuReturnScreen("home");
    setScreen("start");
  }

  if (loading || !preferencesReady) {
    return <GameLoadingScreen percent={loading ? loadingProgress.percent : 100} label={loading ? loadingProgress.label : "ready"} leaving={loadingLeaving} />;
  }

  const transitionOverlay = launchTransition ? (
    <EncounterTransition
      chronicleDeckId={launchTransition.chronicleDeckId}
      hostDeckId={launchTransition.hostDeckId}
      gameMode={launchTransition.gameMode}
    />
  ) : null;
  const destinyTransitionOverlay = destinyTransition ? (
    <DestinyRewriteTransition
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
          onOpenBasicTutorial={basicTutorialLesson ? () => {
            setRequiredTutorialOffered(true);
            launchGuidedLesson(basicTutorialLesson.id);
          } : undefined}
          resumeStatus={requiredLesson ? "none" : desktopResume.status}
          onContinue={!requiredLesson && desktopResume.save ? () => {
            const save = desktopResume.save!;
            const deckIds = resumeDeckIds(save);
            stopMusic();
            setPlayerName(save.playerName);
            setSetupTurns(save.setupTurns);
            setSelectedDeckId(deckIds.playerDeckId);
            setSelectedHostDeckId(deckIds.hostDeckId);
            loadScenario(restoreResumeGame(save), deckIds);
            setDesktopResume({ status: "none" });
            setScreen("game");
            startBattleMusic(true);
          } : undefined}
          onDiscardResume={desktopResume.status === "corrupt" ? () => {
            void deleteDesktopResume();
            setDesktopResume({ status: "none" });
          } : undefined}
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
            void deleteDesktopResume();
            setDesktopResume({ status: "none" });
            setPreserveMenuMusic(false);
            setPlayerName(options.playerName);
            setSetupTurns(options.setupTurns);
            stopMusic();
            playSfx("draw");
            playSfx("playMonsterHeavy", { rate: 0.92 });
            reset(
              options.seed,
              options.setupTurns,
              selectedDeckId,
              selectedHostDeckId,
              options.mode,
              options.gameMode,
            );
            setLaunchTransition({
              chronicleDeckId: selectedDeckId,
              hostDeckId: selectedHostDeckId,
              gameMode: options.gameMode,
            });
          }}
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
        setupTurns={setupTurns}
        encounterEntering={Boolean(launchTransition)}
        sessionKind={screen === "tutorial" ? "tutorial" : "normal"}
        tutorialInterrupted={screen === "tutorial" && (guidedLifecycle.status === "aborted" || guidedLifecycle.status === "failed")}
        tutorialErrorMessage={guidedLifecycle.errorMessage}
        onRestartTutorial={screen === "tutorial" ? restartGuidedLesson : undefined}
        onRewriteFuture={screen === "game" ? () => beginDestinyTransition("rewrite") : undefined}
        onContemplateFuture={screen === "game" ? () => beginDestinyTransition("contemplate") : undefined}
        onReturnToMenu={screen === "tutorial" ? leaveGuidedLesson : () => {
          void deleteDesktopResume();
          setDesktopResume({ status: "none" });
          setPreserveMenuMusic(false);
          setMenuReturnScreen("home");
          setScreen("start");
        }}
      />
      {transitionOverlay}
      {destinyTransitionOverlay}
    </>
  );
}

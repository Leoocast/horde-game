import { Suspense, lazy, useEffect, useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { EncounterTransition } from "./components/EncounterTransition";
import { GameLoadingScreen } from "./components/GameLoadingScreen";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hostInspectableDecks, playerInspectableDecks, type EncounterTone } from "./data/deckCatalog";
import type { GameMode } from "./engine/GameTypes";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";
import { IS_DEV } from "./utils/devMode";
import { hasCompletedOnboarding, hasPreloadedGameAssets, markGameAssetsPreloaded, readStoredPlayerName } from "./utils/appPersistence";
import { preloadGameAssets, type LoadingLabel } from "./utils/assetPreloader";

// Split into its own chunk behind IS_DEV. Because IS_DEV also reads the URL at runtime it can't be
// statically eliminated, so the chunk is still emitted — production simply never requests it.
const PlaygroundScreen = lazy(() => import("./playground/PlaygroundScreen").then((module) => ({ default: module.PlaygroundScreen })));
const AudioLabScreen = lazy(() => import("./audio-lab/AudioLabScreen").then((module) => ({ default: module.AudioLabScreen })));

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playSfx = useAudioStore((state) => state.playSfx);
  const stopMusic = useAudioStore((state) => state.stopMusic);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game" | "playground" | "audioLab">("start");
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
    chronicleName: string;
    chronicleTheme: string;
    hostName: string;
    hostTheme: string;
    encounterTone: EncounterTone;
    gameMode: GameMode;
  } | null>(null);

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
    }, reducedMotion ? 80 : 1050);
    const finishTimeout = window.setTimeout(() => {
      setLaunchTransition(null);
    }, reducedMotion ? 180 : 2450);
    return () => {
      window.clearTimeout(revealTimeout);
      window.clearTimeout(finishTimeout);
    };
  }, [launchTransition, startBattleMusic]);

  if (loading) return <GameLoadingScreen percent={loadingProgress.percent} label={loadingProgress.label} leaving={loadingLeaving} />;

  const transitionOverlay = launchTransition ? (
    <EncounterTransition
      chronicleName={launchTransition.chronicleName}
      chronicleTheme={launchTransition.chronicleTheme}
      hostName={launchTransition.hostName}
      hostTheme={launchTransition.hostTheme}
      encounterTone={launchTransition.encounterTone}
      gameMode={launchTransition.gameMode}
    />
  ) : null;

  if (screen === "playground" && IS_DEV) {
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

  if (screen === "audioLab" && IS_DEV) {
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
          onRestartFirstTime={() => {
            setScreen("start");
            setMenuReturnScreen("home");
            setPreserveMenuMusic(false);
            setLoading(true);
            setBootRevision((revision) => revision + 1);
          }}
          onStart={(options) => {
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
            const transitionHostDeck = hostInspectableDecks.find((deck) => deck.id === selectedHostDeckId);
            const transitionPlayerDeck = playerInspectableDecks.find((deck) => deck.id === selectedDeckId);
            setLaunchTransition({
              chronicleName: transitionPlayerDeck?.deck.name ?? "The Chronicle",
              chronicleTheme: transitionPlayerDeck?.presentation.theme ?? "ramp",
              hostName: transitionHostDeck?.deck.name ?? "The Host",
              hostTheme: transitionHostDeck?.presentation.theme ?? "zombie",
              encounterTone: transitionHostDeck?.presentation.encounterTone ?? "undead",
              gameMode: options.gameMode,
            });
          }}
        />
        {transitionOverlay}
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
        onReturnToMenu={() => {
          setPreserveMenuMusic(false);
          setMenuReturnScreen("home");
          setScreen("start");
        }}
      />
      {transitionOverlay}
    </>
  );
}

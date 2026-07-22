import { useEffect, useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { EncounterTransition } from "./components/EncounterTransition";
import { GameLoadingScreen } from "./components/GameLoadingScreen";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hordeInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID } from "./data/decks";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";
import { hasCompletedOnboarding, hasPreloadedGameAssets, markGameAssetsPreloaded, readStoredPlayerName } from "./utils/appPersistence";
import { preloadGameAssets } from "./utils/assetPreloader";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const gameSessionId = useGameStore((state) => state.gameSessionId);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playCollection = useAudioStore((state) => state.playCollection);
  const playSfx = useAudioStore((state) => state.playSfx);
  const stopMusic = useAudioStore((state) => state.stopMusic);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game">("start");
  const [playerName, setPlayerName] = useState(() => readStoredPlayerName());
  const [bootRevision, setBootRevision] = useState(0);
  const [loading, setLoading] = useState(() => !hasPreloadedGameAssets());
  const [loadingLeaving, setLoadingLeaving] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ percent: 0, label: "Opening the ancient gates" });
  const [requestInitialName, setRequestInitialName] = useState(() => !hasCompletedOnboarding());
  const [setupTurns, setSetupTurns] = useState(3);
  const [selectedDeckId, setSelectedDeckId] = useState(playerInspectableDecks[0].id);
  const [selectedHordeDeckId, setSelectedHordeDeckId] = useState(hordeInspectableDecks[0].id);
  const [inspectorDeckId, setInspectorDeckId] = useState(playerInspectableDecks[0].id);
  const [menuReturnScreen, setMenuReturnScreen] = useState<"home" | "setup" | "chaos" | "decks">("home");
  const [preserveMenuMusic, setPreserveMenuMusic] = useState(false);
  const [launchTransition, setLaunchTransition] = useState<{
    playerName: string;
    hordeName: string;
    hordeDeckId: string;
    tutorial: boolean;
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
    setLoadingProgress({ percent: 0, label: "Opening the ancient gates" });
    void preloadGameAssets((progress) => {
      if (active) setLoadingProgress({ percent: progress.percent, label: progress.label });
    }).then(() => {
      markGameAssetsPreloaded();
      const remaining = Math.max(0, 1050 - (Date.now() - startedAt));
      window.setTimeout(() => {
        if (!active) return;
        setLoadingProgress({ percent: 100, label: "The chronicle awaits" });
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
      if (launchTransition.tutorial) {
        playCollection("battleTheme1");
      } else {
        startBattleMusic(true);
      }
      setScreen("game");
    }, reducedMotion ? 80 : 1050);
    const finishTimeout = window.setTimeout(() => {
      playSfx("skipNextBattle", { volume: 0.72 });
      setLaunchTransition(null);
    }, reducedMotion ? 180 : 2450);
    return () => {
      window.clearTimeout(revealTimeout);
      window.clearTimeout(finishTimeout);
    };
  }, [launchTransition, playCollection, playSfx, startBattleMusic]);

  if (loading) return <GameLoadingScreen percent={loadingProgress.percent} label={loadingProgress.label} leaving={loadingLeaving} />;

  const transitionOverlay = launchTransition ? (
    <EncounterTransition
      playerName={launchTransition.playerName}
      hordeName={launchTransition.hordeName}
      hordeDeckId={launchTransition.hordeDeckId}
    />
  ) : null;

  if (screen === "deckInspector") {
    return (
      <>
        <AudioClickListener />
        <DeckInspector deck={findInspectableDeck(inspectorDeckId)} onBack={() => setScreen("start")} />
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
            setMenuReturnScreen("decks");
            setInspectorDeckId(deckId);
            setScreen("deckInspector");
          }}
          onViewDeck={(returnScreen = "setup") => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen(returnScreen);
            setInspectorDeckId(selectedDeckId);
            setScreen("deckInspector");
          }}
          hordeDecks={hordeInspectableDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={setSelectedHordeDeckId}
          onViewHordeDeck={(returnScreen = "setup") => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen(returnScreen);
            setInspectorDeckId(selectedHordeDeckId);
            setScreen("deckInspector");
          }}
          initialScreen={menuReturnScreen}
          preserveMusicOnMount={preserveMenuMusic}
          requestInitialName={requestInitialName}
          onNameSaved={(name) => {
            setPlayerName(name);
            setRequestInitialName(false);
          }}
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
            playSfx("draw", { volume: 0.82 });
            playSfx("playMonsterHeavy", { volume: 0.78, rate: 0.92 });
            const isTutorial = options.seed.trim().toLowerCase() === "tutorial";
            reset(
              options.seed,
              options.setupTurns,
              isTutorial ? DEFAULT_PLAYER_DECK_ID : selectedDeckId,
              isTutorial ? DEFAULT_HORDE_DECK_ID : selectedHordeDeckId,
              options.mode,
              options.gameMode,
            );
            setLaunchTransition({
              playerName: options.playerName,
              hordeName: hordeInspectableDecks.find((deck) => deck.id === selectedHordeDeckId)?.deck.name ?? "The Horde",
              hordeDeckId: selectedHordeDeckId,
              tutorial: isTutorial,
            });
          }}
        />
        {transitionOverlay}
        {loadingLeaving && <GameLoadingScreen percent={100} label="The chronicle awaits" leaving />}
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

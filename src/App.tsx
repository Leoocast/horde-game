import { useEffect, useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { EncounterTransition } from "./components/EncounterTransition";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hordeInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID } from "./data/decks";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playCollection = useAudioStore((state) => state.playCollection);
  const playSfx = useAudioStore((state) => state.playSfx);
  const stopMusic = useAudioStore((state) => state.stopMusic);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game">("start");
  const [playerName, setPlayerName] = useState("Player");
  const [setupTurns, setSetupTurns] = useState(3);
  const [selectedDeckId, setSelectedDeckId] = useState(playerInspectableDecks[0].id);
  const [selectedHordeDeckId, setSelectedHordeDeckId] = useState(hordeInspectableDecks[0].id);
  const [inspectorDeckId, setInspectorDeckId] = useState(playerInspectableDecks[0].id);
  const [menuReturnScreen, setMenuReturnScreen] = useState<"home" | "setup" | "decks">("home");
  const [preserveMenuMusic, setPreserveMenuMusic] = useState(false);
  const [launchTransition, setLaunchTransition] = useState<{
    playerName: string;
    hordeName: string;
    hordeDeckId: string;
    tutorial: boolean;
  } | null>(null);

  useEffect(() => {
    if (!launchTransition) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const revealTimeout = window.setTimeout(() => {
      if (launchTransition.tutorial) playCollection("battleTheme1");
      else startBattleMusic(true);
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
          onViewDeck={() => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen("setup");
            setInspectorDeckId(selectedDeckId);
            setScreen("deckInspector");
          }}
          hordeDecks={hordeInspectableDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={setSelectedHordeDeckId}
          onViewHordeDeck={() => {
            setPreserveMenuMusic(true);
            setMenuReturnScreen("setup");
            setInspectorDeckId(selectedHordeDeckId);
            setScreen("deckInspector");
          }}
          initialScreen={menuReturnScreen}
          preserveMusicOnMount={preserveMenuMusic}
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
      </>
    );
  }

  return (
    <>
      <AudioClickListener />
      <Board
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

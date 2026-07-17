import { useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hordeInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import { DEFAULT_HORDE_DECK_ID, DEFAULT_PLAYER_DECK_ID } from "./data/decks";
import { useAudioStore } from "./store/useAudioStore";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const startBattleMusic = useAudioStore((state) => state.startBattleMusic);
  const playCollection = useAudioStore((state) => state.playCollection);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game">("start");
  const [playerName, setPlayerName] = useState("Player");
  const [setupTurns, setSetupTurns] = useState(3);
  const [selectedDeckId, setSelectedDeckId] = useState(playerInspectableDecks[0].id);
  const [selectedHordeDeckId, setSelectedHordeDeckId] = useState(hordeInspectableDecks[0].id);
  const [inspectorDeckId, setInspectorDeckId] = useState(playerInspectableDecks[0].id);
  const [preserveMenuMusic, setPreserveMenuMusic] = useState(false);

  if (screen === "deckInspector") {
    return (
      <>
        <AudioClickListener />
        <DeckInspector deck={findInspectableDeck(inspectorDeckId)} onBack={() => setScreen("start")} />
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
            setInspectorDeckId(deckId);
            setScreen("deckInspector");
          }}
          onViewDeck={() => {
            setPreserveMenuMusic(true);
            setInspectorDeckId(selectedDeckId);
            setScreen("deckInspector");
          }}
          hordeDecks={hordeInspectableDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={setSelectedHordeDeckId}
          onViewHordeDeck={() => {
            setPreserveMenuMusic(true);
            setInspectorDeckId(selectedHordeDeckId);
            setScreen("deckInspector");
          }}
          preserveMusicOnMount={preserveMenuMusic}
          onStart={(options) => {
            setPreserveMenuMusic(false);
            setPlayerName(options.playerName);
            setSetupTurns(options.setupTurns);
            const isTutorial = options.seed.trim().toLowerCase() === "tutorial";
            reset(
              options.seed,
              options.setupTurns,
              isTutorial ? DEFAULT_PLAYER_DECK_ID : selectedDeckId,
              isTutorial ? DEFAULT_HORDE_DECK_ID : selectedHordeDeckId,
            );
            if (options.seed.trim().toLowerCase() === "tutorial") playCollection("battleTheme1");
            else startBattleMusic(true);
            setScreen("game");
          }}
        />
      </>
    );
  }

  return (
    <>
      <AudioClickListener />
      <Board
        playerName={playerName}
        setupTurns={setupTurns}
        onReturnToMenu={() => {
          setPreserveMenuMusic(false);
          setScreen("start");
        }}
      />
    </>
  );
}

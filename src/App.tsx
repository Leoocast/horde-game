import { useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, hordeInspectableDecks, playerInspectableDecks } from "./data/deckCatalog";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game">("start");
  const [playerName, setPlayerName] = useState("Player");
  const [setupTurns, setSetupTurns] = useState(4);
  const [selectedDeckId, setSelectedDeckId] = useState(playerInspectableDecks[0].id);
  const [selectedHordeDeckId, setSelectedHordeDeckId] = useState(hordeInspectableDecks[0].id);
  const [inspectorDeckId, setInspectorDeckId] = useState(playerInspectableDecks[0].id);

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
          onViewDeck={() => {
            setInspectorDeckId(selectedDeckId);
            setScreen("deckInspector");
          }}
          hordeDecks={hordeInspectableDecks}
          selectedHordeDeckId={selectedHordeDeckId}
          onSelectHordeDeck={setSelectedHordeDeckId}
          onViewHordeDeck={() => {
            setInspectorDeckId(selectedHordeDeckId);
            setScreen("deckInspector");
          }}
          onStart={(options) => {
            setPlayerName(options.playerName);
            setSetupTurns(options.setupTurns);
            reset(options.seed, options.setupTurns);
            setScreen("game");
          }}
        />
      </>
    );
  }

  return (
    <>
      <AudioClickListener />
      <Board playerName={playerName} setupTurns={setupTurns} onReturnToMenu={() => setScreen("start")} />
    </>
  );
}

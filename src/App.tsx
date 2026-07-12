import { useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { DeckInspector } from "./components/DeckInspector";
import { StartMenu } from "./components/StartMenu";
import { findInspectableDeck, inspectableDecks } from "./data/deckCatalog";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const seed = useGameStore((state) => state.seed);
  const [screen, setScreen] = useState<"start" | "deckInspector" | "game">("start");
  const [playerName, setPlayerName] = useState("Player");
  const [setupTurns, setSetupTurns] = useState(4);
  const [selectedDeckId, setSelectedDeckId] = useState(inspectableDecks[0].id);

  if (screen === "deckInspector") {
    return (
      <>
        <AudioClickListener />
        <DeckInspector deck={findInspectableDeck(selectedDeckId)} onBack={() => setScreen("start")} />
      </>
    );
  }

  if (screen === "start") {
    return (
      <>
        <AudioClickListener />
        <StartMenu
          initialSeed={seed}
          decks={inspectableDecks}
          selectedDeckId={selectedDeckId}
          onSelectDeck={setSelectedDeckId}
          onViewDeck={() => setScreen("deckInspector")}
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
      <Board playerName={playerName} setupTurns={setupTurns} />
    </>
  );
}

import { useState } from "react";
import { Board } from "./components/Board";
import { StartMenu, type DifficultyMode } from "./components/StartMenu";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const seed = useGameStore((state) => state.seed);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("Player");
  const [mode, setMode] = useState<DifficultyMode>("normal");
  const [setupTurns, setSetupTurns] = useState(3);

  if (!started) {
    return (
      <StartMenu
        onStart={(options) => {
          setPlayerName(options.playerName);
          setMode(options.mode);
          setSetupTurns(options.setupTurns);
          reset(seed, options.setupTurns);
          setStarted(true);
        }}
      />
    );
  }

  return <Board playerName={playerName} mode={mode} setupTurns={setupTurns} />;
}

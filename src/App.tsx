import { useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
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
      <>
        <AudioClickListener />
        <StartMenu
          onStart={(options) => {
            setPlayerName(options.playerName);
            setMode(options.mode);
            setSetupTurns(options.setupTurns);
            reset(seed, options.setupTurns);
            setStarted(true);
          }}
        />
      </>
    );
  }

  return (
    <>
      <AudioClickListener />
      <Board playerName={playerName} mode={mode} setupTurns={setupTurns} />
    </>
  );
}

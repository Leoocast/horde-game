import { useState } from "react";
import { AudioClickListener } from "./components/AudioClickListener";
import { Board } from "./components/Board";
import { StartMenu } from "./components/StartMenu";
import { useGameStore } from "./store/useGameStore";

export default function App() {
  const reset = useGameStore((state) => state.reset);
  const seed = useGameStore((state) => state.seed);
  const [started, setStarted] = useState(false);
  const [playerName, setPlayerName] = useState("Player");
  const [setupTurns, setSetupTurns] = useState(3);

  if (!started) {
    return (
      <>
        <AudioClickListener />
        <StartMenu
          initialSeed={seed}
          onStart={(options) => {
            setPlayerName(options.playerName);
            setSetupTurns(options.setupTurns);
            reset(options.seed, options.setupTurns);
            setStarted(true);
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

import { useCallback, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { VictoryConstellationAnimator } from "./VictoryConstellationAnimator";
import { GameOutcomeDialog } from "./GameOutcomeDialog";

type Props = {
  game: GameState;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function VictoryModal({ game, onRewriteFuture, onContemplateFuture }: Props) {
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  // El desenlace se nombra cuando la figura ya cerró, no en un reloj propio.
  const revealOutcome = useCallback(() => setRevealed(true), []);

  return (
    <div className={`game-result-overlay game-result-victory fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <VictoryConstellationAnimator seed={game.seed} onSequenceStart={startSequence} onVerdict={revealOutcome} />

      {/* El bloque se centra con una capa a pantalla completa, no con un `translate` propio: la
          succión del vórtice anima `transform` sobre cada pieza de la escena y borraría ese
          desplazamiento, dejando el desenlace descolgado hacia abajo y a la derecha. */}
      {revealed && (
        <GameOutcomeDialog
          game={game}
          tone="victory"
          onRewriteFuture={onRewriteFuture}
          onContemplateFuture={onContemplateFuture}
        />
      )}
    </div>
  );
}

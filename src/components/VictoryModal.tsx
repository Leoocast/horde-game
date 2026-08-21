import { useCallback, useState } from "react";
import { matchOriginVisualSeed, type MatchOrigin } from "../content/MatchOrigin";
import type { GameState } from "../engine/GameTypes";
import { VictoryConstellationAnimator } from "./VictoryConstellationAnimator";
import { GameOutcomeDialog } from "./GameOutcomeDialog";

type Props = {
  game: GameState;
  matchOrigin: MatchOrigin;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function VictoryModal({ game, matchOrigin, onRewriteFuture, onContemplateFuture }: Props) {
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  // El desenlace se nombra cuando la figura ya cerró, no en un reloj propio.
  const revealOutcome = useCallback(() => setRevealed(true), []);

  return (
    <div className={`game-result-overlay game-result-victory fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <VictoryConstellationAnimator seed={matchOriginVisualSeed(matchOrigin)} onSequenceStart={startSequence} onVerdict={revealOutcome} />

      {/* El bloque se centra con una capa a pantalla completa, no con un `translate` propio: la
          succión del vórtice anima `transform` sobre cada pieza de la escena y borraría ese
          desplazamiento, dejando el desenlace descolgado hacia abajo y a la derecha. */}
      {revealed && (
        <GameOutcomeDialog
          game={game}
          matchOrigin={matchOrigin}
          tone="victory"
          onRewriteFuture={onRewriteFuture}
          onContemplateFuture={onContemplateFuture}
        />
      )}
    </div>
  );
}

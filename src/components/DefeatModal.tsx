import { useCallback, useState } from "react";
import { matchOriginVisualSeed, type MatchOrigin } from "../content/MatchOrigin";
import type { GameState } from "../engine/GameTypes";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";
import { GameOutcomeDialog } from "./GameOutcomeDialog";

type Props = {
  game: GameState;
  matchOrigin: MatchOrigin;
  snapshotImage?: HTMLImageElement;
  onRewriteFuture: () => void;
  onContemplateFuture: () => void;
};

export function DefeatModal({ game, matchOrigin, snapshotImage, onRewriteFuture, onContemplateFuture }: Props) {
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  // El desenlace se nombra cuando el vidrio ya reventó, no en un reloj propio.
  const revealOutcome = useCallback(() => setRevealed(true), []);

  return (
    <div className={`game-result-overlay game-result-defeat fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <DefeatShatterAnimator seed={matchOriginVisualSeed(matchOrigin)} snapshotImage={snapshotImage} onSequenceStart={startSequence} onBurst={revealOutcome} />

      {/* El bloque se centra con una capa a pantalla completa, no con un `translate` propio:
          la succión del vórtice anima `transform` sobre cada pieza de la escena y borraría
          ese desplazamiento, dejando el desenlace descolgado hacia abajo y a la derecha. */}
      {revealed && (
        <GameOutcomeDialog
          game={game}
          matchOrigin={matchOrigin}
          tone="defeat"
          onRewriteFuture={onRewriteFuture}
          onContemplateFuture={onContemplateFuture}
        />
      )}
    </div>
  );
}

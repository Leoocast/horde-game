import { useCallback, useEffect, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { DefeatShatterAnimator } from "./DefeatShatterAnimator";
import {
  LearnToPlayDefeatNarrativeDialog,
  LearnToPlayDefeatOutcomeDialog,
} from "./LearnToPlayDefeatDialogs";

type Props = Readonly<{
  game: GameState;
  snapshotImage?: HTMLImageElement;
  onContemplateFuture: () => void;
}>;

const LEARN_TO_PLAY_NARRATIVE_DELAY_MS = 2_000;

/** The normal defeat remains intact; the authored narration and its CTA arrive afterward. */
export function LearnToPlayDefeatModal({ game, snapshotImage, onContemplateFuture }: Props) {
  const [sequenceStarted, setSequenceStarted] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [narrativeVisible, setNarrativeVisible] = useState(false);
  const [narrativeAcknowledged, setNarrativeAcknowledged] = useState(false);
  const narrativeTimerRef = useRef<number | undefined>(undefined);
  const startSequence = useCallback(() => setSequenceStarted(true), []);
  const revealOutcome = useCallback(() => {
    setRevealed(true);
    if (narrativeTimerRef.current !== undefined) return;
    narrativeTimerRef.current = window.setTimeout(() => {
      narrativeTimerRef.current = undefined;
      setNarrativeVisible(true);
    }, LEARN_TO_PLAY_NARRATIVE_DELAY_MS);
  }, []);

  useEffect(() => () => {
    if (narrativeTimerRef.current !== undefined) window.clearTimeout(narrativeTimerRef.current);
  }, []);

  const narrativeOpen = narrativeVisible && !narrativeAcknowledged;

  return (
    <div className={`game-result-overlay game-result-defeat fixed inset-0 z-[140] ${sequenceStarted ? "is-sequence-running" : ""}`}>
      <DefeatShatterAnimator
        seed={game.seed}
        snapshotImage={snapshotImage}
        onSequenceStart={startSequence}
        onBurst={revealOutcome}
      />

      {revealed && (
        <LearnToPlayDefeatOutcomeDialog
          narrativeOpen={narrativeOpen}
          narrativeAcknowledged={narrativeAcknowledged}
          onContemplateFuture={onContemplateFuture}
        />
      )}

      {narrativeOpen && (
        <LearnToPlayDefeatNarrativeDialog onContinue={() => setNarrativeAcknowledged(true)} />
      )}
    </div>
  );
}

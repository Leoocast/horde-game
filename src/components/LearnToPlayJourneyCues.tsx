import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  guidedAnchorRegistry,
  guidedBoundsEqual,
  guidedCardAnchorKey,
  guidedDirectionalCueBounds,
  paddedGuidedRect,
  type GuidedBounds,
} from "../guidance";
import { learnToPlayDirector } from "../guidance/learnToPlayJourney";
import { useGameStore } from "../store/useGameStore";
import { TutorialDirectionalCueGlyph } from "./TutorialDirectionalCue";
import { createGuidedFrameLoop } from "./guidedFrameLoop";

const subscribeDirector = (listener: () => void) => learnToPlayDirector.subscribe(listener);
const readDirector = () => learnToPlayDirector.snapshot();
const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();

/** Non-blocking authored suggestion: it never owns input, so click and drag retain normal combat behavior. */
export function LearnToPlayJourneyCues() {
  const director = useSyncExternalStore(subscribeDirector, readDirector, readDirector);
  const anchors = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const game = useGameStore((state) => state.game);
  const [bounds, setBounds] = useState<GuidedBounds>();
  const boundsRef = useRef<GuidedBounds | undefined>(undefined);
  const cardId = director.stage === "opening-attack" ? director.suggestedAttackerId : undefined;
  const visible = Boolean(
    cardId
    && game.activeSide === "player"
    && game.phase === "combat"
    && !game.combat.playerAttackers.includes(cardId),
  );
  const element = useMemo(
    () => cardId ? guidedAnchorRegistry.preferred(guidedCardAnchorKey(cardId)) : undefined,
    [anchors.revision, cardId],
  );

  useLayoutEffect(() => {
    if (!visible || !element) {
      if (boundsRef.current) {
        boundsRef.current = undefined;
        setBounds(undefined);
      }
      return;
    }
    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const next = guidedDirectionalCueBounds(paddedGuidedRect("learn-to-play:maela", "origin", rect, 0));
        if (!guidedBoundsEqual(boundsRef.current, next)) {
          boundsRef.current = next;
          setBounds(next);
        }
      }
    };
    const loop = createGuidedFrameLoop(measure);
    loop.start();
    return () => loop.stop();
  }, [element, visible]);

  if (!visible || !bounds || typeof document === "undefined") return null;
  return createPortal(
    <span
      className="guided-tutorial-directional-cue learn-to-play-journey-cue"
      data-tone="attack"
      data-direction="up"
      style={bounds}
      aria-hidden="true"
    >
      <TutorialDirectionalCueGlyph />
    </span>,
    document.body,
  );
}

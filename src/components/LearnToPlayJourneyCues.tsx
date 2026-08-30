import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  guidedAnchorRegistry,
  guidedBoundsEqual,
  guidedCardAnchorKey,
  guidedDirectionalCueBounds,
  paddedGuidedRect,
  guidedSurfaceAnchorKey,
  type GuidedAnchorKey,
  type GuidedBounds,
} from "../guidance";
import { contextualTutorialRuntime } from "../guidance/contextualProductRuntime";
import { learnToPlayDirector } from "../guidance/learnToPlayJourney";
import { learnToPlayPlayerTurnActionCueReady } from "../guidance/learnToPlayDirector";
import { useGameStore } from "../store/useGameStore";
import { TutorialDirectionalCueGlyph } from "./TutorialDirectionalCue";
import { createGuidedFrameLoop } from "./guidedFrameLoop";

const subscribeDirector = (listener: () => void) => learnToPlayDirector.subscribe(listener);
const readDirector = () => learnToPlayDirector.snapshot();
const subscribeContextual = (listener: () => void) => contextualTutorialRuntime.subscribe(listener);
const readContextual = () => contextualTutorialRuntime.snapshot();
const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();

/** Non-blocking authored suggestion: it never owns input, so click and drag retain normal combat behavior. */
export function LearnToPlayJourneyCues() {
  const director = useSyncExternalStore(subscribeDirector, readDirector, readDirector);
  const contextual = useSyncExternalStore(subscribeContextual, readContextual, readContextual);
  const anchors = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const game = useGameStore((state) => state.game);
  const [bounds, setBounds] = useState<GuidedBounds>();
  const boundsRef = useRef<GuidedBounds | undefined>(undefined);
  const cardId = director.stage === "opening-attack" ? director.suggestedAttackerId : undefined;
  const attackCueVisible = Boolean(
    cardId
    && game.activeSide === "player"
    && game.phase === "combat"
    && !game.combat.playerAttackers.includes(cardId),
  );
  const contextualHelpPending = Boolean(contextual.active) || contextual.queue.length > 0;
  const playerTurnCueVisible = learnToPlayPlayerTurnActionCueReady(game, director.stage, contextualHelpPending);
  const cueKind = attackCueVisible ? "attack" : playerTurnCueVisible ? "player-turn" : undefined;
  const cueKey: GuidedAnchorKey | undefined = attackCueVisible && cardId
    ? guidedCardAnchorKey(cardId)
    : playerTurnCueVisible
      ? guidedSurfaceAnchorKey("phase.primaryAction")
      : undefined;
  const visible = Boolean(cueKind && cueKey);
  const element = useMemo(
    () => cueKey ? guidedAnchorRegistry.preferred(cueKey) : undefined,
    [anchors.revision, cueKey],
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
        const next = cueKind === "attack"
          ? guidedDirectionalCueBounds(paddedGuidedRect("learn-to-play:maela", "origin", rect, 0))
          : paddedGuidedRect(cueKey!, "focus", rect, 6);
        if (!guidedBoundsEqual(boundsRef.current, next)) {
          boundsRef.current = next;
          setBounds(next);
        }
      }
    };
    const loop = createGuidedFrameLoop(measure);
    loop.start();
    return () => loop.stop();
  }, [cueKey, cueKind, element, visible]);

  if (!visible || !bounds || typeof document === "undefined") return null;
  if (cueKind === "player-turn") {
    return createPortal(
      <span
        className="guided-tutorial-ring learn-to-play-journey-cue learn-to-play-player-turn-cue"
        data-anchor-key={cueKey}
        data-tone="gold"
        style={bounds}
        aria-hidden="true"
      />,
      document.body,
    );
  }
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

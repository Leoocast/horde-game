import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { localizedCardName } from "../i18n/cardLocalization";
import { useCardDetails } from "../utils/cardImages";

const CARD_WIDTH = 136;
const CARD_HEIGHT = 190;

export function LandPlayAnimator() {
  const language = useLanguageStore((state) => state.language);
  const queue = useGameStore((state) => state.landPlayAnimationQueue);
  const materialize = useGameStore((state) => state.materializeLandPlayAnimation);
  const complete = useGameStore((state) => state.completeLandPlayAnimation);
  const active = queue[0];

  useEffect(() => {
    if (!active || active.materialized) return;
    const timer = window.setTimeout(() => materialize(active.id), 200);
    return () => window.clearTimeout(timer);
  }, [active?.id, active?.materialized, materialize]);

  if (!active) return null;

  return (
    <LandFlight
      key={active.id}
      itemId={active.id}
      definitionId={active.card.definitionId}
      name={localizedCardName(active.card, language)}
      origin={active.origin}
      onComplete={() => complete(active.id)}
    />
  );
}

function LandFlight({ itemId, definitionId, name, origin, onComplete }: {
  itemId: string;
  definitionId: string;
  name: string;
  origin?: { x: number; y: number };
  onComplete: () => void;
}) {
  const { imageUrl } = useCardDetails(definitionId);
  const reduceMotion = useReducedMotion();
  const path = useMemo(() => readLandPlayPath(origin), [itemId, origin]);
  const deltaX = path.target.x - path.origin.x;
  const deltaY = path.target.y - path.origin.y;

  if (reduceMotion) {
    return (
      <motion.span
        className="land-play-impact"
        style={{ left: path.target.x, top: path.target.y }}
        initial={{ opacity: 0, scale: 0.3 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.3, 1, 1.65] }}
        transition={{ duration: 0.24 }}
        onAnimationComplete={onComplete}
      />
    );
  }

  return (
    <motion.div
      className="land-play-flight"
      style={{
        left: path.origin.x - CARD_WIDTH / 2,
        top: path.origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0 }}
      animate={{
        x: deltaX,
        y: deltaY,
      }}
      transition={{ duration: 0.42, ease: [0.3, 0.72, 0.18, 1] }}
      onAnimationComplete={onComplete}
    >
      <motion.div
        className="land-play-card"
        initial={{ opacity: 1, scale: 1, rotate: 0, borderRadius: 7 }}
        animate={{
          opacity: [1, 1, 0.72, 0],
          scale: [1, 0.68, 0.25, 0.08],
          rotate: [0, -3, 8, 16],
          borderRadius: [7, 12, 50, 999],
          filter: ["brightness(1)", "brightness(1.2) saturate(1.12)", "brightness(1.75) saturate(1.35)", "brightness(2) blur(3px)"],
        }}
        transition={{ duration: 0.33, times: [0, 0.28, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
      >
        {imageUrl ? <img src={imageUrl} alt={name} draggable={false} /> : <span>{name}</span>}
      </motion.div>
      <motion.span
        className="land-play-orb"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 1, 1, 0], scale: [0.2, 0.2, 0.78, 1, 1.7] }}
        transition={{ duration: 0.42, times: [0, 0.3, 0.52, 0.86, 1], ease: "easeOut" }}
      />
      <motion.span
        className="land-play-impact"
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 0, 0, 0.92, 0], scale: [0.2, 0.2, 0.2, 0.65, 1.8] }}
        transition={{ duration: 0.42, times: [0, 0.7, 0.8, 0.9, 1], ease: "easeOut" }}
      />
    </motion.div>
  );
}

function readLandPlayPath(capturedOrigin?: { x: number; y: number }): { origin: { x: number; y: number }; target: { x: number; y: number } } {
  const targetRect = document.querySelector<HTMLElement>("[data-player-mana-core='true']")?.getBoundingClientRect();
  const origin = capturedOrigin ?? { x: window.innerWidth / 2, y: window.innerHeight - 120 };
  const target = targetRect
    ? { x: targetRect.left + targetRect.width * 0.466, y: targetRect.top + targetRect.height * 0.48 }
    : { x: 142, y: window.innerHeight - 96 };
  return { origin, target };
}

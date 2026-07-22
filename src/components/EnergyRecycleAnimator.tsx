import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { localizedCardName } from "../i18n/cardLocalization";
import { useCardDetails } from "../utils/cardImages";

const CARD_WIDTH = 146;
const CARD_HEIGHT = 203;

export function EnergyRecycleAnimator() {
  const language = useLanguageStore((state) => state.language);
  const active = useGameStore((state) => state.energyRecycleAnimation);
  const complete = useGameStore((state) => state.completeEnergyRecycleAnimation);

  if (!active) return null;

  return (
    <>
      <div data-audio-click="off" className="fixed inset-0 z-[118]" />
      <EnergyRecycleFlight
        key={active.id}
        itemId={active.id}
        definitionId={active.card.definitionId}
        name={localizedCardName(active.card, language)}
        origin={active.origin}
        onComplete={complete}
      />
    </>
  );
}

function EnergyRecycleFlight({ itemId, definitionId, name, origin, onComplete }: {
  itemId: string;
  definitionId: string;
  name: string;
  origin: { x: number; y: number };
  onComplete: () => void;
}) {
  const { imageUrl } = useCardDetails(definitionId);
  const reduceMotion = useReducedMotion();
  const target = useMemo(readRecycleTarget, [itemId]);
  const deltaX = target.x - origin.x;
  const deltaY = target.y - origin.y;

  return (
    <motion.div
      className="energy-recycle-flight"
      style={{
        left: origin.x - CARD_WIDTH / 2,
        top: origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0, opacity: 1, scale: 1, rotate: 0 }}
      animate={reduceMotion
        ? { x: deltaX, y: deltaY, opacity: 0, scale: 0.2 }
        : {
            x: [0, deltaX * 0.3, deltaX * 0.72, deltaX],
            y: [0, deltaY - 38, deltaY - 30, deltaY],
            opacity: [1, 1, 0.9, 0],
            scale: [1, 0.82, 0.48, 0.12],
            rotate: [0, 5, 15, 28],
            filter: ["brightness(1.12)", "brightness(1.28) saturate(1.1)", "brightness(0.9) saturate(0.8)", "brightness(0.45) blur(2px)"],
          }}
      transition={{ duration: reduceMotion ? 0.18 : 0.56, times: reduceMotion ? undefined : [0, 0.26, 0.76, 1], ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={onComplete}
    >
      {imageUrl ? <img src={imageUrl} alt={name} draggable={false} /> : <span>{name}</span>}
      <span className="energy-recycle-card-sheen" />
    </motion.div>
  );
}

function readRecycleTarget(): { x: number; y: number } {
  const rect = document.querySelector<HTMLElement>("[data-energy-recycle-target='true']")?.getBoundingClientRect();
  return rect
    ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
    : { x: window.innerWidth - 72, y: window.innerHeight - 64 };
}

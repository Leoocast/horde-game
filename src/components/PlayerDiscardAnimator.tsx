import { motion } from "framer-motion";
import { useMemo } from "react";
import { useGameStore } from "../store/useGameStore";
import { useCardDetails } from "../utils/cardImages";

const CARD_WIDTH = 156;
const CARD_HEIGHT = 218;

export function PlayerDiscardAnimator() {
  const queue = useGameStore((state) => state.playerDiscardAnimationQueue);
  const complete = useGameStore((state) => state.completePlayerDiscardAnimation);
  const active = queue[0];

  if (!active) return null;

  return (
    <>
      <div data-audio-click="off" className="fixed inset-0 z-[89]" />
      <PlayerDiscardCard
        key={active.id}
        itemId={active.id}
        definitionId={active.card.definitionId}
        name={active.card.displayName}
        origin={active.origin}
        onComplete={() => complete(active.id)}
      />
    </>
  );
}

function PlayerDiscardCard({ itemId, definitionId, name, origin, onComplete }: { itemId: string; definitionId: string; name: string; origin?: { x: number; y: number }; onComplete: () => void }) {
  const { imageUrl } = useCardDetails(definitionId);
  const path = useMemo(() => readPlayerDiscardPath(origin), [itemId, origin]);
  const deltaX = path.target.x - path.origin.x;
  const deltaY = path.target.y - path.origin.y;

  return (
    <motion.div
      className="pointer-events-none fixed z-[130] overflow-hidden rounded-md border border-[#877b6b]/80 bg-[#161310] shadow-[0_0_24px_rgba(0,0,0,0.78),0_0_18px_rgba(120,110,96,0.28)]"
      style={{
        left: path.origin.x - CARD_WIDTH / 2,
        top: path.origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.24, rotate: -3, filter: "brightness(1.35) saturate(0.95)" }}
      animate={{
        x: [0, deltaX * 0.2, deltaX * 0.65, deltaX],
        y: [0, deltaY - 28, deltaY - 44, deltaY],
        opacity: [0, 1, 1, 0],
        scale: [0.24, 0.54, 0.42, 0.18],
        rotate: [-3, 7, 16, 25],
        filter: ["brightness(1.35) saturate(0.95)", "brightness(1.05) saturate(0.85)", "brightness(0.8) saturate(0.7)", "brightness(0.42) saturate(0.55)"],
      }}
      transition={{ duration: 0.66, times: [0, 0.14, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={onComplete}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full select-none object-cover grayscale-[0.2]" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#211b14] p-2 text-center text-[10px] font-black uppercase text-[#d8d0c2]">{name}</div>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/12 via-transparent to-black/45" />
    </motion.div>
  );
}

function readPlayerDiscardPath(capturedOrigin?: { x: number; y: number }): { origin: { x: number; y: number }; target: { x: number; y: number } } {
  const originRect = document.querySelector<HTMLElement>("[data-player-discard-origin='true']")?.getBoundingClientRect();
  const targetRect = document.querySelector<HTMLElement>("[data-player-discard-target='true']")?.getBoundingClientRect();
  const origin = capturedOrigin ?? (originRect
    ? { x: originRect.left + originRect.width / 2, y: originRect.top + originRect.height / 2 }
    : { x: window.innerWidth - 72, y: window.innerHeight - 58 });
  const target = targetRect
    ? { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
    : { x: origin.x - 96, y: origin.y };
  return { origin, target };
}

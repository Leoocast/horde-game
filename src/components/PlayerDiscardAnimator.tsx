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
        onComplete={() => complete(active.id)}
      />
    </>
  );
}

function PlayerDiscardCard({ itemId, definitionId, name, onComplete }: { itemId: string; definitionId: string; name: string; onComplete: () => void }) {
  const { imageUrl } = useCardDetails(definitionId);
  const origin = useMemo(readPlayerDiscardOrigin, [itemId]);

  return (
    <motion.div
      className="pointer-events-none fixed z-[130] overflow-hidden rounded-md border border-[#877b6b]/80 bg-[#161310] shadow-[0_0_24px_rgba(0,0,0,0.78),0_0_18px_rgba(120,110,96,0.28)]"
      style={{
        left: origin.x - CARD_WIDTH / 2,
        top: origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.68, rotate: 2, filter: "brightness(1.35) saturate(0.95)" }}
      animate={{
        x: [0, 34, 160, 300],
        y: [0, -24, -54, -86],
        opacity: [0, 1, 1, 0],
        scale: [0.68, 1.04, 0.94, 0.72],
        rotate: [2, -5, -18, -36],
        filter: ["brightness(1.35) saturate(0.95)", "brightness(1.05) saturate(0.85)", "brightness(0.8) saturate(0.7)", "brightness(0.42) saturate(0.55)"],
      }}
      transition={{ duration: 0.72, times: [0, 0.22, 0.68, 1], ease: [0.16, 1, 0.3, 1] }}
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

function readPlayerDiscardOrigin(): { x: number; y: number } {
  const rect = document.querySelector<HTMLElement>("[data-player-life-panel='true']")?.getBoundingClientRect();
  if (!rect) return { x: window.innerWidth - 96, y: window.innerHeight - 72 };
  return { x: rect.left + rect.width * 0.5, y: rect.top + rect.height * 0.5 };
}

import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useCardDetails } from "../utils/cardImages";

const CARD_WIDTH = 172;
const CARD_HEIGHT = 240;

export function HordeMillAnimator() {
  const queue = useGameStore((state) => state.hordeMillAnimationQueue);
  const complete = useGameStore((state) => state.completeHordeMillAnimation);
  const playSfx = useAudioStore((state) => state.playSfx);
  const active = queue[0];

  useEffect(() => {
    if (!active) return;
    playSfx("drawOne", { volume: 0.62 });
  }, [active?.id, playSfx]);

  if (!active) return null;

  return (
    <>
      <div data-audio-click="off" className="fixed inset-0 z-[89]" />
      <HordeMillCard key={active.id} itemId={active.id} definitionId={active.card.definitionId} name={active.card.displayName} onComplete={() => complete(active.id)} />
    </>
  );
}

function HordeMillCard({ itemId, definitionId, name, onComplete }: { itemId: string; definitionId: string; name: string; onComplete: () => void }) {
  const { imageUrl } = useCardDetails(definitionId);
  const origin = useMemo(readHordeDeckOrigin, [itemId]);

  return (
    <motion.div
      className="pointer-events-none fixed z-[130] overflow-hidden rounded-md border border-[#d8a154]/80 bg-[#180f09] shadow-[0_0_24px_rgba(0,0,0,0.75),0_0_22px_rgba(216,161,84,0.32)]"
      style={{
        left: origin.x - CARD_WIDTH / 2,
        top: origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.72, rotate: -2, filter: "brightness(1.55) saturate(1.15)" }}
      animate={{
        x: [0, 42, 188, 360],
        y: [0, -18, -44, -86],
        opacity: [0, 1, 1, 0],
        scale: [0.72, 1.04, 0.96, 0.78],
        rotate: [-2, 6, 20, 38],
        filter: ["brightness(1.65) saturate(1.18)", "brightness(1.25) saturate(1.08)", "brightness(1)", "brightness(0.55) saturate(0.75)"],
      }}
      transition={{ duration: 0.72, times: [0, 0.1, 0.64, 1], ease: [0.16, 1, 0.3, 1] }}
      onAnimationComplete={onComplete}
    >
      {imageUrl ? (
        <img src={imageUrl} alt={name} className="h-full w-full select-none object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[#26170d] p-2 text-center text-[10px] font-black uppercase text-[#f6e6b8]">{name}</div>
      )}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/18 via-transparent to-black/35" />
    </motion.div>
  );
}

function readHordeDeckOrigin(): { x: number; y: number } {
  const rect = document.querySelector<HTMLElement>("[data-player-attack-target='horde-deck']")?.getBoundingClientRect();
  if (!rect) return { x: window.innerWidth - 96, y: 104 };
  return { x: rect.left + rect.width * 0.12, y: rect.top + rect.height * 1.18 };
}

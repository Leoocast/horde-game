import { motion } from "framer-motion";
import { useEffect, useMemo } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { localizedCardName } from "../i18n/cardLocalization";
import { useCardDetails } from "../utils/cardImages";

const CARD_WIDTH = 172;
const CARD_HEIGHT = 240;

export function HordeMillAnimator() {
  const language = useLanguageStore((state) => state.language);
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
      <HordeMillCard key={active.id} itemId={active.id} definitionId={active.card.definitionId} name={localizedCardName(active.card, language)} onComplete={() => complete(active.id)} />
    </>
  );
}

function HordeMillCard({ itemId, definitionId, name, onComplete }: { itemId: string; definitionId: string; name: string; onComplete: () => void }) {
  const { imageUrl } = useCardDetails(definitionId);
  const path = useMemo(readHordeMillPath, [itemId]);
  const deltaX = path.target.x - path.origin.x;
  const deltaY = path.target.y - path.origin.y;

  return (
    <motion.div
      className="pointer-events-none fixed z-[130] overflow-hidden rounded-md border border-[#d8a154]/80 bg-[#180f09] shadow-[0_0_24px_rgba(0,0,0,0.75),0_0_22px_rgba(216,161,84,0.32)]"
      style={{
        left: path.origin.x - CARD_WIDTH / 2,
        top: path.origin.y - CARD_HEIGHT / 2,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
      }}
      initial={{ x: 0, y: 0, opacity: 0, scale: 0.24, rotate: 4, filter: "brightness(1.55) saturate(1.15)" }}
      animate={{
        x: [0, deltaX * 0.2, deltaX * 0.65, deltaX],
        y: [0, deltaY - 28, deltaY - 44, deltaY],
        opacity: [0, 1, 1, 0],
        scale: [0.24, 0.54, 0.42, 0.18],
        rotate: [4, -8, -16, -24],
        filter: ["brightness(1.65) saturate(1.18)", "brightness(1.25) saturate(1.08)", "brightness(1)", "brightness(0.55) saturate(0.75)"],
      }}
      transition={{ duration: 0.66, times: [0, 0.14, 0.7, 1], ease: [0.16, 1, 0.3, 1] }}
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

function readHordeMillPath(): { origin: { x: number; y: number }; target: { x: number; y: number } } {
  const originRect = document.querySelector<HTMLElement>("[data-horde-mill-origin='true']")?.getBoundingClientRect();
  const targetRect = document.querySelector<HTMLElement>("[data-horde-mill-target='true']")?.getBoundingClientRect();
  const origin = originRect
    ? { x: originRect.left + originRect.width / 2, y: originRect.top + originRect.height / 2 }
    : { x: window.innerWidth / 2 - 92, y: 42 };
  const target = targetRect
    ? { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 }
    : { x: origin.x - 96, y: origin.y };
  return { origin, target };
}

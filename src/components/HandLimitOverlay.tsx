import { Check, Hand } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { MAX_PLAYER_HAND_SIZE, playerHandOverflow } from "../engine/GameRules";
import type { GameState } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useTranslation } from "../i18n/useTranslation";

export function HandLimitOverlay({ game }: { game: GameState }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const active = useGameStore((state) => state.handLimitDiscardActive);
  const selectedId = useGameStore((state) => state.handLimitSelectionId);
  const selectDiscard = useGameStore((state) => state.selectHandLimitDiscard);
  const confirmDiscard = useGameStore((state) => state.confirmHandLimitDiscard);
  const selected = selectedId ? game.player.hand.find((card) => card.instanceId === selectedId) : undefined;
  const overflow = playerHandOverflow(game);

  return (
    <AnimatePresence>
      {active && overflow > 0 && (
        <>
          <motion.div className="hand-limit-backdrop fixed inset-0 z-[101]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <div className="fixed left-1/2 top-[42%] z-[118] w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2">
          <motion.section
            className="hand-limit-panel old-panel w-full p-4 text-center text-[#eadfbd]"
            initial={{ opacity: 0, y: 24, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 430, damping: 32 }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="hand-limit-title"
          >
            <div className="hand-limit-icon"><Hand size={20} /></div>
            <p className="game-dialog-kicker">{t("hand.endPhaseCount", { current: game.player.hand.length, max: MAX_PLAYER_HAND_SIZE })}</p>
            <h2 id="hand-limit-title" className="old-title mt-1 text-lg uppercase tracking-[0.09em]">{t("hand.discardToSeven")}</h2>
            <p className="mt-2 text-sm text-[#a9aaa0]">{t(overflow === 1 ? "hand.chooseBeforeEnd" : "hand.chooseMultipleBeforeEnd", { count: overflow })}</p>
            <div className="mt-3 flex items-center gap-2">
              <button className="counter-target-button counter-target-cancel" type="button" disabled={!selectedId} onClick={() => selectDiscard(undefined)}>
                {selected ? localizedCardName(selected, language) : t("hand.chooseCard")}
              </button>
              <button className="counter-target-button counter-target-confirm !flex-none !px-5" type="button" disabled={!selectedId} onClick={confirmDiscard} title={t("hand.discardSelected")}>
                <Check size={20} /> {t("hand.discard")}
              </button>
            </div>
          </motion.section>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

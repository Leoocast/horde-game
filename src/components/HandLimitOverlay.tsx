import { Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { playerHandOverflow } from "../engine/GameRules";
import type { GameState } from "../engine/GameTypes";
import { localizedCardName } from "../i18n/cardLocalization";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { useTranslation } from "../i18n/useTranslation";
import { guidedAnchorRegistry, guidedSurfaceAnchorKey } from "../guidance";

export function HandLimitOverlay({ game }: { game: GameState }) {
  const active = useGameStore((state) => state.handLimitDiscardActive);
  const selectedId = useGameStore((state) => state.handLimitSelectionId);
  const selectDiscard = useGameStore((state) => state.selectHandLimitDiscard);
  const confirmDiscard = useGameStore((state) => state.confirmHandLimitDiscard);
  const overflow = playerHandOverflow(game);

  return (
    <AnimatePresence>
      {active && overflow > 0 && (
        <HandLimitModal
          game={game}
          selectedId={selectedId}
          onClearSelection={() => selectDiscard(undefined)}
          onConfirm={confirmDiscard}
        />
      )}
    </AnimatePresence>
  );
}

/** Controlled presentation shared by the live hand-limit flow and UI Reference. */
export function HandLimitModal({ game, selectedId, onClearSelection, onConfirm }: {
  game: GameState;
  selectedId?: string;
  onClearSelection: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const selected = selectedId ? game.player.hand.find((card) => card.instanceId === selectedId) : undefined;
  const overflow = playerHandOverflow(game);
  if (overflow <= 0) return null;

  return (
    <>
      <motion.div className="hand-limit-backdrop fixed inset-0 z-[101]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
      <div className="hand-limit-layer pointer-events-none fixed inset-0 z-[118] grid place-items-center">
        <motion.section
          className="hand-limit-panel pointer-events-auto hf-ui-panel w-[min(500px,calc(100vw-32px))] text-[#eadfbd]"
          initial={{ opacity: 0, y: 24, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 18, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 430, damping: 32 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="hand-limit-title"
        >
          <span className="hand-limit-mark" aria-hidden="true" />
          <header className="hand-limit-heading">
            <h2 id="hand-limit-title" className="hf-ui-title">{t("hand.discardToSeven")}</h2>
            <p>{t(overflow === 1 ? "hand.chooseBeforeEnd" : "hand.chooseMultipleBeforeEnd", { count: overflow })}</p>
          </header>
          <div className="hand-limit-actions">
            <button
              ref={(element) => guidedAnchorRegistry.set(
                guidedSurfaceAnchorKey("selection.cancelAction"),
                "hand-limit:cancel",
                element,
              )}
              className="counter-target-button counter-target-cancel hand-limit-selection-action"
              type="button"
              disabled={!selectedId}
              onClick={onClearSelection}
            >
              {selected ? localizedCardName(selected, language) : t("hand.chooseCard")}
            </button>
            <button
              ref={(element) => guidedAnchorRegistry.set(
                guidedSurfaceAnchorKey("selection.primaryAction"),
                "hand-limit:confirm",
                element,
              )}
              className="counter-target-button counter-target-confirm hand-limit-confirm-action"
              type="button"
              disabled={!selectedId}
              onClick={onConfirm}
              title={t("hand.discardSelected")}
            >
              <Check size={20} /> {t("hand.discard")}
            </button>
          </div>
        </motion.section>
      </div>
    </>
  );
}

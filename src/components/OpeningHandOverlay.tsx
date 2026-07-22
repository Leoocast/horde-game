import { Check, RefreshCcw } from "lucide-react";
import { motion } from "framer-motion";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";

export function OpeningHandOverlay({ game }: { game: GameState }) {
  const t = useTranslation();
  const acceptOpeningHand = useGameStore((state) => state.acceptOpeningHand);
  const mulliganOpeningHand = useGameStore((state) => state.mulliganOpeningHand);
  const canMulligan = game.player.hand.length > 1;

  if (game.openingHandAccepted) return null;

  return (
    <div className="opening-hand-overlay fixed inset-0 z-[420] flex items-center justify-center" role="presentation">
      <section className="opening-hand-layout" role="dialog" aria-modal="true" aria-label={t("mulligan.title")}>
        <div className="opening-hand-cards">
          {game.player.hand.map((card, index) => (
            <motion.div
              key={`${game.mulligansTaken}-${card.instanceId}`}
              className="opening-hand-card-entry"
              initial={{ opacity: 0, y: 26, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: index * 0.055, duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="opening-hand-card">
                <Card
                  game={game}
                  card={card}
                  selectionDisabled
                  suppressCardId
                  suppressContextMenu
                  suppressHoverOverlay
                  darkenOnHover={false}
                  highRes
                  sharpImageOverlay
                />
              </div>
            </motion.div>
          ))}
        </div>

        <div className="opening-hand-actions">
          <button data-audio-click="valid" className="opening-hand-button opening-hand-button-accept" type="button" onClick={acceptOpeningHand}>
            <Check size={18} />
            {t("mulligan.accept")}
          </button>
          <button
            data-audio-click={canMulligan ? "valid" : "off"}
            className="opening-hand-button opening-hand-button-mulligan"
            type="button"
            onClick={mulliganOpeningHand}
            disabled={!canMulligan}
          >
            <RefreshCcw size={17} />
            {t("mulligan.action")}
          </button>
        </div>
      </section>
    </div>
  );
}

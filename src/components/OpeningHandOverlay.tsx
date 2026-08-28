import { Check, RefreshCcw } from "lucide-react";
import { useRef } from "react";
import { UI_FEATURE_FLAGS } from "../config/featureFlags";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { guidedAnchorRegistry, guidedCardAnchorKey, guidedSurfaceAnchorKey } from "../guidance";

export function OpeningHandOverlay({ game }: { game: GameState }) {
  const acceptOpeningHand = useGameStore((state) => state.acceptOpeningHand);
  const mulliganOpeningHand = useGameStore((state) => state.mulliganOpeningHand);
  const committedMulliganRevisionRef = useRef<number | null>(null);

  const rewriteOpeningHand = () => {
    /* Un doble click puede llegar antes del render que incrementa `mulligansTaken`. El commit
       pertenece a esa revisión de la Mano y sólo puede ejecutarse una vez. */
    if (committedMulliganRevisionRef.current === game.mulligansTaken) return;
    committedMulliganRevisionRef.current = game.mulligansTaken;
    mulliganOpeningHand();
  };

  if (game.openingHandAccepted) return null;

  return <OpeningHandModal game={game} onAccept={acceptOpeningHand} onMulligan={rewriteOpeningHand} />;
}

/** Controlled presentation shared by the live opening-hand flow and UI Reference. */
export function OpeningHandModal({ game, onAccept, onMulligan }: {
  game: GameState;
  onAccept: () => void;
  onMulligan: () => void;
}) {
  const t = useTranslation();
  const canMulligan = game.player.hand.length > 1;

  return (
    <div className="opening-hand-overlay fixed inset-0 z-[420] flex items-center justify-center" role="presentation">
      <section className="opening-hand-layout" role="dialog" aria-modal="true" aria-label={t("mulligan.title")}>
        <div
          ref={(element) => guidedAnchorRegistry.set(
            guidedSurfaceAnchorKey("opening.hand"),
            "opening-hand:surface",
            element,
          )}
          className="opening-hand-cards"
        >
          {game.player.hand.map((card, index) => {
            const showFullImage = shouldShowFullCardImage(card.definitionId);
            const useNativeHdRendering =
              showFullImage &&
              UI_FEATURE_FLAGS.useNativeHdHandImageRendering;

            return (
              <div
                key={`${game.mulligansTaken}-${card.instanceId}`}
                className="opening-hand-card-entry"
                style={{ animationDelay: `${index * 55}ms` }}
              >
                <div
                  ref={(element) => guidedAnchorRegistry.set(
                    guidedCardAnchorKey(card.instanceId),
                    `opening-hand:${card.instanceId}`,
                    element,
                  )}
                  className="opening-hand-card"
                >
                  <Card
                    game={game}
                    card={card}
                    selectionDisabled
                    suppressCardId
                    suppressContextMenu
                    suppressHoverOverlay
                    darkenOnHover={false}
                    highRes
                    sharpImageOverlay={!useNativeHdRendering}
                    showFullImage={showFullImage}
                    showCostBadge={showFullImage}
                    clipActionSweep={UI_FEATURE_FLAGS.alignHdHandActionSweep && showFullImage}
                    preferNativeImageRendering={useNativeHdRendering}
                    hideStats={!UI_FEATURE_FLAGS.showDynamicHandCardStats}
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="opening-hand-actions">
          <button
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("opening.primaryAction"),
              "opening-hand:primary-action",
              element,
            )}
            data-audio-click="valid"
            className="opening-hand-button opening-hand-button-accept"
            type="button"
            onClick={onAccept}
          >
            <Check size={18} />
            {t("mulligan.accept")}
          </button>
          <button
            data-audio-click={canMulligan ? "valid" : "off"}
            className="opening-hand-button opening-hand-button-mulligan"
            type="button"
            onClick={onMulligan}
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

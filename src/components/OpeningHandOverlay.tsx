import { Check, RefreshCcw } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { UI_FEATURE_FLAGS } from "../config/featureFlags";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { guidedAnchorRegistry, guidedCardAnchorKey, guidedSurfaceAnchorKey } from "../guidance";
import { firstCanonVisionDirector } from "../guidance/firstCanonVision";

const subscribeFirstCanon = (listener: () => void) => firstCanonVisionDirector.subscribe(listener);
const readFirstCanon = () => firstCanonVisionDirector.snapshot();

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
  const firstCanon = useSyncExternalStore(subscribeFirstCanon, readFirstCanon, readFirstCanon);
  const narrationButtonRef = useRef<HTMLButtonElement>(null);
  const ownsOpening = firstCanon.orderedSequenceActive && !game.openingHandAccepted;
  const openingNarration = ownsOpening && (
    firstCanon.stage === "opening-intro" || firstCanon.stage === "opening-confirmation"
  ) ? firstCanon.narration : undefined;
  const canMulligan = game.player.hand.length > 1
    && (!ownsOpening || firstCanon.stage === "await-mulligan");
  const canAccept = !ownsOpening || firstCanon.stage === "opening-accept";
  const lastCardIndex = game.player.hand.length - 1;

  useEffect(() => {
    if (openingNarration) narrationButtonRef.current?.focus({ preventScroll: true });
  }, [firstCanon.stage, openingNarration]);

  useEffect(() => {
    if (!ownsOpening || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      firstCanonVisionDirector.notifyOpeningCardsSettled(game.mulligansTaken);
    }
  }, [game.mulligansTaken, ownsOpening]);

  return (
    <div className="opening-hand-overlay fixed inset-0 z-[420] flex items-center justify-center" role="presentation">
      <section className="opening-hand-layout" role="dialog" aria-modal="true" aria-label={t("mulligan.title")}>
        {openingNarration && (
          <div className="opening-hand-narration" role="document">
            <span className="contextual-tutorial-mark" aria-hidden="true" />
            <h2>{t(openingNarration.titleKey)}</h2>
            <p>{t(openingNarration.bodyKey)}</p>
            <button
              ref={narrationButtonRef}
              type="button"
              className="contextual-tutorial-acknowledge"
              onClick={() => firstCanonVisionDirector.acknowledge()}
            >
              {t("guided.contextual.understood")}
            </button>
          </div>
        )}
        <div
          ref={(element) => guidedAnchorRegistry.set(
            guidedSurfaceAnchorKey("opening.hand"),
            "opening-hand:surface",
            element,
          )}
          className={["opening-hand-cards", firstCanon.suppressOpeningCardInteraction ? "is-narration-locked" : ""].join(" ")}
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
                onAnimationEnd={index === lastCardIndex
                  ? () => firstCanonVisionDirector.notifyOpeningCardsSettled(game.mulligansTaken)
                  : undefined}
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
            disabled={!canAccept}
          >
            <Check size={18} />
            {t("mulligan.accept")}
          </button>
          <button
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("opening.mulliganAction"),
              "opening-hand:mulligan-action",
              element,
            )}
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

import { Check, RefreshCcw } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { UI_FEATURE_FLAGS } from "../config/featureFlags";
import type { GameState } from "../engine/GameTypes";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { GuidedTutorialDialog } from "./GuidedTutorialDialog";
import { guidedAnchorRegistry, guidedCardAnchorKey, guidedSurfaceAnchorKey } from "../guidance";
import { firstCanonVisionDirector } from "../guidance/firstCanonVision";
import { chooseFirstCanonVisionGuidance } from "../guidance/firstCanonVisionProductRuntime";

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
  const replayChoiceVisible = ownsOpening && firstCanon.stage === "replay-choice";
  const openingNarration = ownsOpening && (
    replayChoiceVisible
    || firstCanon.stage === "opening-intro"
    || firstCanon.stage === "opening-confirmation"
  ) ? firstCanon.narration : undefined;
  const guidanceLocksOpening = ownsOpening && firstCanon.suppressOpeningCardInteraction;
  const [openingHoverArmed, setOpeningHoverArmed] = useState(!guidanceLocksOpening);
  const [settledMulliganRevision, setSettledMulliganRevision] = useState<number | null>(null);
  const canMulligan = game.player.hand.length > 1
    && (!ownsOpening || firstCanon.stage === "await-mulligan");
  const canAccept = !ownsOpening || firstCanon.stage === "opening-accept";
  const lastCardIndex = game.player.hand.length - 1;
  const openingInteractionLocked = guidanceLocksOpening || !openingHoverArmed;
  const openingCardsSettled = settledMulliganRevision === game.mulligansTaken;

  useEffect(() => {
    if (openingNarration) narrationButtonRef.current?.focus({ preventScroll: true });
  }, [firstCanon.stage, openingNarration]);

  useEffect(() => {
    if (!ownsOpening || typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setSettledMulliganRevision(game.mulligansTaken);
      firstCanonVisionDirector.notifyOpeningCardsSettled(game.mulligansTaken);
    }
  }, [game.mulligansTaken, ownsOpening]);

  useEffect(() => {
    if (guidanceLocksOpening) {
      setOpeningHoverArmed(false);
      return;
    }
    if (openingHoverArmed || typeof window === "undefined") return;

    // The acknowledgement button can overlap a card. Do not let that card jump to its hover
    // scale when the dialog disappears; hover becomes available after the pointer leaves the Hand.
    const armAfterLeavingHand = (event: PointerEvent) => {
      const bounds = guidedAnchorRegistry.preferred(
        guidedSurfaceAnchorKey("opening.hand"),
      )?.getBoundingClientRect();
      if (!bounds) {
        setOpeningHoverArmed(true);
        return;
      }
      const overHand = event.clientX >= bounds.left
        && event.clientX <= bounds.right
        && event.clientY >= bounds.top
        && event.clientY <= bounds.bottom;
      if (!overHand) setOpeningHoverArmed(true);
    };
    window.addEventListener("pointermove", armAfterLeavingHand, { passive: true });
    return () => window.removeEventListener("pointermove", armAfterLeavingHand);
  }, [guidanceLocksOpening, openingHoverArmed]);

  const narrationPortal = openingNarration && typeof document !== "undefined"
    ? createPortal(
        <div className="opening-hand-narration-layer" role="presentation">
          <GuidedTutorialDialog
            className="opening-hand-narration first-canon-evy-dialog"
            title={t("guided.learnToPlay.intro.evy")}
            body={<p>{t(openingNarration.bodyKey)}</p>}
            isLearnToPlay
            ariaModal
            closeLabel={t("common.close")}
            showFeedback={false}
            titleId="opening-hand-narration-speaker"
            bodyId="opening-hand-narration-body"
            footer={replayChoiceVisible ? (
              <div className="first-canon-choice-actions">
                <button
                  type="button"
                  className="guided-tutorial-continue is-secondary"
                  onClick={() => chooseFirstCanonVisionGuidance("independent")}
                >
                  {t("guided.firstCanon.continueIndependently")}
                </button>
                <button
                  ref={narrationButtonRef}
                  type="button"
                  className="guided-tutorial-continue"
                  onClick={() => chooseFirstCanonVisionGuidance("guided")}
                >
                  {t("guided.firstCanon.guideAgain")}
                </button>
              </div>
            ) : (
              <button
                ref={narrationButtonRef}
                type="button"
                className="guided-tutorial-continue"
                onClick={() => firstCanonVisionDirector.acknowledge()}
              >
                {t("guided.contextual.understood")}
              </button>
            )}
          />
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <div className="opening-hand-overlay fixed inset-0 z-[420] flex items-center justify-center" role="presentation">
        <section
          className="opening-hand-layout"
          role={openingNarration ? "presentation" : "dialog"}
          aria-modal={openingNarration ? undefined : "true"}
          aria-label={openingNarration ? undefined : t("mulligan.title")}
        >
          <div
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("opening.hand"),
              "opening-hand:surface",
              element,
            )}
            className={["opening-hand-cards", openingInteractionLocked ? "is-narration-locked" : ""].join(" ")}
          >
            {game.player.hand.map((card, index) => {
              const showFullImage = shouldShowFullCardImage(card.definitionId);
              const useNativeHdRendering =
                showFullImage &&
                UI_FEATURE_FLAGS.useNativeHdHandImageRendering;

              return (
                <div
                  key={`${game.mulligansTaken}-${card.instanceId}`}
                  className={["opening-hand-card-entry", openingCardsSettled ? "is-settled" : ""].filter(Boolean).join(" ")}
                  style={{ animationDelay: `${index * 55}ms` }}
                  onAnimationEnd={index === lastCardIndex
                    ? (event) => {
                        if (event.target !== event.currentTarget || event.animationName !== "opening-hand-card-enter") return;
                        setSettledMulliganRevision(game.mulligansTaken);
                        firstCanonVisionDirector.notifyOpeningCardsSettled(game.mulligansTaken);
                      }
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
      {narrationPortal}
    </>
  );
}

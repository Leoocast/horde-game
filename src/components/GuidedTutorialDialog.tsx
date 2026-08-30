import { X } from "lucide-react";
import { Children, type CSSProperties, type ReactNode, type RefObject } from "react";

export type GuidedTutorialDialogProps = Readonly<{
  title: string;
  body: ReactNode;
  isLearnToPlay: boolean;
  ariaModal: boolean;
  closeLabel: string;
  className?: string;
  style?: CSSProperties;
  titleFontSize?: number;
  modeLabel?: string;
  currentStepIndex?: number;
  stepCount?: number;
  feedback?: string;
  showFeedback?: boolean;
  footer?: ReactNode;
  showContinue?: boolean;
  continueDisabled?: boolean;
  continueLabel?: string;
  onContinue?: () => void;
  onClose?: () => void;
  calloutRef?: RefObject<HTMLElement | null>;
  continueRef?: RefObject<HTMLButtonElement | null>;
  titleId?: string;
  bodyId?: string;
}>;

/**
 * The player-facing dialog surface shared by strict guidance and Learn to Play.
 * Positioning, spotlight geometry and interaction gating remain the overlay controller's job.
 */
export function GuidedTutorialDialog({
  title,
  body,
  isLearnToPlay,
  ariaModal,
  closeLabel,
  className,
  style,
  titleFontSize,
  modeLabel,
  currentStepIndex,
  stepCount,
  feedback,
  showFeedback = true,
  footer,
  showContinue = false,
  continueDisabled = false,
  continueLabel,
  onContinue,
  onClose,
  calloutRef,
  continueRef,
  titleId = "guided-tutorial-title",
  bodyId = "guided-tutorial-body",
}: GuidedTutorialDialogProps) {
  const hasBody = Children.count(body) > 0;
  return (
    <section
      ref={calloutRef}
      className={["guided-tutorial-callout", className].filter(Boolean).join(" ")}
      style={style}
      role="dialog"
      aria-modal={ariaModal}
      aria-labelledby={titleId}
      aria-describedby={hasBody ? bodyId : undefined}
      tabIndex={-1}
      data-guided-overlay-control="true"
    >
      <span className="guided-tutorial-callout-mark" aria-hidden="true" />
      <div className={["tutorial-dialog-heading", !hasBody ? "is-bodyless" : ""].filter(Boolean).join(" ")}>
        <h2 id={titleId} style={{ fontSize: titleFontSize }}>{title}</h2>
        {isLearnToPlay && onClose && (
          <button
            type="button"
            className="tutorial-dialog-close"
            onClick={onClose}
            disabled={continueDisabled}
            title={closeLabel}
            aria-label={closeLabel}
          >
            <X size={15} />
          </button>
        )}
      </div>
      {!isLearnToPlay && (
        <div className="guided-tutorial-step">
          <span>{modeLabel}</span>
          {currentStepIndex && stepCount && <b>{currentStepIndex} / {stepCount}</b>}
        </div>
      )}
      {hasBody && <div id={bodyId} className="guided-tutorial-body">{body}</div>}
      {showFeedback && <div className="guided-tutorial-feedback" role="status" aria-live="polite">{feedback}</div>}
      {footer}
      {!footer && showContinue && continueLabel && onContinue && (
        <button
          ref={continueRef}
          type="button"
          data-audio-click={continueDisabled ? "off" : "valid"}
          className="guided-tutorial-continue"
          disabled={continueDisabled}
          onClick={onContinue}
        >
          {continueLabel}
        </button>
      )}
    </section>
  );
}

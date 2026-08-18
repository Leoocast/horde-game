import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import {
  guidedAnchorRegistry,
  guidedConnectorPath,
  guidedDirectionalCueBounds,
  guidedDomTargetAllowed,
  guidedGlossarySegments,
  guidedInteractionGate,
  guidedRectsEqual,
  guidedSessionStore,
  guidedUnionBounds,
  paddedGuidedRect,
  placeGuidedCallout,
  resolveGuidedAnchors,
  type GuidedAnchorKey,
  type GuidedRect,
  type GuidedResolvedAnchor,
  type GuidedSize,
} from "../guidance";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { GuidedCardComparison } from "./GuidedCardComparison";
import { GameTooltip } from "./GameTooltip";
import { createGuidedFrameLoop } from "./guidedFrameLoop";
import { TutorialDirectionalCueGlyph } from "./TutorialDirectionalCue";
import { tutorialCalloutWidth } from "./tutorialCalloutSizing";

const subscribeSession = (listener: () => void) => guidedSessionStore.subscribe(listener);
const readSession = () => guidedSessionStore.snapshot();
const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();
const subscribeInteraction = (listener: () => void) => guidedInteractionGate.subscribe(listener);
const readInteraction = () => guidedInteractionGate.snapshot();

const CALLOUT_FALLBACK_SIZE = Object.freeze({ width: 360, height: 210 });
const MASK_ID = "guided-tutorial-spotlight-mask";
const ARROW_ID = "guided-tutorial-arrowhead";

export function GuidedTutorialOverlay() {
  const t = useTranslation();
  const game = useGameStore((state) => state.game);
  const session = useSyncExternalStore(subscribeSession, readSession, readSession);
  const anchorSnapshot = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const interaction = useSyncExternalStore(subscribeInteraction, readInteraction, readInteraction);
  const [rects, setRects] = useState<readonly GuidedRect[]>(Object.freeze([]));
  const [viewport, setViewport] = useState(() => readViewport());
  const [calloutSize, setCalloutSize] = useState<GuidedSize>(CALLOUT_FALLBACK_SIZE);
  const [feedback, setFeedback] = useState<string>();
  const [feedbackPulse, setFeedbackPulse] = useState(0);
  const [dismissedActionCalloutStepId, setDismissedActionCalloutStepId] = useState<string>();
  const calloutRef = useRef<HTMLElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const feedbackTimerRef = useRef<number | undefined>(undefined);
  const previousFocusRef = useRef<HTMLElement | undefined>(undefined);
  const rectsRef = useRef(rects);
  const viewportRef = useRef(viewport);
  const active = session.status === "running" && Boolean(session.currentStep && session.mode);

  const resolved = useMemo(
    () => resolveGuidedAnchors(session.currentStep?.highlights ?? [], session.bindings),
    [anchorSnapshot.revision, session.bindings, session.currentStep],
  );
  const activeKeys = useMemo(
    () => Object.freeze(resolved.map((anchor) => anchor.key)),
    [resolved],
  );
  const unboundHighlight = Boolean(session.currentStep?.highlights.some(
    (highlight) => highlight.kind === "card" && !session.bindings[highlight.alias],
  ));
  const comparisonCards = useMemo(() => {
    const presentation = session.currentStep?.presentation;
    if (presentation?.kind !== "cardComparison") return Object.freeze([]);
    return Object.freeze(presentation.cardAliases.flatMap((alias) => {
      const instanceId = session.bindings[alias];
      const card = instanceId ? findGuidedCard(game, instanceId) : undefined;
      return card ? [card] : [];
    }));
  }, [game, session.bindings, session.currentStep]);
  const comparisonExpected = session.currentStep?.presentation?.kind === "cardComparison"
    ? session.currentStep.presentation.cardAliases.length
    : 0;
  const presentation = session.currentStep?.presentation;
  const missingAnchor = unboundHighlight
    || comparisonCards.length < comparisonExpected
    || resolved.some((anchor) => !anchor.element)
    || rects.length < resolved.length;
  const dismissCalloutOnAction = session.currentStep?.kind === "act"
    && session.currentStep.allowedIntent.kind === "phase.continueSetup";
  const showCallout = session.currentStep?.callout !== "hidden"
    && dismissedActionCalloutStepId !== session.currentStep?.id;
  const showSilentSpotlight = !showCallout
    && presentation?.kind === "spotlight"
    && session.presentationSettled;
  const isLearnToPlay = session.lessonId?.startsWith("learn-to-play.") ?? false;

  useEffect(() => {
    setDismissedActionCalloutStepId(undefined);
  }, [session.currentStep?.id, session.sessionId]);

  useLayoutEffect(() => {
    if (!active) {
      if (rectsRef.current.length > 0) {
        const empty = Object.freeze([]);
        rectsRef.current = empty;
        setRects(empty);
      }
      return;
    }
    const measure = () => {
      const next = resolved.flatMap((anchor) => {
        const bounds = anchor.element ? guidedAnchorBounds(anchor.element) : undefined;
        if (!bounds || bounds.width <= 0 || bounds.height <= 0) return [];
        return [paddedGuidedRect(anchor.key, anchor.role, bounds)];
      });
      if (!guidedRectsEqual(rectsRef.current, next)) {
        const frozen = Object.freeze(next);
        rectsRef.current = frozen;
        setRects(frozen);
      }
      const nextViewport = readViewport();
      if (viewportRef.current.width !== nextViewport.width || viewportRef.current.height !== nextViewport.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };
    const loop = createGuidedFrameLoop(measure);
    const observer = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(() => loop.measureNow());
    for (const anchor of resolved) if (anchor.element) observer?.observe(anchor.element);
    if (calloutRef.current) observer?.observe(calloutRef.current);
    loop.start();
    return () => {
      loop.stop();
      observer?.disconnect();
    };
  }, [active, resolved]);

  useLayoutEffect(() => {
    if (!active || !showCallout || !calloutRef.current || typeof ResizeObserver === "undefined") return;
    const callout = calloutRef.current;
    const measure = () => {
      const bounds = callout.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setCalloutSize((current) => current.width === bounds.width && current.height === bounds.height
        ? current
        : Object.freeze({ width: bounds.width, height: bounds.height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(callout);
    measure();
    return () => observer.disconnect();
  }, [active, session.currentStep?.id, showCallout]);

  useEffect(() => {
    if (!active) return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    return () => {
      window.clearTimeout(feedbackTimerRef.current);
      const previous = previousFocusRef.current;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
      previousFocusRef.current = undefined;
    };
  }, [active]);

  useEffect(() => {
    if (!active) return;
    setFeedback(undefined);
    const frame = window.requestAnimationFrame(() => {
      if (session.mode === "act") {
        const target = firstFocusableAnchor(resolved);
        if (target) {
          target.focus({ preventScroll: true });
          return;
        }
      }
      if (session.mode === "explain" && session.canContinue && continueRef.current) {
        continueRef.current.focus({ preventScroll: true });
        return;
      }
      if (showCallout) calloutRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [active, resolved, session.canContinue, session.currentStep?.id, session.mode, showCallout]);

  useEffect(() => {
    if (!active || !showCallout) return;
    const restorations = resolved.flatMap((anchor) => {
      if (!anchor.element) return [];
      const describedElement = focusableWithin(anchor.element) ?? anchor.element;
      const previous = describedElement.getAttribute("aria-describedby");
      const tokens = new Set((previous ?? "").split(/\s+/u).filter(Boolean));
      tokens.add("guided-tutorial-body");
      describedElement.setAttribute("aria-describedby", [...tokens].join(" "));
      return [() => previous === null
        ? describedElement.removeAttribute("aria-describedby")
        : describedElement.setAttribute("aria-describedby", previous)];
    });
    return () => restorations.forEach((restore) => restore());
  }, [active, resolved, session.currentStep?.id, showCallout]);

  useEffect(() => {
    if (!active || !session.mode) return;
    const allowedPointers = new Set<number>();
    let lastFeedbackAt = 0;
    const blockedMessage = session.mode === "explain"
      ? t(isLearnToPlay ? "guided.blocked.explainUnderstood" : "guided.blocked.explain")
      : session.mode === "observe"
      ? t("guided.blocked.observe")
      : t("guided.blocked");

    const reject = (message: string) => {
      const now = performance.now();
      if (now - lastFeedbackAt < 120) return;
      lastFeedbackAt = now;
      setFeedback(message);
      setFeedbackPulse((value) => value + 1);
      window.clearTimeout(feedbackTimerRef.current);
      feedbackTimerRef.current = window.setTimeout(() => setFeedback(undefined), 1800);
    };

    const block = (event: Event, message = blockedMessage) => {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      reject(message);
    };

    const isSystemControl = (target: EventTarget | null) => target instanceof Element && Boolean(
      target.closest("[data-guided-system-control='true']"),
    );
    const isOverlayControl = (target: EventTarget | null) => target instanceof Element && Boolean(
      target.closest("[data-guided-overlay-control='true']"),
    );
    const isControl = (target: EventTarget | null) => target instanceof Element && Boolean(
      target.closest("[data-guided-overlay-control='true'], [data-guided-system-control='true']"),
    );
    const targetAllowed = (target: EventTarget | null) => guidedDomTargetAllowed(
      session.mode!,
      guidedAnchorRegistry.keysContaining(target),
      activeKeys,
      isControl(target),
    );
    const dismissActionCallout = () => {
      if (dismissCalloutOnAction && session.currentStep?.id) {
        setDismissedActionCalloutStepId(session.currentStep.id);
      }
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (targetAllowed(event.target)) {
        allowedPointers.add(event.pointerId);
        if (!isOverlayControl(event.target)) dismissActionCallout();
        return;
      }
      block(event);
    };
    const handlePointerEnd = (event: PointerEvent) => {
      if (allowedPointers.delete(event.pointerId) || targetAllowed(event.target)) return;
      block(event);
    };
    const handleEvent = (event: Event) => {
      if (targetAllowed(event.target)) {
        if (!isOverlayControl(event.target)) dismissActionCallout();
        return;
      }
      block(event);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      // Restricted Settings and lifecycle confirmations live above the guide layer and own their
      // keyboard behavior while focused.
      if (isSystemControl(event.target)) return;
      if (event.key === "Escape") {
        block(event, t("guided.escapeBlocked"));
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        event.stopPropagation();
        cycleGuidedFocus(event.shiftKey, session.mode!, resolved, calloutRef, continueRef);
        return;
      }
      if (targetAllowed(event.target)) {
        if ((event.key === "Enter" || event.key === " ") && !isOverlayControl(event.target)) dismissActionCallout();
        return;
      }
      block(event);
      focusPreferredTarget(session.mode!, resolved, calloutRef, continueRef);
    };

    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("pointerup", handlePointerEnd, true);
    document.addEventListener("pointercancel", handlePointerEnd, true);
    document.addEventListener("click", handleEvent, true);
    document.addEventListener("dblclick", handleEvent, true);
    document.addEventListener("contextmenu", handleEvent, true);
    document.addEventListener("dragstart", handleEvent, true);
    document.addEventListener("dragover", handleEvent, true);
    document.addEventListener("drop", handleEvent, true);
    document.addEventListener("keydown", handleKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("pointerup", handlePointerEnd, true);
      document.removeEventListener("pointercancel", handlePointerEnd, true);
      document.removeEventListener("click", handleEvent, true);
      document.removeEventListener("dblclick", handleEvent, true);
      document.removeEventListener("contextmenu", handleEvent, true);
      document.removeEventListener("dragstart", handleEvent, true);
      document.removeEventListener("dragover", handleEvent, true);
      document.removeEventListener("drop", handleEvent, true);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [active, activeKeys, dismissCalloutOnAction, isLearnToPlay, resolved, session.currentStep?.id, session.mode, t]);

  useEffect(() => {
    const rejection = interaction.lastRejection;
    if (!active || !rejection || rejection.sessionId !== session.sessionId || rejection.stepId !== session.currentStep?.id) return;
    setFeedback(t("guided.blocked"));
    setFeedbackPulse(rejection.attemptCursor);
    window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(undefined), 1800);
  }, [active, interaction.attemptCursor, interaction.lastRejection, session.currentStep?.id, session.sessionId, t]);

  if (!active || !session.currentStep || !session.mode || typeof document === "undefined") return null;

  const title = missingAnchor ? t("guided.anchorMissingTitle") : t(session.currentStep.copy.titleKey);
  const preferredCalloutWidth = tutorialCalloutWidth(title, viewport.width, {
    minimum: 430,
    maximum: 760,
    titleCharacterWidth: 12.5,
    chromeWidth: 108,
  });
  const positionedCalloutSize = comparisonCards.length > 0
    ? calloutSize
    : { ...calloutSize, width: preferredCalloutWidth };
  const connectorPath = presentation?.kind === "directionalCue" ? undefined : guidedConnectorPath(rects);
  const calloutPosition = placeGuidedCallout(viewport, positionedCalloutSize, missingAnchor ? [] : rects);
  const body = missingAnchor ? t("guided.anchorMissingBody") : t(session.currentStep.copy.bodyKey);
  const glossaryTerms = missingAnchor ? [] : (session.currentStep.copy.glossaryTerms ?? []);
  const bodyParagraphs = body.split(/\n{2,}/u).filter(Boolean).map(
    (paragraph) => guidedGlossarySegments(paragraph, glossaryTerms, t),
  );
  const modeLabel = t(`guided.mode.${session.mode}` as const);
  const finalExplanation = session.mode === "explain" && !session.currentStep.nextStepId;
  const cardPreviewVisible = session.currentStep.highlights.some(
    (highlight) => highlight.kind === "surface" && highlight.anchor === "card.preview",
  );
  const directionalTarget = presentation?.kind === "directionalCue"
    ? rects.find((rect) => rect.role === "origin") ?? rects[0]
    : undefined;
  const directionalBounds = directionalTarget ? guidedDirectionalCueBounds(directionalTarget) : undefined;
  const dismissLearnToPlayCallout = () => {
    if (session.mode === "explain") {
      if (session.canContinue) guidedSessionStore.continueExplanation();
      return;
    }
    setDismissedActionCalloutStepId(session.currentStep?.id);
  };

  return createPortal(
    <div
      id="guided-tutorial-overlay"
      className={[
        "guided-tutorial-overlay",
        feedback ? "has-rejection" : "",
        comparisonCards.length > 0 ? "has-card-comparison" : "",
        isLearnToPlay ? "is-learn-to-play" : "",
      ].join(" ")}
      data-mode={session.mode}
      data-step-id={session.currentStep.id}
      data-card-preview-visible={cardPreviewVisible ? "true" : "false"}
      data-feedback-pulse={feedbackPulse}
    >
      {showCallout && (
        <>
          <svg className="guided-tutorial-mask" aria-hidden="true">
            <defs>
              <mask id={MASK_ID} maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
                <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
                {!missingAnchor && rects.map((rect) => (
                  <rect key={`${rect.key}:${rect.role}`} x={rect.left} y={rect.top} width={rect.width} height={rect.height} rx="7" fill="black" />
                ))}
              </mask>
              <marker id={ARROW_ID} viewBox="0 0 10 10" refX="8.5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" />
              </marker>
            </defs>
            <rect className="guided-tutorial-dimmer" x="0" y="0" width={viewport.width} height={viewport.height} mask={`url(#${MASK_ID})`} />
            {!missingAnchor && connectorPath && (
              <path className="guided-tutorial-connector" d={connectorPath} markerEnd={`url(#${ARROW_ID})`} />
            )}
          </svg>

        </>
      )}

      {(showCallout || showSilentSpotlight) && !missingAnchor && presentation?.kind !== "directionalCue" && rects.map((rect) => (
        <span
          key={`${session.currentStep?.id}:${rect.key}:${rect.role}:${feedbackPulse}`}
          className={["guided-tutorial-ring", feedback ? "is-rejected" : ""].join(" ")}
          data-anchor-key={rect.key}
          data-anchor-role={rect.role}
          data-tone={showSilentSpotlight ? presentation.tone : undefined}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ))}

      {presentation?.kind === "directionalCue" && directionalBounds && !missingAnchor && (
        <span
          className="guided-tutorial-directional-cue"
          data-tone={presentation.tone}
          data-direction={presentation.direction}
          style={directionalBounds}
          aria-hidden="true"
        >
          <TutorialDirectionalCueGlyph />
        </span>
      )}

      {showCallout && !missingAnchor && comparisonCards.length > 0 && (
        <GuidedCardComparison
          cards={comparisonCards}
          game={game}
          emphasis={presentation?.kind === "cardComparison"
            ? presentation.emphasis
            : "energyCost"}
        />
      )}

      {showCallout && (
      <section
        ref={calloutRef}
        className="guided-tutorial-callout"
        style={{
          left: calloutPosition.left,
          top: calloutPosition.top,
          width: comparisonCards.length > 0 ? undefined : preferredCalloutWidth,
        }}
        role="dialog"
        aria-modal={session.mode !== "act"}
        aria-labelledby="guided-tutorial-title"
        aria-describedby="guided-tutorial-body"
        tabIndex={-1}
        data-guided-overlay-control="true"
      >
        <span className="guided-tutorial-callout-mark" aria-hidden="true" />
        <div className="tutorial-dialog-heading">
          <h2 id="guided-tutorial-title">{title}</h2>
          {isLearnToPlay && (
            <button
              type="button"
              className="tutorial-dialog-close"
              onClick={dismissLearnToPlayCallout}
              disabled={session.mode === "explain" && !session.canContinue}
              title={t("common.close")}
              aria-label={t("common.close")}
            >
              <X size={15} />
            </button>
          )}
        </div>
        {!isLearnToPlay && (
          <div className="guided-tutorial-step">
            <span>{modeLabel}</span>
            {session.currentStepIndex && session.stepCount && <b>{session.currentStepIndex} / {session.stepCount}</b>}
          </div>
        )}
        <div id="guided-tutorial-body" className="guided-tutorial-body">
          {bodyParagraphs.map((paragraph, paragraphIndex) => (
            <p key={`${session.currentStep?.id}:body:${paragraphIndex}`}>
              {paragraph.map((segment, segmentIndex) => segment.kind === "text"
                ? <span key={`text:${segmentIndex}`}>{segment.text}</span>
                : (
                  <GameTooltip
                    key={`${segment.termId}:${segmentIndex}`}
                    content={segment.definition}
                    className="guided-glossary-tooltip-host"
                    tooltipClassName="guided-glossary-tooltip"
                  >
                    <button
                      type="button"
                      className="guided-glossary-term"
                      data-guided-glossary-term="true"
                      aria-label={`${segment.text}: ${segment.definition}`}
                    >
                      {segment.text}
                    </button>
                  </GameTooltip>
                ))}
            </p>
          ))}
        </div>
        <div className="guided-tutorial-feedback" role="status" aria-live="polite">{feedback}</div>
        {(session.mode === "explain" || (isLearnToPlay && session.mode === "act")) && !missingAnchor && (
          <button
            ref={continueRef}
            type="button"
            data-audio-click={session.mode === "act" || session.canContinue ? "valid" : "off"}
            className="guided-tutorial-continue"
            disabled={session.mode === "explain" && !session.canContinue}
            onClick={isLearnToPlay
              ? dismissLearnToPlayCallout
              : () => guidedSessionStore.continueExplanation()}
          >
            {t(isLearnToPlay && session.mode === "explain"
              ? "guided.contextual.understood"
              : finalExplanation
              ? "guided.finish"
              : "guided.continue")}
          </button>
        )}
      </section>
      )}
    </div>,
    document.body,
  );
}

function findGuidedCard(
  game: ReturnType<typeof useGameStore.getState>["game"],
  instanceId: string,
) {
  return [
    ...game.player.hand,
    ...game.player.archive,
    ...game.player.field,
    ...game.player.memory,
    ...game.player.oblivion,
    ...game.host.archive,
    ...game.host.field,
    ...game.host.memory,
    ...game.host.oblivion,
  ].find((card) => card.instanceId === instanceId);
}

function readViewport() {
  if (typeof window === "undefined") return Object.freeze({ width: 1280, height: 720 });
  return Object.freeze({ width: window.innerWidth, height: window.innerHeight });
}

function guidedAnchorBounds(element: HTMLElement) {
  const elements = [
    element,
    ...element.querySelectorAll<HTMLElement>("[data-guided-anchor-extension='true']"),
  ];
  return guidedUnionBounds(elements.map((candidate) => candidate.getBoundingClientRect()).filter(
    (bounds) => bounds.width > 0 && bounds.height > 0,
  ));
}

function focusableWithin(element: HTMLElement): HTMLElement | undefined {
  if (matchesFocusable(element)) return element;
  return [...element.querySelectorAll<HTMLElement>("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role='button']:not([aria-disabled='true']), [tabindex]:not([tabindex='-1'])")]
    .find((candidate) => candidate.getAttribute("aria-hidden") !== "true");
}

function matchesFocusable(element: HTMLElement): boolean {
  return element.matches("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [role='button']:not([aria-disabled='true']), [tabindex]:not([tabindex='-1'])");
}

function firstFocusableAnchor(resolved: readonly GuidedResolvedAnchor[]): HTMLElement | undefined {
  for (const anchor of resolved) {
    if (!anchor.element) continue;
    const focusable = focusableWithin(anchor.element);
    if (focusable) return focusable;
  }
  return undefined;
}

function guidedFocusables(
  mode: "explain" | "act" | "observe",
  resolved: readonly GuidedResolvedAnchor[],
  calloutRef: RefObject<HTMLElement | null>,
  continueRef: RefObject<HTMLButtonElement | null>,
): HTMLElement[] {
  const elements: HTMLElement[] = [];
  if (mode === "act") {
    for (const anchor of resolved) {
      const focusable = anchor.element ? focusableWithin(anchor.element) : undefined;
      if (focusable && !elements.includes(focusable)) elements.push(focusable);
    }
  }
  if (calloutRef.current) {
    for (const glossaryTerm of calloutRef.current.querySelectorAll<HTMLElement>("[data-guided-glossary-term='true']")) {
      if (!elements.includes(glossaryTerm)) elements.push(glossaryTerm);
    }
  }
  if (continueRef.current && !continueRef.current.disabled) elements.push(continueRef.current);
  if (elements.length === 0 && calloutRef.current) elements.push(calloutRef.current);
  return elements;
}

function cycleGuidedFocus(
  backwards: boolean,
  mode: "explain" | "act" | "observe",
  resolved: readonly GuidedResolvedAnchor[],
  calloutRef: RefObject<HTMLElement | null>,
  continueRef: RefObject<HTMLButtonElement | null>,
): void {
  const focusables = guidedFocusables(mode, resolved, calloutRef, continueRef);
  if (focusables.length === 0) return;
  const current = document.activeElement instanceof HTMLElement ? focusables.indexOf(document.activeElement) : -1;
  const next = backwards
    ? current <= 0 ? focusables.length - 1 : current - 1
    : current < 0 || current === focusables.length - 1 ? 0 : current + 1;
  focusables[next].focus({ preventScroll: true });
}

function focusPreferredTarget(
  mode: "explain" | "act" | "observe",
  resolved: readonly GuidedResolvedAnchor[],
  calloutRef: RefObject<HTMLElement | null>,
  continueRef: RefObject<HTMLButtonElement | null>,
): void {
  guidedFocusables(mode, resolved, calloutRef, continueRef)[0]?.focus({ preventScroll: true });
}

import { X } from "lucide-react";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  guidedAnchorRegistry,
  guidedCardAnchorKey,
  guidedConnectorPath,
  guidedGlossarySegments,
  guidedRectsEqual,
  guidedSessionStore,
  guidedSurfaceAnchorKey,
  paddedGuidedRect,
  placeGuidedCallout,
  type GuidedAnchorKey,
  type GuidedRect,
  type GuidedSize,
} from "../guidance";
import { contextualTutorialRuntime } from "../guidance/contextualProductRuntime";
import { useTranslation } from "../i18n/useTranslation";
import { GameTooltip } from "./GameTooltip";

const subscribeRuntime = (listener: () => void) => contextualTutorialRuntime.subscribe(listener);
const readRuntime = () => contextualTutorialRuntime.snapshot();
const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();
const subscribeGuided = (listener: () => void) => guidedSessionStore.subscribe(listener);
const readGuided = () => guidedSessionStore.snapshot();
const CALLOUT_FALLBACK_SIZE = Object.freeze({ width: 390, height: 190 });

export function ContextualTutorialCallout() {
  const t = useTranslation();
  const runtime = useSyncExternalStore(subscribeRuntime, readRuntime, readRuntime);
  const anchors = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const guided = useSyncExternalStore(subscribeGuided, readGuided, readGuided);
  const [rects, setRects] = useState<readonly GuidedRect[]>(Object.freeze([]));
  const [viewport, setViewport] = useState(readViewport);
  const [calloutSize, setCalloutSize] = useState<GuidedSize>(CALLOUT_FALLBACK_SIZE);
  const calloutRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const active = runtime.active;

  const resolved = useMemo(() => (active?.highlights ?? []).map((highlight) => {
    const key: GuidedAnchorKey = highlight.kind === "card"
      ? guidedCardAnchorKey(highlight.instanceId)
      : guidedSurfaceAnchorKey(highlight.anchor);
    return Object.freeze({ key, role: highlight.role ?? "focus", element: guidedAnchorRegistry.preferred(key) });
  }), [active, anchors.revision]);

  useLayoutEffect(() => {
    if (!active) {
      setRects(Object.freeze([]));
      return;
    }
    let frame = 0;
    const measure = () => {
      const next = resolved.flatMap(({ key, role, element }) => {
        if (!element) return [];
        const bounds = element.getBoundingClientRect();
        return bounds.width > 0 && bounds.height > 0 ? [paddedGuidedRect(key, role, bounds, 6)] : [];
      });
      setRects((current) => guidedRectsEqual(current, next) ? current : Object.freeze(next));
      setViewport((current) => {
        const nextViewport = readViewport();
        return current.width === nextViewport.width && current.height === nextViewport.height ? current : nextViewport;
      });
      frame = window.requestAnimationFrame(measure);
    };
    measure();
    return () => window.cancelAnimationFrame(frame);
  }, [active, resolved]);

  useLayoutEffect(() => {
    if (!active || !calloutRef.current || typeof ResizeObserver === "undefined") return;
    const element = calloutRef.current;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      setCalloutSize((current) => current.width === bounds.width && current.height === bounds.height
        ? current
        : Object.freeze({ width: bounds.width, height: bounds.height }));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    measure();
    return () => observer.disconnect();
  }, [active]);

  useEffect(() => {
    if (active?.policy !== "preventive") return;
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    return () => {
      window.cancelAnimationFrame(frame);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus({ preventScroll: true });
      previousFocusRef.current = null;
    };
  }, [active?.conceptId, active?.policy]);

  if (!active || guided.status === "running" || typeof document === "undefined") return null;

  const missingAnchor = resolved.length !== rects.length;
  const position = placeGuidedCallout(viewport, calloutSize, missingAnchor ? [] : rects, active.placement);
  const connector = missingAnchor ? undefined : guidedConnectorPath(rects);
  const titleId = `contextual-tutorial-title-${active.conceptId}`;
  const bodyId = `contextual-tutorial-body-${active.conceptId}`;
  const body = t(active.copy.bodyKey);
  const paragraphs = body.split(/\n{2,}/u).filter(Boolean).map(
    (paragraph) => guidedGlossarySegments(paragraph, active.copy.glossaryTerms ?? [], t),
  );

  return createPortal(
    <div
      className="contextual-tutorial-layer"
      data-policy={active.policy}
      data-concept-id={active.conceptId}
    >
      {connector && (
        <svg className="contextual-tutorial-connector-layer" aria-hidden="true">
          <path className="contextual-tutorial-connector" d={connector} />
        </svg>
      )}
      {!missingAnchor && rects.map((rect) => (
        <span
          key={`${rect.key}:${rect.role}`}
          className="contextual-tutorial-ring"
          data-anchor-key={rect.key}
          style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
          aria-hidden="true"
        />
      ))}
      <section
        ref={calloutRef}
        className="contextual-tutorial-callout"
        style={{ left: position.left, top: position.top }}
        role="dialog"
        aria-modal="false"
        aria-live="polite"
        aria-labelledby={titleId}
        aria-describedby={bodyId}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          contextualTutorialRuntime.acknowledgeActive();
        }}
      >
        <span className="contextual-tutorial-mark" aria-hidden="true" />
        <div className="contextual-tutorial-heading">
          <span>{t(`guided.contextual.mode.${active.policy}` as const)}</span>
          <button
            ref={closeRef}
            type="button"
            className="contextual-tutorial-close"
            onClick={() => contextualTutorialRuntime.acknowledgeActive()}
            title={t("common.close")}
            aria-label={t("common.close")}
          >
            <X size={15} />
          </button>
        </div>
        <h2 id={titleId}>{t(active.copy.titleKey)}</h2>
        <div id={bodyId} className="contextual-tutorial-body">
          {paragraphs.map((paragraph, paragraphIndex) => (
            <p key={`${active.conceptId}:body:${paragraphIndex}`}>
              {paragraph.map((segment, segmentIndex) => segment.kind === "text"
                ? <span key={`text:${segmentIndex}`}>{segment.text}</span>
                : (
                  <GameTooltip
                    key={`${segment.termId}:${segmentIndex}`}
                    content={segment.definition}
                    className="guided-glossary-tooltip-host"
                    tooltipClassName="guided-glossary-tooltip contextual-glossary-tooltip"
                  >
                    <button
                      type="button"
                      className="guided-glossary-term"
                      aria-label={`${segment.text}: ${segment.definition}`}
                    >
                      {segment.text}
                    </button>
                  </GameTooltip>
                ))}
            </p>
          ))}
        </div>
        <button
          type="button"
          className="contextual-tutorial-acknowledge"
          onClick={() => contextualTutorialRuntime.acknowledgeActive()}
        >
          {t("guided.contextual.understood")}
        </button>
      </section>
    </div>,
    document.body,
  );
}

function readViewport(): GuidedSize {
  if (typeof window === "undefined") return Object.freeze({ width: 1280, height: 720 });
  return Object.freeze({ width: window.innerWidth, height: window.innerHeight });
}

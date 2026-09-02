import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  guidedAnchorRegistry,
  guidedSurfaceAnchorKey,
  paddedGuidedRect,
  placeGuidedCallout,
  type GuidedRect,
  type GuidedSize,
} from "../guidance";
import { firstCanonVisionDirector } from "../guidance/firstCanonVision";
import { contextualTutorialRuntime } from "../guidance/contextualProductRuntime";
import { useTranslation } from "../i18n/useTranslation";
import { AnchoredGoldenFrame } from "./AnchoredGoldenFrame";
import { createGuidedFrameLoop } from "./guidedFrameLoop";
import { GuidedTutorialDialog } from "./GuidedTutorialDialog";

const subscribeFirstCanon = (listener: () => void) => firstCanonVisionDirector.subscribe(listener);
const readFirstCanon = () => firstCanonVisionDirector.snapshot();
const subscribeContextual = (listener: () => void) => contextualTutorialRuntime.subscribe(listener);
const readContextual = () => contextualTutorialRuntime.snapshot();
const subscribeAnchors = (listener: () => void) => guidedAnchorRegistry.subscribe(listener);
const readAnchors = () => guidedAnchorRegistry.snapshot();
const FIRST_CANON_FALLBACK_SIZE = Object.freeze({ width: 620, height: 220 });
const FIRST_CANON_MASK_ID = "first-canon-narration-mask";

export function FirstCanonVisionCallout() {
  const t = useTranslation();
  const snapshot = useSyncExternalStore(subscribeFirstCanon, readFirstCanon, readFirstCanon);
  const anchors = useSyncExternalStore(subscribeAnchors, readAnchors, readAnchors);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const calloutRef = useRef<HTMLElement>(null);
  const rectRef = useRef<GuidedRect | undefined>(undefined);
  const viewportRef = useRef(readViewport());
  const [anchorRect, setAnchorRect] = useState<GuidedRect | undefined>(undefined);
  const [viewport, setViewport] = useState(viewportRef.current);
  const [calloutSize, setCalloutSize] = useState<GuidedSize>(FIRST_CANON_FALLBACK_SIZE);
  const narration = snapshot.narration;
  const boardNarration = narration && (
    snapshot.stage === "preparation-intro"
    || snapshot.stage === "preparation-energy"
    || snapshot.stage === "host-awakening-warning"
  );
  const anchorKey = boardNarration && narration.anchor
    ? guidedSurfaceAnchorKey(narration.anchor)
    : undefined;

  useLayoutEffect(() => {
    if (!boardNarration || !anchorKey) {
      rectRef.current = undefined;
      setAnchorRect(undefined);
      return;
    }
    const measure = () => {
      const element = guidedAnchorRegistry.preferred(anchorKey);
      const bounds = element?.getBoundingClientRect();
      const next = bounds && bounds.width > 0 && bounds.height > 0
        ? paddedGuidedRect(anchorKey, "focus", bounds, 7)
        : undefined;
      if (!guidedRectEqual(rectRef.current, next)) {
        rectRef.current = next;
        setAnchorRect(next);
      }
      const nextViewport = readViewport();
      if (nextViewport.width !== viewportRef.current.width || nextViewport.height !== viewportRef.current.height) {
        viewportRef.current = nextViewport;
        setViewport(nextViewport);
      }
    };
    const loop = createGuidedFrameLoop(measure);
    loop.start();
    return () => loop.stop();
  }, [anchorKey, anchors.revision, boardNarration]);

  useLayoutEffect(() => {
    if (!boardNarration || !calloutRef.current || typeof ResizeObserver === "undefined") return;
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
  }, [boardNarration, snapshot.stage]);

  useEffect(() => {
    if (!boardNarration) return;
    const frame = window.requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [boardNarration, snapshot.stage]);

  if (typeof document === "undefined") return null;

  const frame = snapshot.stage === "await-mulligan"
    ? <AnchoredGoldenFrame key="opening:mulligan" target={{ kind: "surface", anchor: "opening.mulliganAction", padding: 6 }} />
    : snapshot.stage === "host-awakening-commit"
      ? <AnchoredGoldenFrame key="host:awakening" target={{ kind: "surface", anchor: "phase.primaryAction", padding: 7 }} />
      : boardNarration && narration.anchor && narration.showFrameDuringNarration !== false
        ? <AnchoredGoldenFrame key={`narration:${narration.anchor}`} target={{ kind: "surface", anchor: narration.anchor, padding: 7 }} />
        : null;
  const calloutWidth = Math.min(620, Math.max(280, viewport.width - 48));
  const calloutPosition = placeGuidedCallout(
    viewport,
    { width: calloutWidth, height: calloutSize.height },
    anchorRect ? [anchorRect] : [],
    narration?.placement,
  );

  return createPortal(
    <>
      {frame}
      {boardNarration && narration && (
        <div className="first-canon-narration-layer" data-stage={snapshot.stage} role="presentation">
          <svg className="first-canon-narration-mask" aria-hidden="true">
            <defs>
              <mask id={FIRST_CANON_MASK_ID} maskUnits="userSpaceOnUse" x="0" y="0" width={viewport.width} height={viewport.height}>
                <rect x="0" y="0" width={viewport.width} height={viewport.height} fill="white" />
                {anchorRect && (
                  <rect
                    x={anchorRect.left}
                    y={anchorRect.top}
                    width={anchorRect.width}
                    height={anchorRect.height}
                    rx="8"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              className="first-canon-narration-dimmer"
              x="0"
              y="0"
              width={viewport.width}
              height={viewport.height}
              mask={`url(#${FIRST_CANON_MASK_ID})`}
            />
          </svg>
          <GuidedTutorialDialog
            calloutRef={calloutRef}
            className="first-canon-narration first-canon-evy-dialog"
            style={{ left: calloutPosition.left, top: calloutPosition.top, width: calloutWidth }}
            title={t("guided.learnToPlay.intro.evy")}
            body={<p>{t(narration.bodyKey)}</p>}
            isLearnToPlay
            ariaModal
            closeLabel={t("common.close")}
            showFeedback={false}
            titleId="first-canon-narration-speaker"
            bodyId="first-canon-narration-body"
            footer={(
              <button
                ref={buttonRef}
                type="button"
                className="guided-tutorial-continue"
                onClick={() => firstCanonVisionDirector.acknowledge()}
              >
                {t("guided.contextual.understood")}
              </button>
            )}
          />
        </div>
      )}
    </>,
    document.body,
  );
}

export function PersistentContextualGoldenFrames() {
  const snapshot = useSyncExternalStore(subscribeContextual, readContextual, readContextual);
  if (typeof document === "undefined" || snapshot.persistentHighlights.length === 0) return null;
  return createPortal(
    <div className="persistent-contextual-golden-frames" aria-hidden="true">
      {snapshot.persistentHighlights.map((highlight, index) => highlight.kind === "card"
        ? <AnchoredGoldenFrame key={`${highlight.instanceId}:${index}`} target={{ kind: "card", instanceId: highlight.instanceId, padding: highlight.padding }} />
        : <AnchoredGoldenFrame key={`${highlight.anchor}:${index}`} target={{ kind: "surface", anchor: highlight.anchor, padding: highlight.padding }} />)}
    </div>,
    document.body,
  );
}

function readViewport(): GuidedSize {
  if (typeof window === "undefined") return Object.freeze({ width: 1280, height: 720 });
  return Object.freeze({ width: window.innerWidth, height: window.innerHeight });
}

function guidedRectEqual(left: GuidedRect | undefined, right: GuidedRect | undefined): boolean {
  if (!left || !right) return left === right;
  return left.key === right.key
    && left.left === right.left
    && left.top === right.top
    && left.width === right.width
    && left.height === right.height;
}

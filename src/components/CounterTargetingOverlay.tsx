import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { findManualInvokedTargetTrigger, manualInvokedTargetRequirement } from "../engine/EffectResolver";
import { getPowerEndurance } from "../engine/StaticEffects";
import { targetCandidates } from "../engine/Targeting";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { targetArrowCurve } from "./tacticalArrowGeometry";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";
import { Card } from "./Card";
import { shouldRevealOverlappedTargets } from "./targetingGeometry";
import { guidedAnchorRegistry, guidedCardAnchorKey, guidedSurfaceAnchorKey } from "../guidance";

const ARROW_COLOR = "#4ade80";

export function CounterTargetingOverlay({ game }: { game: GameState }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const counterTargeting = useGameStore((state) => state.counterTargeting);
  const updatePointer = useGameStore((state) => state.updateCounterTargetPointer);
  const deselectTarget = useGameStore((state) => state.deselectCounterTarget);
  const cancelTargeting = useGameStore((state) => state.cancelCounterTargeting);
  const confirmTargeting = useGameStore((state) => state.confirmCounterTargeting);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnd, setLockedEnd] = useState<{ x: number; y: number } | undefined>();
  const [sourceRevealsTargets, setSourceRevealsTargets] = useState(false);

  const source = counterTargeting ? findBattlefieldCard(game, counterTargeting.sourceId) : undefined;
  const requirement = manualInvokedTargetRequirement(source);
  // A manual enters-the-battlefield trigger must resolve — right-click may deselect but never
  // cancel it. Read from the card's own data, never from a card name.
  const preserveRequiredEffect = Boolean(findManualInvokedTargetTrigger(source));
  const target = counterTargeting?.targetId ? findBattlefieldCard(game, counterTargeting.targetId) : undefined;
  const end = lockedEnd ?? (counterTargeting ? { x: counterTargeting.x, y: counterTargeting.y } : undefined);
  const targetCandidateIds = source && requirement
    ? targetCandidates(game, source.controller, requirement).map((candidate) => candidate.instanceId)
    : [];
  const overlapTargetIds = [...new Set([
    ...targetCandidateIds,
    ...(counterTargeting?.targetId ? [counterTargeting.targetId] : []),
  ])];
  const overlapTargetSignature = overlapTargetIds.join("|");
  const targetingActive = Boolean(counterTargeting);

  useEffect(() => {
    if (!counterTargeting) return;
    const currentOverlapTargetIds = overlapTargetIds;

    function move(event: MouseEvent) {
      updatePointer(event.clientX, event.clientY);
      const sourceRect = sourceRef.current?.getBoundingClientRect();
      const targetRects = currentOverlapTargetIds
        .map((targetId) => findBattlefieldSlot(targetId)?.getBoundingClientRect())
        .filter((rect): rect is DOMRect => Boolean(rect));
      setSourceRevealsTargets(Boolean(
        sourceRect &&
        shouldRevealOverlappedTargets(
          sourceRect,
          targetRects,
          { x: event.clientX, y: event.clientY },
        ),
      ));
    }

    function contextMenu(event: MouseEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (useGameStore.getState().counterTargeting?.targetId) deselectTarget();
      else if (!preserveRequiredEffect) cancelTargeting();
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [cancelTargeting, deselectTarget, overlapTargetSignature, preserveRequiredEffect, targetingActive, updatePointer]);

  useEffect(() => {
    if (!targetingActive) setSourceRevealsTargets(false);
  }, [targetingActive]);

  useLayoutEffect(() => {
    if (!counterTargeting) return;
    const activeTargeting = counterTargeting;
    let frame = 0;

    function measure() {
      const sourceRect = sourceRef.current?.getBoundingClientRect();
      if (sourceRect) {
        setStart({
          x: sourceRect.left + sourceRect.width * 0.14,
          y: sourceRect.top + sourceRect.height * 0.5,
        });
      }
      if (activeTargeting.targetId) {
        const targetElement = document.querySelector<HTMLElement>(`[data-card-id="${activeTargeting.targetId}"]`);
        const rect = targetElement?.getBoundingClientRect();
        setLockedEnd(
          rect
            ? {
                x: rect.left + rect.width * 0.5,
                y: rect.top + rect.height * 0.5,
              }
            : undefined,
        );
      } else {
        setLockedEnd(undefined);
      }
    }

    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }

    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [counterTargeting, game]);

  if (!counterTargeting || !source || !end) return null;

  const arrow = targetArrowCurve(start, end);
  const locked = Boolean(counterTargeting.targetId);
  const previewStats = target ? getBuffedStats(game, target) : undefined;
  const showFullSourceImage = shouldShowFullCardImage(source.definitionId);

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[104] h-screen w-screen overflow-visible">
        <TacticalArrowGlyph curve={arrow} color={ARROW_COLOR} />
      </svg>
      <aside
        data-source-overlap={sourceRevealsTargets ? "true" : undefined}
        className="counter-target-source-panel"
      >
        <div
          ref={(element) => {
            sourceRef.current = element;
            guidedAnchorRegistry.set(
              guidedCardAnchorKey(source.instanceId),
              `counter-targeting:source:${source.instanceId}`,
              element,
            );
          }}
          className="counter-target-source-card"
        >
          <Card
            game={game}
            card={source}
            selectionDisabled
            suppressContextMenu
            suppressHoverOverlay
            suppressCardId
            suppressStabilizing
            highRes
            showFullImage={showFullSourceImage}
            showCostBadge={showFullSourceImage}
            preferNativeImageRendering={showFullSourceImage}
          />
        </div>
        <div className="counter-target-preview hf-ui-panel-soft">
          <span className="text-[#d6b879]">{target ? localizedCardName(target, language) : t("target.noSelection")}</span>
          <strong className="text-[#91f58f]">{previewStats ? `${previewStats.power}/${previewStats.endurance}` : "--/--"}</strong>
        </div>
        <div className="counter-target-actions">
          <button
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("selection.cancelAction"),
              "counter-targeting:cancel",
              element,
            )}
            data-audio-click="valid"
            className="counter-target-button counter-target-cancel"
            onClick={locked ? deselectTarget : cancelTargeting}
            title={locked ? t("target.deselect") : t("target.cancelCard")}
            aria-label={locked ? t("target.deselect") : t("target.cancelCard")}
          >
            {locked ? <X size={22} /> : t("common.cancel")}
          </button>
          <button
            ref={(element) => guidedAnchorRegistry.set(
              guidedSurfaceAnchorKey("selection.primaryAction"),
              "counter-targeting:confirm",
              element,
            )}
            data-audio-click={locked ? "valid" : undefined}
            className="counter-target-button counter-target-confirm"
            disabled={!locked}
            onClick={confirmTargeting}
            title={t("common.confirm")}
          >
            <Check size={24} />
          </button>
        </div>
      </aside>
    </>
  );
}

function findBattlefieldCard(game: GameState, id: string): CardInstance | undefined {
  return [...game.player.field, ...game.host.field].find((card) => card.instanceId === id);
}

function getBuffedStats(game: GameState, card: CardInstance): { power: number; endurance: number } {
  const stats = getPowerEndurance(game, card);
  return { power: stats.power + 1, endurance: stats.endurance + 1 };
}

function findBattlefieldSlot(cardId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-card-slot-id]"))
    .find((element) => element.dataset.cardSlotId === cardId);
}

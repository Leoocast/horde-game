import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardInstance, GameState, TargetRequirement } from "../engine/GameTypes";
import { targetCandidatesWithSelectedTargets, targetRequirementIsBuff } from "../engine/Targeting";
import { localizedCardName } from "../i18n/cardLocalization";
import { useTranslation } from "../i18n/useTranslation";
import { useGameStore } from "../store/useGameStore";
import { useLanguageStore } from "../store/useLanguageStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { targetArrowCurve } from "./tacticalArrowGeometry";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";
import { Card } from "./Card";
import { shouldRevealOverlappedTargets } from "./targetingGeometry";

const FRIENDLY_ARROW = "#4ade80";
const ENEMY_ARROW = "#f04438";

export function SpellTargetingOverlay({ game }: { game: GameState }) {
  const t = useTranslation();
  const language = useLanguageStore((state) => state.language);
  const spellTargeting = useGameStore((state) => state.spellTargeting);
  const updatePointer = useGameStore((state) => state.updateSpellTargetPointer);
  const lockTarget = useGameStore((state) => state.lockSpellTarget);
  const deselectTarget = useGameStore((state) => state.deselectSpellTarget);
  const cancelTargeting = useGameStore((state) => state.cancelSpellTargeting);
  const confirmTargeting = useGameStore((state) => state.confirmSpellTargeting);
  const panelRef = useRef<HTMLElement>(null);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnds, setLockedEnds] = useState<Record<string, { x: number; y: number }>>({});
  const [sourceRevealsTargets, setSourceRevealsTargets] = useState(false);

  const spell = spellTargeting ? game.player.hand.find((card) => card.instanceId === spellTargeting.handId) : undefined;
  const requirements = spell?.requiresTargets ?? [];
  const complete = Boolean(spellTargeting && spell && requirements.every((req) => Boolean(spellTargeting.targets[req.id])));
  const hasAnyTarget = Boolean(spellTargeting && Object.keys(spellTargeting.targets).length > 0);
  const activeReq = spellTargeting && spell ? requirements[Math.min(spellTargeting.stepIndex, Math.max(requirements.length - 1, 0))] : undefined;
  const activeTargetId = activeReq && spellTargeting ? String(spellTargeting.targets[activeReq.id] ?? "") : "";
  const activeTarget = activeTargetId ? findBattlefieldCard(game, activeTargetId) : undefined;
  const arrowColor = spell && activeReq && targetRequirementIsBuff(spell, activeReq) ? FRIENDLY_ARROW : ENEMY_ARROW;
  const followEnd = spellTargeting ? { x: spellTargeting.x, y: spellTargeting.y } : undefined;
  const targetingTargets = spellTargeting?.targets;
  const activeCandidateIds = spellTargeting && activeReq
    ? targetCandidatesWithSelectedTargets(game, "player", activeReq, spellTargeting.targets).map((candidate) => candidate.instanceId)
    : [];
  const selectedTargetIds = spellTargeting
    ? Object.values(spellTargeting.targets).flatMap((target) => Array.isArray(target) ? target : [target])
    : [];
  const overlapTargetIds = [...new Set([...activeCandidateIds, ...selectedTargetIds])];
  const overlapTargetSignature = overlapTargetIds.join("|");
  const targetingActive = Boolean(spellTargeting);

  useEffect(() => {
    if (!spellTargeting || !spell) return;
    const activeSpell = spell;
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

    function click(event: MouseEvent) {
      // The capture listener can see battlefield cards behind the targeting UI via
      // elementsFromPoint(). Never reinterpret a control click as a target click.
      if (event.target instanceof Element && event.target.closest("[data-spell-targeting-ui='true']")) return;
      const req = useGameStore.getState().spellTargeting ? activeSpell.requiresTargets[Math.min(useGameStore.getState().spellTargeting?.stepIndex ?? 0, activeSpell.requiresTargets.length - 1)] : undefined;
      if (!req) return;
      const cardId = findCardIdAtPoint(event.clientX, event.clientY);
      if (!cardId) return;
      const state = useGameStore.getState();
      const valid = targetCandidatesWithSelectedTargets(state.game, "player", req, state.spellTargeting?.targets ?? {}).some((candidate) => candidate.instanceId === cardId);
      if (valid) {
        event.preventDefault();
        event.stopPropagation();
        lockTarget(cardId);
      }
    }

    function contextMenu(event: MouseEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (hasAnyTarget) deselectTarget();
      else cancelTargeting();
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("click", click, true);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("click", click, true);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [cancelTargeting, deselectTarget, hasAnyTarget, lockTarget, overlapTargetSignature, spell, targetingActive, updatePointer]);

  useEffect(() => {
    if (!targetingActive) setSourceRevealsTargets(false);
  }, [targetingActive]);

  useLayoutEffect(() => {
    if (!targetingTargets) {
      return;
    }
    const currentTargets = targetingTargets;
    let frame = 0;

    function measure() {
      const sourceRect = sourceRef.current?.getBoundingClientRect();
      if (sourceRect) {
        setStart({
          x: sourceRect.left + sourceRect.width * 0.14,
          y: sourceRect.top + sourceRect.height * 0.5,
        });
      }
      const nextLockedEnds: Record<string, { x: number; y: number }> = {};
      for (const [reqId, rawTarget] of Object.entries(currentTargets)) {
        const targetId = Array.isArray(rawTarget) ? rawTarget[0] : rawTarget;
        const targetElement = document.querySelector<HTMLElement>(`[data-card-id="${targetId}"]`);
        const rect = targetElement?.getBoundingClientRect();
        if (rect) {
          nextLockedEnds[reqId] = {
            x: rect.left + rect.width * 0.5,
            y: rect.top + rect.height * 0.5,
          };
        }
      }
      setLockedEnds(nextLockedEnds);
    }

    function schedule() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    }

    schedule();
    const panel = panelRef.current;
    panel?.addEventListener("animationend", schedule);
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      panel?.removeEventListener("animationend", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [activeTargetId, targetingTargets]);

  if (!spellTargeting || !spell || !activeReq || !followEnd) return null;

  const showFullSourceImage = shouldShowFullCardImage(spell.definitionId);
  const followArrow = targetArrowCurve(start, followEnd);
  const currentLabel = activeReq.controller === "SELF"
    ? t("target.chooseAlly")
    : activeReq.controller === "OPPONENT"
      ? t("target.chooseEnemy")
      : t("target.chooseCreature");
  const lockedArrows = requirements
    .map((req) => {
      const end = lockedEnds[req.id];
      if (!end) return undefined;
      return { req, arrow: targetArrowCurve(start, end), color: targetRequirementIsBuff(spell, req) ? FRIENDLY_ARROW : ENEMY_ARROW };
    })
    .filter((item): item is { req: TargetRequirement; arrow: ReturnType<typeof targetArrowCurve>; color: string } => Boolean(item));

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[104] h-screen w-screen overflow-visible">
        {lockedArrows.map(({ req, arrow, color }) => (
          <TacticalArrowGlyph key={req.id} curve={arrow} color={color} />
        ))}
        {!complete && <TacticalArrowGlyph curve={followArrow} color={arrowColor} />}
      </svg>
      <aside
        ref={panelRef}
        data-spell-targeting-ui="true"
        data-source-overlap={sourceRevealsTargets ? "true" : undefined}
        className="counter-target-source-panel"
      >
        <div
          ref={sourceRef}
          data-spell-source-card-id={spell.instanceId}
          className="counter-target-source-card"
        >
          <Card
            game={game}
            card={spell}
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
        <div className="counter-target-preview old-panel-soft">
          <span className="text-[#d6b879]">{complete ? t("target.ready") : currentLabel}</span>
          <strong className={activeReq.controller === "SELF" ? "text-[#91f58f]" : "text-[#ffcf8a]"}>{activeTarget ? localizedCardName(activeTarget, language) : t("target.noSelection")}</strong>
        </div>
        <div className="counter-target-actions">
          <button
            data-audio-click="valid"
            className="counter-target-button counter-target-cancel"
            onClick={hasAnyTarget ? deselectTarget : cancelTargeting}
            title={hasAnyTarget ? t("target.deselect") : t("target.cancelCard")}
            aria-label={hasAnyTarget ? t("target.deselect") : t("target.cancelCard")}
          >
            {hasAnyTarget ? <X size={22} /> : t("common.cancel")}
          </button>
          <button data-audio-click={complete ? "valid" : undefined} className="counter-target-button counter-target-confirm" disabled={!complete} onClick={confirmTargeting} title={t("common.confirm")}>
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

function findCardIdAtPoint(x: number, y: number): string | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    const cardElement = element.closest<HTMLElement>("[data-card-id]");
    if (cardElement?.dataset.cardId) return cardElement.dataset.cardId;
  }
  return undefined;
}

function findBattlefieldSlot(cardId: string): HTMLElement | undefined {
  return Array.from(document.querySelectorAll<HTMLElement>("[data-card-slot-id]"))
    .find((element) => element.dataset.cardSlotId === cardId);
}

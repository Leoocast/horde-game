import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardInstance, GameState, TargetRequirement } from "../engine/GameTypes";
import { targetCandidates } from "../engine/Targeting";
import { useGameStore } from "../store/useGameStore";
import { Card } from "./Card";

const FRIENDLY_ARROW = "#4ade80";
const ENEMY_ARROW = "#f59e0b";

export function SpellTargetingOverlay({ game }: { game: GameState }) {
  const spellTargeting = useGameStore((state) => state.spellTargeting);
  const updatePointer = useGameStore((state) => state.updateSpellTargetPointer);
  const lockTarget = useGameStore((state) => state.lockSpellTarget);
  const deselectTarget = useGameStore((state) => state.deselectSpellTarget);
  const cancelTargeting = useGameStore((state) => state.cancelSpellTargeting);
  const confirmTargeting = useGameStore((state) => state.confirmSpellTargeting);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnds, setLockedEnds] = useState<Record<string, { x: number; y: number }>>({});

  const spell = spellTargeting ? game.player.hand.find((card) => card.instanceId === spellTargeting.handId) : undefined;
  const requirements = spell?.requiresTargets ?? [];
  const complete = Boolean(spellTargeting && spell && requirements.every((req) => Boolean(spellTargeting.targets[req.id])));
  const hasAnyTarget = Boolean(spellTargeting && Object.keys(spellTargeting.targets).length > 0);
  const activeReq = spellTargeting && spell ? requirements[Math.min(spellTargeting.stepIndex, Math.max(requirements.length - 1, 0))] : undefined;
  const activeTargetId = activeReq && spellTargeting ? String(spellTargeting.targets[activeReq.id] ?? "") : "";
  const activeTarget = activeTargetId ? findBattlefieldCard(game, activeTargetId) : undefined;
  const arrowColor = activeReq?.controller === "SELF" ? FRIENDLY_ARROW : ENEMY_ARROW;
  const followEnd = spellTargeting ? { x: spellTargeting.x, y: spellTargeting.y } : undefined;

  useEffect(() => {
    if (!spellTargeting || !spell) return;
    const activeSpell = spell;

    function move(event: MouseEvent) {
      updatePointer(event.clientX, event.clientY);
    }

    function click(event: MouseEvent) {
      const req = useGameStore.getState().spellTargeting ? activeSpell.requiresTargets[Math.min(useGameStore.getState().spellTargeting?.stepIndex ?? 0, activeSpell.requiresTargets.length - 1)] : undefined;
      if (!req) return;
      const cardId = findCardIdAtPoint(event.clientX, event.clientY);
      if (!cardId) return;
      const valid = targetCandidates(useGameStore.getState().game, "player", req).some((candidate) => candidate.instanceId === cardId);
      if (valid) {
        event.preventDefault();
        event.stopPropagation();
        lockTarget(cardId);
      }
    }

    function contextMenu(event: MouseEvent) {
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
  }, [cancelTargeting, deselectTarget, hasAnyTarget, lockTarget, spell, spellTargeting, updatePointer]);

  useLayoutEffect(() => {
    if (!spellTargeting) return;
    const currentTargeting = spellTargeting;
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
      for (const [reqId, rawTarget] of Object.entries(currentTargeting.targets)) {
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
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [activeTargetId, spellTargeting]);

  if (!spellTargeting || !spell || !activeReq || !followEnd) return null;

  const followArrow = makeTargetArrow(start, followEnd);
  const currentLabel = activeReq.controller === "SELF" ? "Choose ally creature" : "Choose enemy creature";
  const lockedArrows = requirements
    .map((req) => {
      const end = lockedEnds[req.id];
      if (!end) return undefined;
      return { req, arrow: makeTargetArrow(start, end), color: req.controller === "SELF" ? FRIENDLY_ARROW : ENEMY_ARROW };
    })
    .filter((item): item is { req: TargetRequirement; arrow: ReturnType<typeof makeTargetArrow>; color: string } => Boolean(item));

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[104] h-screen w-screen overflow-visible">
        <defs>
          <filter id="spell-target-arrow-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feColorMatrix in="blur" type="matrix" values="0 0 0 0 1 0 0 0 0 0.52 0 0 0 0 0.05 0 0 0 0.72 0" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="spell-target-arrow-gradient" gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={followEnd.x} y2={followEnd.y}>
            <stop offset="0%" stopColor={arrowColor} stopOpacity="0" />
            <stop offset="18%" stopColor={arrowColor} stopOpacity="0.28" />
            <stop offset="60%" stopColor={arrowColor} stopOpacity="0.88" />
            <stop offset="100%" stopColor={arrowColor} stopOpacity="0.96" />
          </linearGradient>
        </defs>
        {lockedArrows.map(({ req, arrow, color }) => (
          <g key={req.id} filter="url(#spell-target-arrow-glow)">
            <path d={arrow.path} fill="none" stroke={color} strokeLinecap="round" strokeWidth={9} opacity="0.13" />
            <path d={arrow.path} fill="none" stroke={color} strokeLinecap="round" strokeWidth={6} opacity="0.84" />
            <polygon points={arrow.tip} fill={color} opacity="0.92" />
          </g>
        ))}
        {!complete && (
          <g filter="url(#spell-target-arrow-glow)">
            <path d={followArrow.path} fill="none" stroke={arrowColor} strokeLinecap="round" strokeWidth={9} opacity="0.13" />
            <path d={followArrow.path} fill="none" stroke="url(#spell-target-arrow-gradient)" strokeLinecap="round" strokeWidth={6} opacity="0.94" />
            <polygon points={followArrow.tip} fill={arrowColor} opacity="0.96" />
          </g>
        )}
      </svg>
      <aside className="counter-target-source-panel">
        <div ref={sourceRef} className="counter-target-source-card">
          <Card game={game} card={spell} selectionDisabled suppressContextMenu suppressCardId suppressSummoningSickness hideStats />
        </div>
        <div className="counter-target-preview old-panel-soft">
          <span className="text-[#d6b879]">{complete ? "Ready to cast" : currentLabel}</span>
          <strong className={activeReq.controller === "SELF" ? "text-[#91f58f]" : "text-[#ffcf8a]"}>{activeTarget ? activeTarget.displayName : "No target selected"}</strong>
        </div>
        <div className="counter-target-actions">
          <button data-audio-click={complete ? "valid" : undefined} className="counter-target-button counter-target-confirm" disabled={!complete} onClick={confirmTargeting} title="Confirm">
            <Check size={24} />
          </button>
          <button data-audio-click="valid" className="counter-target-button counter-target-cancel" onClick={complete ? deselectTarget : cancelTargeting} title={complete ? "Deselect" : "Cancel"}>
            {complete ? "Deselect" : <X size={24} />}
          </button>
        </div>
      </aside>
    </>
  );
}

function findBattlefieldCard(game: GameState, id: string): CardInstance | undefined {
  return [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === id);
}

function findCardIdAtPoint(x: number, y: number): string | undefined {
  for (const element of document.elementsFromPoint(x, y)) {
    const cardElement = element.closest<HTMLElement>("[data-card-id]");
    if (cardElement?.dataset.cardId) return cardElement.dataset.cardId;
  }
  return undefined;
}

function makeTargetArrow(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const px = -dy / length;
  const py = dx / length;
  const curve = Math.min(64, Math.max(24, length * 0.16));
  const control = { x: (start.x + end.x) / 2 + px * curve, y: (start.y + end.y) / 2 + py * curve };
  const tangentX = end.x - control.x;
  const tangentY = end.y - control.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const tx = tangentX / tangentLength;
  const ty = tangentY / tangentLength;
  const tpx = -ty;
  const tpy = tx;
  const headLength = 24;
  const headWing = 12;
  const neckAt = { x: end.x - tx * headLength, y: end.y - ty * headLength };
  const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${neckAt.x} ${neckAt.y}`;
  const tip = [`${end.x},${end.y}`, `${end.x - tx * headLength + tpx * headWing},${end.y - ty * headLength + tpy * headWing}`, `${end.x - tx * headLength - tpx * headWing},${end.y - ty * headLength - tpy * headWing}`].join(" ");
  return { path, tip };
}

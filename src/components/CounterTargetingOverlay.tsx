import { Check, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CardInstance, GameState } from "../engine/GameTypes";
import { getPowerToughness } from "../engine/StaticEffects";
import { useGameStore } from "../store/useGameStore";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";
import { Card } from "./Card";

const ARROW_COLOR = "#4ade80";

export function CounterTargetingOverlay({ game }: { game: GameState }) {
  const counterTargeting = useGameStore((state) => state.counterTargeting);
  const updatePointer = useGameStore((state) => state.updateCounterTargetPointer);
  const deselectTarget = useGameStore((state) => state.deselectCounterTarget);
  const cancelTargeting = useGameStore((state) => state.cancelCounterTargeting);
  const confirmTargeting = useGameStore((state) => state.confirmCounterTargeting);
  const sourceRef = useRef<HTMLDivElement>(null);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnd, setLockedEnd] = useState<{ x: number; y: number } | undefined>();

  const source = counterTargeting ? findBattlefieldCard(game, counterTargeting.sourceId) : undefined;
  const target = counterTargeting?.targetId ? findBattlefieldCard(game, counterTargeting.targetId) : undefined;
  const end = lockedEnd ?? (counterTargeting ? { x: counterTargeting.x, y: counterTargeting.y } : undefined);

  useEffect(() => {
    if (!counterTargeting) return;

    function move(event: MouseEvent) {
      updatePointer(event.clientX, event.clientY);
    }

    function contextMenu(event: MouseEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (useGameStore.getState().counterTargeting?.targetId) deselectTarget();
      else cancelTargeting();
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [cancelTargeting, counterTargeting, deselectTarget, updatePointer]);

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

  const arrow = makeTargetArrow(start, end);
  const locked = Boolean(counterTargeting.targetId);
  const previewStats = target ? getBuffedStats(game, target) : undefined;

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[104] h-screen w-screen overflow-visible">
        <defs>
          <filter id="counter-target-arrow-glow" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
            <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="expanded" />
            <feGaussianBlur in="expanded" stdDeviation="3.2" result="blurred" />
            <feComposite in="blurred" in2="SourceAlpha" operator="out" result="outerAlpha" />
            <feFlood floodColor={ARROW_COLOR} floodOpacity="0.82" result="glowColor" />
            <feComposite in="glowColor" in2="outerAlpha" operator="in" result="outerGlow" />
            <feMerge>
              <feMergeNode in="outerGlow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="counter-target-arrow-gradient" gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
            <stop offset="0%" stopColor={ARROW_COLOR} stopOpacity="0" />
            <stop offset="16%" stopColor={ARROW_COLOR} stopOpacity="0.28" />
            <stop offset="58%" stopColor={ARROW_COLOR} stopOpacity="0.9" />
            <stop offset="100%" stopColor={ARROW_COLOR} stopOpacity="0.96" />
          </linearGradient>
        </defs>
        <g filter="url(#counter-target-arrow-glow)">
          <TacticalArrowGlyph path={arrow.path} tip={arrow.tip} color={ARROW_COLOR} stroke="url(#counter-target-arrow-gradient)" />
        </g>
      </svg>
      <aside className="counter-target-source-panel">
        <div ref={sourceRef} className="counter-target-source-card">
          <Card game={game} card={source} selectionDisabled suppressContextMenu suppressCardId suppressSummoningSickness hideStats />
        </div>
        <div className="counter-target-preview old-panel-soft">
          <span className="text-[#d6b879]">{target ? target.displayName : "No target selected"}</span>
          <strong className="text-[#91f58f]">{previewStats ? `${previewStats.power}/${previewStats.toughness}` : "--/--"}</strong>
        </div>
        <div className="counter-target-actions">
          <button
            data-audio-click="valid"
            className="counter-target-button counter-target-cancel"
            onClick={locked ? deselectTarget : cancelTargeting}
            title={locked ? "Deselect target" : "Cancel card"}
            aria-label={locked ? "Deselect target" : "Cancel card"}
          >
            {locked ? <X size={22} /> : "Cancel"}
          </button>
          <button data-audio-click={locked ? "valid" : undefined} className="counter-target-button counter-target-confirm" disabled={!locked} onClick={confirmTargeting} title="Confirm">
            <Check size={24} />
          </button>
        </div>
      </aside>
    </>
  );
}

function findBattlefieldCard(game: GameState, id: string): CardInstance | undefined {
  return [...game.player.battlefield, ...game.horde.battlefield].find((card) => card.instanceId === id);
}

function getBuffedStats(game: GameState, card: CardInstance): { power: number; toughness: number } {
  const stats = getPowerToughness(game, card);
  return { power: stats.power + 1, toughness: stats.toughness + 1 };
}

function makeTargetArrow(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const curve = Math.min(64, Math.max(24, length * 0.16));
  const control = {
    x: (start.x + end.x) / 2 + px * curve,
    y: (start.y + end.y) / 2 + py * curve,
  };
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

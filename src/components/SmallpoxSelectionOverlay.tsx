import { useEffect, useLayoutEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";

const ARROW_COLOR = "#f04438";

export function SmallpoxSelectionOverlay({ game: _game }: { game: GameState }) {
  const smallpoxSelection = useGameStore((state) => state.smallpoxSelection);
  const smallpoxCard = useGameStore((state) => state.smallpoxCard);
  const updatePointer = useGameStore((state) => state.updateSmallpoxSelectionPointer);
  const deselectTarget = useGameStore((state) => state.deselectSmallpoxSelectionTarget);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnd, setLockedEnd] = useState<{ x: number; y: number } | undefined>();

  const end = lockedEnd ?? (smallpoxSelection ? { x: smallpoxSelection.x, y: smallpoxSelection.y } : undefined);

  useEffect(() => {
    if (!smallpoxSelection) return;

    function move(event: MouseEvent) {
      updatePointer(event.clientX, event.clientY);
    }

    function contextMenu(event: MouseEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (useGameStore.getState().smallpoxSelection?.targetId) deselectTarget();
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [smallpoxSelection, deselectTarget, updatePointer]);

  useLayoutEffect(() => {
    if (!smallpoxSelection || !smallpoxCard) return;
    const activeSelection = smallpoxSelection;
    let frame = 0;

    function measure() {
      const sourceRect = document.querySelector<HTMLElement>(`[data-card-id="${smallpoxCard!.instanceId}"]`)?.getBoundingClientRect();
      if (sourceRect) {
        setStart({
          x: sourceRect.left + sourceRect.width * 0.5,
          y: sourceRect.top + sourceRect.height * 0.5,
        });
      }
      if (activeSelection.targetId) {
        const targetElement = activeSelection.kind === "sacrifice-land"
          ? document.querySelector<HTMLElement>("[data-smallpox-mana-target='true']")
          : document.querySelector<HTMLElement>(`[data-card-id="${activeSelection.targetId}"]`);
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
  }, [smallpoxSelection, smallpoxCard]);

  if (!smallpoxSelection || !end) return null;

  const arrow = makeTargetArrow(start, end);

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[111] h-screen w-screen overflow-visible">
        <defs>
          <filter id="smallpox-target-arrow-glow" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
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
          <linearGradient id="smallpox-target-arrow-gradient" gradientUnits="userSpaceOnUse" x1={start.x} y1={start.y} x2={end.x} y2={end.y}>
            <stop offset="0%" stopColor={ARROW_COLOR} stopOpacity="0" />
            <stop offset="16%" stopColor={ARROW_COLOR} stopOpacity="0.28" />
            <stop offset="58%" stopColor={ARROW_COLOR} stopOpacity="0.9" />
            <stop offset="100%" stopColor={ARROW_COLOR} stopOpacity="0.96" />
          </linearGradient>
        </defs>
        <g filter="url(#smallpox-target-arrow-glow)">
          <TacticalArrowGlyph path={arrow.path} tip={arrow.tip} color={ARROW_COLOR} stroke="url(#smallpox-target-arrow-gradient)" />
        </g>
      </svg>
    </>
  );
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

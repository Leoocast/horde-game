import { useEffect, useLayoutEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { targetArrowCurve } from "./tacticalArrowGeometry";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";

const ARROW_COLOR = "#f04438";

export function TributeOfTheFourSorrowsSelectionOverlay({ game: _game }: { game: GameState }) {
  const tributeOfTheFourSorrowsSelection = useGameStore((state) => state.tributeOfTheFourSorrowsSelection);
  const tributeOfTheFourSorrowsCard = useGameStore((state) => state.tributeOfTheFourSorrowsCard);
  const updatePointer = useGameStore((state) => state.updateTributeOfTheFourSorrowsSelectionPointer);
  const deselectTarget = useGameStore((state) => state.deselectTributeOfTheFourSorrowsSelectionTarget);
  const [start, setStart] = useState({ x: 0, y: 0 });
  const [lockedEnd, setLockedEnd] = useState<{ x: number; y: number } | undefined>();

  const end = lockedEnd ?? (tributeOfTheFourSorrowsSelection ? { x: tributeOfTheFourSorrowsSelection.x, y: tributeOfTheFourSorrowsSelection.y } : undefined);

  useEffect(() => {
    if (!tributeOfTheFourSorrowsSelection) return;

    function move(event: MouseEvent) {
      updatePointer(event.clientX, event.clientY);
    }

    function contextMenu(event: MouseEvent) {
      if (event.shiftKey) return;
      event.preventDefault();
      if (useGameStore.getState().tributeOfTheFourSorrowsSelection?.targetId) deselectTarget();
    }

    window.addEventListener("mousemove", move);
    window.addEventListener("contextmenu", contextMenu);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("contextmenu", contextMenu);
    };
  }, [tributeOfTheFourSorrowsSelection, deselectTarget, updatePointer]);

  useLayoutEffect(() => {
    if (!tributeOfTheFourSorrowsSelection || !tributeOfTheFourSorrowsCard) return;
    const activeSelection = tributeOfTheFourSorrowsSelection;
    let frame = 0;

    function measure() {
      const sourceRect = document.querySelector<HTMLElement>(`[data-card-id="${tributeOfTheFourSorrowsCard!.instanceId}"]`)?.getBoundingClientRect();
      if (sourceRect) {
        setStart({
          x: sourceRect.left + sourceRect.width * 0.5,
          y: sourceRect.top + sourceRect.height * 0.5,
        });
      }
      if (activeSelection.targetId) {
        const targetElement = activeSelection.kind === "sacrifice-land"
          ? document.querySelector<HTMLElement>("[data-tribute-of-the-four-sorrows-mana-target='true']")
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
  }, [tributeOfTheFourSorrowsSelection, tributeOfTheFourSorrowsCard]);

  if (!tributeOfTheFourSorrowsSelection || !end) return null;

  const arrow = targetArrowCurve(start, end);

  return (
    <>
      <div data-audio-click="off" className="counter-target-backdrop" />
      <svg className="pointer-events-none fixed inset-0 z-[111] h-screen w-screen overflow-visible">
        <TacticalArrowGlyph curve={arrow} color={ARROW_COLOR} />
      </svg>
    </>
  );
}

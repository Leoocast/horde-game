import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";
import { isBehindInStackOrder, visibleDefenseArrowLinks } from "./battlefieldLayout";
import { combatArrowCurve, tacticalArrowCurvesMatch, type TacticalArrowCurve } from "./tacticalArrowGeometry";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";

const DEFENSE_ARROW_COLOR = "#66d8ff";
const PLAYER_ATTACK_ARROW_COLOR = "#f28a35";
const ARROW_FADE_OUT_MS = 280;
const STACKED_ARROW_LEFT_INSET_PX = 24;

type Arrow = {
  id: string;
  color: string;
  curve: TacticalArrowCurve;
};

export function CombatArrows({ game, hiddenDefenseLinkIds }: { game: GameState; hiddenDefenseLinkIds: ReadonlySet<string> }) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [exitingArrows, setExitingArrows] = useState<Arrow[]>([]);
  const exitTimers = useRef<Map<string, number>>(new Map());
  const [hiddenPlayerAttackArrowIds, setHiddenPlayerAttackArrowIds] = useState<Set<string>>(() => new Set());
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);
  const blockDrag = useGameStore((state) => state.blockDrag);
  const playerAttackDrag = useGameStore((state) => state.playerAttackDrag);
  const renderedArrows = useMemo(() => {
    const activeIds = new Set(arrows.map((arrow) => arrow.id));
    return [...arrows, ...exitingArrows.filter((arrow) => !activeIds.has(arrow.id))];
  }, [arrows, exitingArrows]);

  useEffect(() => {
    return () => {
      for (const timeout of exitTimers.current.values()) window.clearTimeout(timeout);
      exitTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (game.combat.playerAttackers.length === 0) {
      setHiddenPlayerAttackArrowIds(new Set());
    }
  }, [game.combat.playerAttackers]);

  useEffect(() => {
    if (!playerAttackAnimation) return;
    hideArrowIds(new Set([`player-attack-${playerAttackAnimation.attackerId}`]), setHiddenPlayerAttackArrowIds);
  }, [playerAttackAnimation]);

  useEffect(() => {
    let frame = 0;
    let active = true;
    let trackUntil = performance.now() + 500;
    const measure = () => {
      const next: Arrow[] = [];
      for (const { attackerId, blockerId } of visibleDefenseArrowLinks(game, hiddenDefenseLinkIds)) {
        const attacker = document.querySelector<HTMLElement>(`[data-card-id="${attackerId}"]`);
        if (!attacker) continue;
        const attackerRect = attacker.getBoundingClientRect();
        const arrowId = `${attackerId}-${blockerId}`;
        const blocker = document.querySelector<HTMLElement>(`[data-card-id="${blockerId}"]`);
        if (!blocker) continue;
        const blockerRect = blocker.getBoundingClientRect();
        const blockerIsBehindInStack = isCardBehindInStack(blocker);
        const start = {
          x: blockerIsBehindInStack ? blockerRect.left + STACKED_ARROW_LEFT_INSET_PX : blockerRect.left + blockerRect.width / 2,
          y: blockerRect.top + blockerRect.height * 0.18,
        };
        const attackerIsBehindInStack = isCardBehindInStack(attacker);
        const end = {
          x: attackerIsBehindInStack ? attackerRect.left + STACKED_ARROW_LEFT_INSET_PX : attackerRect.left + attackerRect.width / 2,
          y: attackerRect.top + attackerRect.height * 0.82,
        };
        next.push(makeArrow(arrowId, start, end, DEFENSE_ARROW_COLOR));
      }
      if (blockDrag) {
        const blocker = document.querySelector<HTMLElement>(`[data-card-id="${blockDrag.blockerId}"]`);
        if (blocker) {
          const blockerRect = blocker.getBoundingClientRect();
          const blockerIsBehindInStack = isCardBehindInStack(blocker);
          const start = {
            x: blockerIsBehindInStack ? blockerRect.left + STACKED_ARROW_LEFT_INSET_PX : blockerRect.left + blockerRect.width / 2,
            y: blockerRect.top + blockerRect.height * 0.18,
          };
          const end = { x: blockDrag.x, y: blockDrag.y };
          next.push(makeArrow(`drag-${blockDrag.blockerId}`, start, end, DEFENSE_ARROW_COLOR));
        }
      }
      const playerAttackTarget = getPlayerAttackTargetPoint();
      if (playerAttackTarget) {
        for (const attackerId of game.combat.playerAttackers) {
          const arrowId = `player-attack-${attackerId}`;
          if (hiddenPlayerAttackArrowIds.has(arrowId)) continue;
          const attacker = document.querySelector<HTMLElement>(`[data-card-id="${attackerId}"]`);
          if (!attacker) continue;
          const attackerRect = attacker.getBoundingClientRect();
          const attackerIsBehindInStack = isCardBehindInStack(attacker);
          const start = {
            x: attackerIsBehindInStack ? attackerRect.left + STACKED_ARROW_LEFT_INSET_PX : attackerRect.left + attackerRect.width / 2,
            y: attackerRect.top + attackerRect.height * 0.18,
          };
          next.push(makeArrow(arrowId, start, playerAttackTarget, PLAYER_ATTACK_ARROW_COLOR));
        }
      }
      if (playerAttackDrag) {
        const attacker = document.querySelector<HTMLElement>(`[data-card-id="${playerAttackDrag.attackerId}"]`);
        if (attacker) {
          const attackerRect = attacker.getBoundingClientRect();
          const attackerIsBehindInStack = isCardBehindInStack(attacker);
          const start = {
            x: attackerIsBehindInStack ? attackerRect.left + STACKED_ARROW_LEFT_INSET_PX : attackerRect.left + attackerRect.width / 2,
            y: attackerRect.top + attackerRect.height * 0.18,
          };
          const end = { x: playerAttackDrag.x, y: playerAttackDrag.y };
          next.push(makeArrow(`player-attack-drag-${playerAttackDrag.attackerId}`, start, end, PLAYER_ATTACK_ARROW_COLOR));
        }
      }
      setArrows((current) => {
        const nextIds = new Set(next.map((arrow) => arrow.id));
        const removed = current.filter((arrow) => !nextIds.has(arrow.id));
        const removedWithFade = removed.filter((arrow) => !arrow.id.startsWith("player-attack-drag-"));
        if (removedWithFade.length > 0) queueExitingArrows(removedWithFade, setExitingArrows, exitTimers.current);
        return arrowsMatch(current, next) ? current : next;
      });
    };

    // Cards use a short FLIP transition when another permanent leaves the row.
    // Follow their rendered positions while that transition runs so locked arrows
    // do not remain attached to the cards' old layout coordinates.
    const trackRenderedPositions = () => {
      if (!active) return;
      measure();
      if (performance.now() < trackUntil) frame = window.requestAnimationFrame(trackRenderedPositions);
    };
    const restartTracking = () => {
      trackUntil = performance.now() + 500;
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(trackRenderedPositions);
    };
    restartTracking();
    window.addEventListener("resize", restartTracking);
    window.addEventListener("scroll", restartTracking, true);
    return () => {
      active = false;
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", restartTracking);
      window.removeEventListener("scroll", restartTracking, true);
    };
  }, [game.combat.blockers, game.combat.hostAttackers, game.combat.playerAttackers, game.host.field, game.player.field, hiddenDefenseLinkIds, hiddenPlayerAttackArrowIds, blockDrag, playerAttackDrag]);

  return (
    <svg className="pointer-events-none fixed inset-0 z-[65] h-screen w-screen overflow-visible">
      <defs>
        <filter id="combat-arrow-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#050302" floodOpacity="0.9" />
        </filter>
      </defs>
      <AnimatePresence>
        {renderedArrows.map((arrow) => {
          const exiting = exitingArrows.some((item) => item.id === arrow.id) && !arrows.some((item) => item.id === arrow.id);
          return (
          <motion.g
            key={arrow.id}
            filter="url(#combat-arrow-shadow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: exiting ? 0 : 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <g className="combat-arrow-reveal">
              <TacticalArrowGlyph curve={arrow.curve} color={arrow.color} />
            </g>
          </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}

function getPlayerAttackTargetPoint(): { x: number; y: number } | undefined {
  const target = document.querySelector<HTMLElement>("[data-player-attack-target='host-deck']") ?? document.querySelector<HTMLElement>("[data-battlefield-drop-target='player-attack']");
  const rect = target?.getBoundingClientRect();
  if (!rect) return undefined;
  return { x: rect.left + rect.width * 0.5, y: rect.bottom };
}

function isCardBehindInStack(card: HTMLElement): boolean {
  const stack = card.closest<HTMLElement>('[data-stacked="true"]');
  const slot = card.closest<HTMLElement>(".battlefield-layout-slot");
  if (!stack || !slot) return false;

  const stackedSlots = Array.from(stack.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("battlefield-layout-slot"));
  return isBehindInStackOrder(slot, stackedSlots);
}

function queueExitingArrows(removed: Arrow[], setExitingArrows: (updater: (current: Arrow[]) => Arrow[]) => void, timers: Map<string, number>): void {
  setExitingArrows((current) => {
    const removedIds = new Set(removed.map((arrow) => arrow.id));
    return [...current.filter((arrow) => !removedIds.has(arrow.id)), ...removed];
  });

  for (const arrow of removed) {
    const existing = timers.get(arrow.id);
    if (existing) window.clearTimeout(existing);
    const timeout = window.setTimeout(() => {
      setExitingArrows((current) => current.filter((item) => item.id !== arrow.id));
      timers.delete(arrow.id);
    }, ARROW_FADE_OUT_MS + 40);
    timers.set(arrow.id, timeout);
  }
}

function hideArrowIds(arrowIds: Set<string>, setHiddenArrowIds: (updater: (current: Set<string>) => Set<string>) => void): void {
  setHiddenArrowIds((current) => {
    if ([...arrowIds].every((arrowId) => current.has(arrowId))) return current;
    const next = new Set(current);
    for (const arrowId of arrowIds) next.add(arrowId);
    return next;
  });
}

function arrowsMatch(current: Arrow[], next: Arrow[]): boolean {
  if (current.length !== next.length) return false;
  return current.every((arrow, index) => {
    const candidate = next[index];
    return Boolean(candidate && arrow.id === candidate.id && tacticalArrowCurvesMatch(arrow.curve, candidate.curve));
  });
}

function makeArrow(id: string, start: { x: number; y: number }, end: { x: number; y: number }, color: string): Arrow {
  return { id, color, curve: combatArrowCurve(start, end) };
}

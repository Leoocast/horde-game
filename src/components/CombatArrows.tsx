import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { isTutorialOverlayActive } from "../engine/Tutorial";
import { useGameStore } from "../store/useGameStore";
import { TacticalArrowGlyph } from "./TacticalArrowGlyph";

const DEFENSE_ARROW_COLOR = "#66d8ff";
const PLAYER_ATTACK_ARROW_COLOR = "#f28a35";
const HORDE_ATTACK_ARROW_CLEAR_MS = 470;
const ARROW_FADE_OUT_MS = 280;
const STACKED_ARROW_LEFT_INSET_PX = 24;

type Arrow = {
  id: string;
  color: string;
  path: string;
  tip: string;
  gradientId: string;
  startX: number;
  startY: number;
  tipX: number;
  tipY: number;
};

export function CombatArrows({ game }: { game: GameState }) {
  const [arrows, setArrows] = useState<Arrow[]>([]);
  const [exitingArrows, setExitingArrows] = useState<Arrow[]>([]);
  const exitTimers = useRef<Map<string, number>>(new Map());
  const [hiddenArrowIds, setHiddenArrowIds] = useState<Set<string>>(() => new Set());
  const [hiddenPlayerAttackArrowIds, setHiddenPlayerAttackArrowIds] = useState<Set<string>>(() => new Set());
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);
  const playerAttackAnimation = useGameStore((state) => state.playerAttackAnimation);
  const tutorialAcknowledgedStepId = useGameStore((state) => state.tutorialAcknowledgedStepId);
  const tutorialOverlayActive = isTutorialOverlayActive(game, tutorialAcknowledgedStepId);
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
    if (Object.keys(game.combat.blockers).length === 0) {
      setHiddenArrowIds(new Set());
    }
  }, [game.combat.blockers]);

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
    if (!hordeAttackAnimation) return;
    const arrowIds = new Set<string>();
    if (hordeAttackAnimation.blockerDies && hordeAttackAnimation.blockerId) {
      arrowIds.add(`${hordeAttackAnimation.attackerId}-${hordeAttackAnimation.blockerId}`);
    }
    if (hordeAttackAnimation.attackerDies) {
      for (const blockerId of game.combat.blockers[hordeAttackAnimation.attackerId] ?? []) {
        arrowIds.add(`${hordeAttackAnimation.attackerId}-${blockerId}`);
      }
    }
    if (arrowIds.size === 0) return;
    hideArrowIds(arrowIds, setHiddenArrowIds);
  }, [game.combat.blockers, hordeAttackAnimation]);

  useEffect(() => {
    if (!hordeAttackAnimation?.blockerId) return;
    const arrowId = `${hordeAttackAnimation.attackerId}-${hordeAttackAnimation.blockerId}`;
    if (hordeAttackAnimation.attackerDies || hordeAttackAnimation.blockerDies) return;
    const timeout = window.setTimeout(() => {
      hideArrowIds(new Set([arrowId]), setHiddenArrowIds);
    }, HORDE_ATTACK_ARROW_CLEAR_MS);
    return () => window.clearTimeout(timeout);
  }, [hordeAttackAnimation]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const next: Arrow[] = [];
      for (const [attackerId, blockerIds] of Object.entries(game.combat.blockers)) {
        const attacker = document.querySelector<HTMLElement>(`[data-card-id="${attackerId}"]`);
        if (!attacker) continue;
        const attackerRect = attacker.getBoundingClientRect();
        for (const blockerId of blockerIds) {
          const arrowId = `${attackerId}-${blockerId}`;
          if (hiddenArrowIds.has(arrowId)) continue;
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
          const start = { x: attackerRect.left + attackerRect.width / 2, y: attackerRect.top + attackerRect.height * 0.18 };
          next.push(makeArrow(arrowId, start, playerAttackTarget, PLAYER_ATTACK_ARROW_COLOR));
        }
      }
      if (playerAttackDrag) {
        const attacker = document.querySelector<HTMLElement>(`[data-card-id="${playerAttackDrag.attackerId}"]`);
        if (attacker) {
          const attackerRect = attacker.getBoundingClientRect();
          const start = { x: attackerRect.left + attackerRect.width / 2, y: attackerRect.top + attackerRect.height * 0.18 };
          const end = { x: playerAttackDrag.x, y: playerAttackDrag.y };
          next.push(makeArrow(`player-attack-drag-${playerAttackDrag.attackerId}`, start, end, PLAYER_ATTACK_ARROW_COLOR));
        }
      }
      setArrows((current) => {
        const nextIds = new Set(next.map((arrow) => arrow.id));
        const removed = current.filter((arrow) => !nextIds.has(arrow.id));
        const removedWithFade = removed.filter((arrow) => !arrow.id.startsWith("player-attack-drag-"));
        if (removedWithFade.length > 0) queueExitingArrows(removedWithFade, setExitingArrows, exitTimers.current);
        return next;
      });
    };
    const schedule = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };
    schedule();
    window.addEventListener("resize", schedule);
    window.addEventListener("scroll", schedule, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("scroll", schedule, true);
    };
  }, [game.combat.blockers, game.combat.hordeAttackers, game.combat.playerAttackers, hiddenArrowIds, hiddenPlayerAttackArrowIds, blockDrag, playerAttackDrag]);

  return (
    <svg className={["pointer-events-none fixed inset-0 h-screen w-screen overflow-visible", tutorialOverlayActive ? "z-[99]" : "z-[65]"].join(" ")}>
      <defs>
        <filter id="combat-arrow-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#050302" floodOpacity="0.9" />
        </filter>
        <filter id="combat-arrow-defense-outer-glow" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1" result="expanded" />
          <feGaussianBlur in="expanded" stdDeviation="2.2" result="blurred" />
          <feComposite in="blurred" in2="SourceAlpha" operator="out" result="outerAlpha" />
          <feFlood floodColor={DEFENSE_ARROW_COLOR} floodOpacity="0.55" result="glowColor" />
          <feComposite in="glowColor" in2="outerAlpha" operator="in" result="outerGlow" />
          <feMerge>
            <feMergeNode in="outerGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="combat-arrow-attack-outer-glow" x="-80%" y="-80%" width="260%" height="260%" colorInterpolationFilters="sRGB">
          <feMorphology in="SourceAlpha" operator="dilate" radius="1.5" result="expanded" />
          <feGaussianBlur in="expanded" stdDeviation="3.2" result="blurred" />
          <feComposite in="blurred" in2="SourceAlpha" operator="out" result="outerAlpha" />
          <feFlood floodColor={PLAYER_ATTACK_ARROW_COLOR} floodOpacity="0.82" result="glowColor" />
          <feComposite in="glowColor" in2="outerAlpha" operator="in" result="outerGlow" />
          <feMerge>
            <feMergeNode in="outerGlow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {renderedArrows.map((arrow) => (
          <linearGradient key={arrow.gradientId} id={arrow.gradientId} gradientUnits="userSpaceOnUse" x1={arrow.startX} y1={arrow.startY} x2={arrow.tipX} y2={arrow.tipY}>
            <stop offset="0%" stopColor={arrow.color} stopOpacity="0" />
            <stop offset="12%" stopColor={arrow.color} stopOpacity="0.24" />
            <stop offset="52%" stopColor={arrow.color} stopOpacity="0.82" />
            <stop offset="78%" stopColor={arrow.color} stopOpacity="0.9" />
            <stop offset="100%" stopColor={arrow.color} stopOpacity="0.9" />
          </linearGradient>
        ))}
      </defs>
      <AnimatePresence>
        {renderedArrows.map((arrow) => {
          const exiting = exitingArrows.some((item) => item.id === arrow.id) && !arrows.some((item) => item.id === arrow.id);
          const isDefenseArrow = arrow.color === DEFENSE_ARROW_COLOR;
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
              <g filter={isDefenseArrow ? "url(#combat-arrow-defense-outer-glow)" : "url(#combat-arrow-attack-outer-glow)"}>
                <TacticalArrowGlyph
                  path={arrow.path}
                  tip={arrow.tip}
                  color={arrow.color}
                  stroke={`url(#${arrow.gradientId})`}
                />
              </g>
            </g>
          </motion.g>
          );
        })}
      </AnimatePresence>
    </svg>
  );
}

function getPlayerAttackTargetPoint(): { x: number; y: number } | undefined {
  const target = document.querySelector<HTMLElement>("[data-player-attack-target='horde-deck']") ?? document.querySelector<HTMLElement>("[data-battlefield-drop-target='player-attack']");
  const rect = target?.getBoundingClientRect();
  if (!rect) return undefined;
  return { x: rect.left + rect.width * 0.5, y: rect.bottom };
}

function isCardBehindInStack(card: HTMLElement): boolean {
  const stack = card.closest<HTMLElement>('[data-stacked="true"]');
  const slot = card.closest<HTMLElement>(".battlefield-layout-slot");
  if (!stack || !slot) return false;

  const stackedSlots = Array.from(stack.children).filter((child): child is HTMLElement => child instanceof HTMLElement && child.classList.contains("battlefield-layout-slot"));
  return stackedSlots.length > 1 && slot !== stackedSlots[stackedSlots.length - 1];
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

function makeArrow(id: string, start: { x: number; y: number }, end: { x: number; y: number }, color: string): Arrow {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const curve = Math.min(38, Math.max(10, length * 0.11));
  const curveDirection = dx >= 0 ? -1 : 1;
  const controlA = {
    x: start.x + dx * 0.36 + px * curve * curveDirection,
    y: start.y + dy * 0.36 + py * curve * curveDirection,
  };
  const controlB = {
    x: start.x + dx * 0.72 + px * curve * curveDirection * 0.42,
    y: start.y + dy * 0.72 + py * curve * curveDirection * 0.42,
  };
  const tangentX = end.x - controlB.x;
  const tangentY = end.y - controlB.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const tx = tangentX / tangentLength;
  const ty = tangentY / tangentLength;
  const tpx = -ty;
  const tpy = tx;
  const headLength = 22;
  const headWing = 10;
  const neckAt = { x: end.x - tx * headLength, y: end.y - ty * headLength };
  const path = `M ${start.x} ${start.y} C ${controlA.x} ${controlA.y} ${controlB.x} ${controlB.y} ${neckAt.x} ${neckAt.y}`;
  const tip = [`${end.x},${end.y}`, `${end.x - tx * headLength + tpx * headWing},${end.y - ty * headLength + tpy * headWing}`, `${end.x - tx * headLength - tpx * headWing},${end.y - ty * headLength - tpy * headWing}`].join(" ");
  return { id, color, path, tip, gradientId: `combat-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`, startX: start.x, startY: start.y, tipX: end.x, tipY: end.y };
}

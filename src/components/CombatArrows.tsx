import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

const DEFENSE_ARROW_COLOR = "#60a5fa";

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
  const [hiddenArrowIds, setHiddenArrowIds] = useState<Set<string>>(() => new Set());
  const hordeAttackAnimation = useGameStore((state) => state.hordeAttackAnimation);
  const blockDrag = useGameStore((state) => state.blockDrag);

  useEffect(() => {
    if (Object.keys(game.combat.blockers).length === 0) {
      setHiddenArrowIds(new Set());
    }
  }, [game.combat.blockers]);

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
    setHiddenArrowIds((current) => {
      if ([...arrowIds].every((arrowId) => current.has(arrowId))) return current;
      const next = new Set(current);
      for (const arrowId of arrowIds) next.add(arrowId);
      return next;
    });
  }, [game.combat.blockers, hordeAttackAnimation]);

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
          const start = { x: blockerRect.left + blockerRect.width / 2, y: blockerRect.top + blockerRect.height * 0.18 };
          const end = { x: attackerRect.left + attackerRect.width / 2, y: attackerRect.top + attackerRect.height * 0.82 };
          next.push(makeArrow(arrowId, start, end, DEFENSE_ARROW_COLOR));
        }
      }
      if (blockDrag) {
        const blocker = document.querySelector<HTMLElement>(`[data-card-id="${blockDrag.blockerId}"]`);
        if (blocker) {
          const blockerRect = blocker.getBoundingClientRect();
          const start = { x: blockerRect.left + blockerRect.width / 2, y: blockerRect.top + blockerRect.height * 0.18 };
          const end = { x: blockDrag.x, y: blockDrag.y };
          next.push(makeArrow(`drag-${blockDrag.blockerId}`, start, end, DEFENSE_ARROW_COLOR));
        }
      }
      setArrows(next);
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
  }, [game.combat.blockers, game.combat.hordeAttackers, hiddenArrowIds, blockDrag]);

  return (
    <svg className="pointer-events-none fixed inset-0 z-[65] h-screen w-screen overflow-visible">
      <defs>
        <filter id="combat-arrow-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#050302" floodOpacity="0.9" />
        </filter>
        <filter id="combat-arrow-blue-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feColorMatrix in="blur" type="matrix" values="0 0 0 0 0.2 0 0 0 0 0.66 0 0 0 0 1 0 0 0 0.7 0" result="glow" />
          <feMerge>
            <feMergeNode in="glow" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {arrows.map((arrow) => (
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
        {arrows.map((arrow) => (
          <motion.g
            key={arrow.id}
            filter="url(#combat-arrow-shadow)"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <motion.g
              initial={{ clipPath: "inset(100% 0 0 0)" }}
              animate={{ clipPath: "inset(0 0 0% 0)" }}
              exit={{ clipPath: "inset(0 0 100% 0)" }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <path d={arrow.path} fill="none" stroke={arrow.color} strokeWidth={6} strokeLinecap="round" opacity="0.12" />
              <polygon points={arrow.tip} fill={arrow.color} opacity="0.14" />
              <motion.g
                initial={{ opacity: 0.85 }}
                animate={{ opacity: [0.82, 0.96, 0.88] }}
                transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
                filter="url(#combat-arrow-blue-glow)"
              >
                <path d={arrow.path} fill="none" stroke={`url(#${arrow.gradientId})`} strokeWidth={7} strokeLinecap="round" opacity="0.86" />
                <polygon points={arrow.tip} fill={`url(#${arrow.gradientId})`} opacity="0.94" />
              </motion.g>
            </motion.g>
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
  );
}

function makeArrow(id: string, start: { x: number; y: number }, end: { x: number; y: number }, color: string): Arrow {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const curve = Math.min(42, Math.max(14, length * 0.14));
  const curveDirection = dx >= 0 ? -1 : 1;
  const control = {
    x: (start.x + end.x) / 2 + px * curve * curveDirection,
    y: (start.y + end.y) / 2 + py * curve * curveDirection,
  };
  const tangentX = end.x - control.x;
  const tangentY = end.y - control.y;
  const tangentLength = Math.hypot(tangentX, tangentY) || 1;
  const tx = tangentX / tangentLength;
  const ty = tangentY / tangentLength;
  const tpx = -ty;
  const tpy = tx;
  const headLength = 22;
  const headWing = 10;
  const neckAt = { x: end.x - tx * headLength, y: end.y - ty * headLength };
  const path = `M ${start.x} ${start.y} Q ${control.x} ${control.y} ${neckAt.x} ${neckAt.y}`;
  const tip = [`${end.x},${end.y}`, `${end.x - tx * headLength + tpx * headWing},${end.y - ty * headLength + tpy * headWing}`, `${end.x - tx * headLength - tpx * headWing},${end.y - ty * headLength - tpy * headWing}`].join(" ");
  return { id, color, path, tip, gradientId: `combat-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`, startX: start.x, startY: start.y, tipX: end.x, tipY: end.y };
}

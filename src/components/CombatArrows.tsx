import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";
import { useGameStore } from "../store/useGameStore";

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];

type Arrow = {
  id: string;
  color: string;
  body: string;
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

  useEffect(() => {
    if (Object.keys(game.combat.blockers).length === 0) {
      setHiddenArrowIds(new Set());
    }
  }, [game.combat.blockers]);

  useEffect(() => {
    if (!hordeAttackAnimation?.blockerDies || !hordeAttackAnimation.blockerId) return;
    const arrowId = `${hordeAttackAnimation.attackerId}-${hordeAttackAnimation.blockerId}`;
    setHiddenArrowIds((current) => {
      if (current.has(arrowId)) return current;
      const next = new Set(current);
      next.add(arrowId);
      return next;
    });
  }, [hordeAttackAnimation]);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const next: Arrow[] = [];
      for (const [attackerId, blockerIds] of Object.entries(game.combat.blockers)) {
        const attacker = document.querySelector<HTMLElement>(`[data-card-id="${attackerId}"]`);
        if (!attacker) continue;
        const attackerRect = attacker.getBoundingClientRect();
        const color = getAttackerColor(game, attackerId);
        for (const blockerId of blockerIds) {
          const arrowId = `${attackerId}-${blockerId}`;
          if (hiddenArrowIds.has(arrowId)) continue;
          const blocker = document.querySelector<HTMLElement>(`[data-card-id="${blockerId}"]`);
          if (!blocker) continue;
          const blockerRect = blocker.getBoundingClientRect();
          const start = { x: blockerRect.left + blockerRect.width / 2, y: blockerRect.top + blockerRect.height * 0.18 };
          const end = { x: attackerRect.left + attackerRect.width / 2, y: attackerRect.top + attackerRect.height * 0.82 };
          next.push(makeArrow(arrowId, start, end, color));
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
  }, [game.combat.blockers, game.combat.hordeAttackers, hiddenArrowIds]);

  return (
    <svg className="pointer-events-none fixed inset-0 z-[65] h-screen w-screen overflow-visible">
      <defs>
        <filter id="combat-arrow-shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feDropShadow dx="0" dy="3" stdDeviation="2.4" floodColor="#050302" floodOpacity="0.9" />
        </filter>
        {arrows.map((arrow) => (
          <linearGradient key={arrow.gradientId} id={arrow.gradientId} gradientUnits="userSpaceOnUse" x1={arrow.startX} y1={arrow.startY} x2={arrow.tipX} y2={arrow.tipY}>
            <stop offset="0%" stopColor="#080402" />
            <stop offset="42%" stopColor="#140b05" />
            <stop offset="100%" stopColor={arrow.color} />
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
              <polygon points={arrow.body} fill="rgba(15,8,3,0.94)" />
              <polygon points={arrow.tip} fill="rgba(15,8,3,0.94)" />
              <motion.g
                initial={{ opacity: 0.85 }}
                animate={{ opacity: [0.82, 0.96, 0.88] }}
                transition={{ duration: 1.25, repeat: Infinity, ease: "easeInOut" }}
              >
                <polygon points={arrow.body} fill={`url(#${arrow.gradientId})`} opacity="0.9" stroke="rgba(255,236,184,0.74)" strokeWidth="1" />
                <polygon points={arrow.tip} fill={`url(#${arrow.gradientId})`} opacity="0.98" stroke="rgba(255,236,184,0.9)" strokeWidth="1.25" />
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
  const base = 12;
  const neck = 5;
  const headLength = 24;
  const headWing = 13;
  const neckAt = { x: end.x - ux * headLength, y: end.y - uy * headLength };
  const body = [
    `${start.x + px * base},${start.y + py * base}`,
    `${neckAt.x + px * neck},${neckAt.y + py * neck}`,
    `${neckAt.x - px * neck},${neckAt.y - py * neck}`,
    `${start.x - px * base},${start.y - py * base}`,
  ].join(" ");
  const tip = [`${end.x},${end.y}`, `${neckAt.x + px * headWing},${neckAt.y + py * headWing}`, `${neckAt.x - px * headWing},${neckAt.y - py * headWing}`].join(" ");
  return { id, color, body, tip, gradientId: `combat-arrow-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`, startX: start.x, startY: start.y, tipX: end.x, tipY: end.y };
}

function getAttackerColor(game: GameState, attackerId: string): string {
  const index = game.combat.hordeAttackers.indexOf(attackerId);
  return blockColors[Math.max(index, 0) % blockColors.length];
}

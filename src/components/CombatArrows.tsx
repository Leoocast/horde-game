import { useEffect, useState } from "react";
import type { GameState } from "../engine/GameTypes";

const blockColors = ["#60a5fa", "#fb7185", "#4ade80", "#c084fc", "#fbbf24", "#22d3ee", "#f472b6", "#818cf8"];

type Arrow = {
  id: string;
  color: string;
  body: string;
  tipX: number;
  tipY: number;
  angle: number;
};

export function CombatArrows({ game }: { game: GameState }) {
  const [arrows, setArrows] = useState<Arrow[]>([]);

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
          const blocker = document.querySelector<HTMLElement>(`[data-card-id="${blockerId}"]`);
          if (!blocker) continue;
          const blockerRect = blocker.getBoundingClientRect();
          const start = { x: blockerRect.left + blockerRect.width / 2, y: blockerRect.top + blockerRect.height * 0.18 };
          const end = { x: attackerRect.left + attackerRect.width / 2, y: attackerRect.top + attackerRect.height * 0.82 };
          next.push(makeArrow(`${attackerId}-${blockerId}`, start, end, color));
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
  }, [game.combat.blockers, game.combat.hordeAttackers]);

  if (arrows.length === 0) return null;

  return (
    <svg className="pointer-events-none fixed inset-0 z-[65] h-screen w-screen overflow-visible">
      <defs>
        <filter id="combat-arrow-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {arrows.map((arrow) => (
        <g key={arrow.id} filter="url(#combat-arrow-glow)">
          <polygon points={arrow.body} fill={arrow.color} opacity="0.88" stroke="rgba(255,255,255,0.88)" strokeWidth="1" />
          <polygon points={arrowTip(arrow.tipX, arrow.tipY, arrow.angle)} fill={arrow.color} stroke="rgba(255,255,255,0.92)" strokeWidth="1" />
        </g>
      ))}
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
  const base = 10;
  const neck = 3;
  const neckAt = { x: end.x - ux * 15, y: end.y - uy * 15 };
  const body = [
    `${start.x + px * base},${start.y + py * base}`,
    `${neckAt.x + px * neck},${neckAt.y + py * neck}`,
    `${neckAt.x - px * neck},${neckAt.y - py * neck}`,
    `${start.x - px * base},${start.y - py * base}`,
  ].join(" ");
  return { id, color, body, tipX: end.x, tipY: end.y, angle: Math.atan2(dy, dx) };
}

function arrowTip(x: number, y: number, angle: number): string {
  const size = 19;
  const wing = 8;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const px = -uy;
  const py = ux;
  const back = { x: x - ux * size, y: y - uy * size };
  return [`${x},${y}`, `${back.x + px * wing},${back.y + py * wing}`, `${back.x - px * wing},${back.y - py * wing}`].join(" ");
}

function getAttackerColor(game: GameState, attackerId: string): string {
  const index = game.combat.hordeAttackers.indexOf(attackerId);
  return blockColors[Math.max(index, 0) % blockColors.length];
}

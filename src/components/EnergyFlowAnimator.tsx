import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useMemo, useState, type CSSProperties } from "react";
import { useGameStore } from "../store/useGameStore";

type Point = { x: number; y: number };
type EnergyPath = {
  origin: Point;
  target: Point;
  controlA: Point;
  controlB: Point;
  d: string;
};

const FLOW_MOTES = [
  { delay: 0.006, scale: 0.72, offset: -7 },
  { delay: 0.022, scale: 0.52, offset: 7 },
  { delay: 0.04, scale: 0.84, offset: -4 },
  { delay: 0.058, scale: 0.58, offset: 6 },
  { delay: 0.076, scale: 0.68, offset: -8 },
  { delay: 0.092, scale: 0.46, offset: 4 },
  { delay: 0.108, scale: 0.78, offset: 9 },
  { delay: 0.122, scale: 0.56, offset: -5 },
  { delay: 0.136, scale: 0.64, offset: 6 },
] as const;

export function EnergyFlowAnimator() {
  const animation = useGameStore((state) => state.energyFlowAnimation);
  const resolve = useGameStore((state) => state.resolveEnergyFlowAnimation);
  const complete = useGameStore((state) => state.completeEnergyFlowAnimation);
  const reduceMotion = useReducedMotion();
  const [path, setPath] = useState<EnergyPath | null>(null);

  useLayoutEffect(() => {
    if (!animation) {
      setPath(null);
      return;
    }
    setPath(readEnergyPath(animation.sourceId));
  }, [animation?.id, animation?.sourceId]);

  useEffect(() => {
    if (!animation || animation.phase !== "impact") return;
    const timer = window.setTimeout(() => complete(animation.id), reduceMotion ? 110 : 240);
    return () => window.clearTimeout(timer);
  }, [animation, complete, reduceMotion]);

  const samples = useMemo(() => path ? sampleEnergyPath(path, 20) : [], [path]);
  if (!animation || !path) return null;

  const xFrames = samples.map((point) => point.x - path.origin.x);
  const yFrames = samples.map((point) => point.y - path.origin.y);
  const travelDuration = reduceMotion ? 0.18 : 0.46;
  const ribbonDuration = travelDuration * 0.76;

  return (
    <div className="mana-flow-vfx" aria-hidden="true">
      {animation.phase === "travel" ? (
        <>
          <svg className="mana-flow-ribbon" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`} preserveAspectRatio="none">
            <defs>
              <linearGradient id={`${animation.id}-mana-ribbon`} gradientUnits="userSpaceOnUse" x1={path.origin.x} y1={path.origin.y} x2={path.target.x} y2={path.target.y}>
                <stop offset="0" stopColor="#fff0a3" stopOpacity="0" />
                <stop offset="0.16" stopColor="#ffd96b" stopOpacity="0.92" />
                <stop offset="0.66" stopColor="#e8a92f" stopOpacity="0.78" />
                <stop offset="1" stopColor="#fff1a6" stopOpacity="0.18" />
              </linearGradient>
            </defs>
            <motion.path
              className="mana-flow-ribbon-glow"
              d={path.d}
              stroke={`url(#${animation.id}-mana-ribbon)`}
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: [0, 0.82, 0.54, 0], pathLength: [0, 0.24, 0.88, 1] }}
              transition={{ duration: ribbonDuration, times: [0, 0.16, 0.62, 1], ease: "easeOut" }}
            />
            <motion.path
              className="mana-flow-ribbon-core"
              d={path.d}
              stroke={`url(#${animation.id}-mana-ribbon)`}
              initial={{ opacity: 0, pathLength: 0 }}
              animate={{ opacity: [0, 1, 0.62, 0], pathLength: [0, 0.18, 0.9, 1] }}
              transition={{ duration: ribbonDuration * 0.94, times: [0, 0.14, 0.6, 1], ease: "easeOut" }}
            />
          </svg>
          <span
            className="mana-flow-source-bloom"
            style={{ left: path.origin.x, top: path.origin.y } as CSSProperties}
          />
          {FLOW_MOTES.map((mote, index) => (
            <motion.span
              key={`mana-mote-${index}`}
              className="mana-flow-mote"
              style={{
                left: path.origin.x,
                top: path.origin.y,
                "--mana-mote-offset": `${mote.offset}px`,
                "--mana-mote-scale": mote.scale,
              } as CSSProperties}
              initial={{ x: 0, y: 0, opacity: 0, rotate: index % 2 === 0 ? -25 : 20 }}
              animate={{
                x: xFrames,
                y: yFrames,
                opacity: [0, 0.82, 0.68, 0],
                rotate: index % 2 === 0 ? 155 : -145,
              }}
              transition={{ duration: Math.max(0.18, travelDuration - 0.1), delay: reduceMotion ? 0 : mote.delay, ease: "easeInOut" }}
            >
              <i />
            </motion.span>
          ))}
          <motion.span
            className="mana-flow-seed"
            style={{ left: path.origin.x, top: path.origin.y } as CSSProperties}
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.35 }}
            animate={{
              x: xFrames,
              y: yFrames,
              opacity: [0, 1, 1, 0.94],
              scale: [0.35, 1, 0.92, 1.18],
            }}
            transition={{ duration: travelDuration, ease: [0.3, 0.72, 0.18, 1] }}
            onAnimationComplete={() => resolve(animation.id)}
          >
            <i />
          </motion.span>
        </>
      ) : (
        <span
          className="mana-flow-impact"
          style={{ left: path.target.x, top: path.target.y } as CSSProperties}
        >
          <b />
          {Array.from({ length: 8 }, (_, index) => (
            <i key={index} style={{ "--mana-impact-index": index } as CSSProperties} />
          ))}
        </span>
      )}
    </div>
  );
}

function readEnergyPath(sourceId: string): EnergyPath {
  const sourceRect = document.querySelector<HTMLElement>(`[data-card-slot-id="${sourceId}"]`)?.getBoundingClientRect();
  const targetRect =
    document.querySelector<HTMLElement>("[data-energy-kind='stored'][data-energy-state='empty']")?.getBoundingClientRect() ??
    document.querySelector<HTMLElement>("[data-energy-track='stored']")?.getBoundingClientRect() ??
    document.querySelector<HTMLElement>("[data-player-mana-core='true']")?.getBoundingClientRect();
  const origin = sourceRect
    ? { x: sourceRect.left + sourceRect.width * 0.5, y: sourceRect.top + sourceRect.height * 0.68 }
    : { x: window.innerWidth * 0.5, y: window.innerHeight * 0.64 };
  const target = targetRect
    ? { x: targetRect.left + targetRect.width * 0.5, y: targetRect.top + targetRect.height * 0.5 }
    : { x: 130, y: window.innerHeight - 82 };
  const verticalDistance = Math.abs(target.y - origin.y);
  const controlA = {
    x: origin.x - Math.min(80, Math.abs(target.x - origin.x) * 0.14),
    y: origin.y + Math.max(48, verticalDistance * 0.34),
  };
  const controlB = {
    x: target.x + Math.min(118, Math.abs(target.x - origin.x) * 0.22),
    y: target.y - Math.max(34, verticalDistance * 0.2),
  };
  return {
    origin,
    target,
    controlA,
    controlB,
    d: `M ${origin.x} ${origin.y} C ${controlA.x} ${controlA.y}, ${controlB.x} ${controlB.y}, ${target.x} ${target.y}`,
  };
}

function sampleEnergyPath(path: EnergyPath, steps: number): Point[] {
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const inverse = 1 - t;
    return {
      x:
        inverse ** 3 * path.origin.x +
        3 * inverse ** 2 * t * path.controlA.x +
        3 * inverse * t ** 2 * path.controlB.x +
        t ** 3 * path.target.x,
      y:
        inverse ** 3 * path.origin.y +
        3 * inverse ** 2 * t * path.controlA.y +
        3 * inverse * t ** 2 * path.controlB.y +
        t ** 3 * path.target.y,
    };
  });
}

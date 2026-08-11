import { motion } from "framer-motion";
import { type CSSProperties } from "react";

export type EnergyFlowPoint = { x: number; y: number };

export type EnergyFlowPath = {
  origin: EnergyFlowPoint;
  target: EnergyFlowPoint;
  controlA: EnergyFlowPoint;
  controlB: EnergyFlowPoint;
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

export function energyFlowPathBetween(origin: EnergyFlowPoint, target: EnergyFlowPoint): EnergyFlowPath {
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

export function EnergyFlowTravel({
  id,
  path,
  reduceMotion,
  delay = 0,
  onComplete,
}: {
  id: string;
  path: EnergyFlowPath;
  reduceMotion: boolean;
  delay?: number;
  onComplete?: () => void;
}) {
  const samples = sampleEnergyPath(path, 20);
  const xFrames = samples.map((point) => point.x - path.origin.x);
  const yFrames = samples.map((point) => point.y - path.origin.y);
  const travelDuration = reduceMotion ? 0.18 : 0.46;
  const ribbonDuration = travelDuration * 0.76;

  return (
    <>
      <svg className="mana-flow-ribbon" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id={`${id}-mana-ribbon`} gradientUnits="userSpaceOnUse" x1={path.origin.x} y1={path.origin.y} x2={path.target.x} y2={path.target.y}>
            <stop offset="0" stopColor="#fff0a3" stopOpacity="0" />
            <stop offset="0.16" stopColor="#ffd96b" stopOpacity="0.92" />
            <stop offset="0.66" stopColor="#e8a92f" stopOpacity="0.78" />
            <stop offset="1" stopColor="#fff1a6" stopOpacity="0.18" />
          </linearGradient>
        </defs>
        <motion.path
          className="mana-flow-ribbon-glow"
          d={path.d}
          stroke={`url(#${id}-mana-ribbon)`}
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{ opacity: [0, 0.82, 0.54, 0], pathLength: [0, 0.24, 0.88, 1] }}
          transition={{ duration: ribbonDuration, delay, times: [0, 0.16, 0.62, 1], ease: "easeOut" }}
        />
        <motion.path
          className="mana-flow-ribbon-core"
          d={path.d}
          stroke={`url(#${id}-mana-ribbon)`}
          initial={{ opacity: 0, pathLength: 0 }}
          animate={{ opacity: [0, 1, 0.62, 0], pathLength: [0, 0.18, 0.9, 1] }}
          transition={{ duration: ribbonDuration * 0.94, delay, times: [0, 0.14, 0.6, 1], ease: "easeOut" }}
        />
      </svg>
      <span
        className="mana-flow-source-bloom"
        style={{ left: path.origin.x, top: path.origin.y, animationDelay: `${delay}s` } as CSSProperties}
      />
      {FLOW_MOTES.map((mote, index) => (
        <motion.span
          key={`${id}-mana-mote-${index}`}
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
          transition={{
            duration: Math.max(0.18, travelDuration - 0.1),
            delay: reduceMotion ? delay : delay + mote.delay,
            ease: "easeInOut",
          }}
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
        transition={{ duration: travelDuration, delay, ease: [0.3, 0.72, 0.18, 1] }}
        onAnimationComplete={onComplete}
      >
        <i />
      </motion.span>
    </>
  );
}

export function EnergyFlowImpact({
  target,
  delay = 0,
}: {
  target: EnergyFlowPoint;
  delay?: number;
}) {
  return (
    <span
      className="mana-flow-impact"
      style={{ left: target.x, top: target.y } as CSSProperties}
    >
      <b style={{ animationDelay: `${delay}s` }} />
      {Array.from({ length: 8 }, (_, index) => (
        <i
          key={index}
          style={{
            "--mana-impact-index": index,
            animationDelay: `${delay + index * 0.012}s`,
          } as CSSProperties}
        />
      ))}
    </span>
  );
}

function sampleEnergyPath(path: EnergyFlowPath, steps: number): EnergyFlowPoint[] {
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

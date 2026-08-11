import { motion } from "framer-motion";
import { useRef, type CSSProperties } from "react";
import type { ReserveTransferPresentation } from "./reserveTransferPresentation";
import {
  EnergyFlowImpact,
  EnergyFlowTravel,
  energyFlowPathBetween,
  type EnergyFlowPath,
} from "./EnergyFlowVfx";

export type ReserveTransferOrbFlight = Readonly<{
  index: number;
  origin: { x: number; y: number };
  target: { x: number; y: number };
  path: EnergyFlowPath;
  size: number;
}>;

export type ReserveTransferAnimation = ReserveTransferPresentation & Readonly<{
  flights: ReserveTransferOrbFlight[];
  id: number;
  reduceMotion: boolean;
}>;

const ORB_TO_SOCKET_RATIO = 25 / 35;

export function readReserveTransferAnimation(
  id: number,
  presentation: ReserveTransferPresentation,
): ReserveTransferAnimation | undefined {
  const flights = Array.from({ length: presentation.amount }, (_, index) => {
    const sourceIndex = presentation.sourceStartIndex + index;
    const targetIndex = presentation.targetStartIndex + index;
    const sourceRect = document.querySelector<HTMLElement>(
      `[data-energy-kind="normal"][data-energy-index="${sourceIndex}"]`,
    )?.getBoundingClientRect();
    const targetRect = document.querySelector<HTMLElement>(
      `[data-energy-kind="stored"][data-energy-index="${targetIndex}"]`,
    )?.getBoundingClientRect();
    if (!sourceRect || !targetRect) return undefined;
    const origin = { x: sourceRect.left + sourceRect.width / 2, y: sourceRect.top + sourceRect.height / 2 };
    const target = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    return {
      index,
      origin,
      target,
      path: energyFlowPathBetween(origin, target),
      size: Math.min(sourceRect.width, targetRect.width) * ORB_TO_SOCKET_RATIO,
    };
  }).filter((flight): flight is ReserveTransferOrbFlight => Boolean(flight));
  return flights.length === presentation.amount
    ? {
        id,
        ...presentation,
        flights,
        reduceMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
      }
    : undefined;
}

export function ReserveTransferAnimator({
  animation,
  onComplete,
}: {
  animation: ReserveTransferAnimation;
  onComplete: () => void;
}) {
  const reduceMotion = animation.reduceMotion;
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  return (
    <div className="reserve-transfer-vfx" aria-hidden="true">
      {animation.flights.map((flight, flightIndex) => {
        const isLast = flightIndex === animation.flights.length - 1;
        const delay = reduceMotion ? 0 : flight.index * 0.12;
        const duration = reduceMotion ? 0.16 : 0.76;
        return (
          <span key={`${animation.id}-${flight.index}`}>
            {!reduceMotion && (
              <>
                <EnergyFlowTravel
                  id={`reserve-${animation.id}-${flight.index}`}
                  path={flight.path}
                  reduceMotion={false}
                  delay={delay}
                />
                <EnergyFlowImpact target={flight.target} delay={delay + 0.46} />
              </>
            )}
            <ReserveArrivalOrb
              kind="yellow"
              point={flight.target}
              size={flight.size}
              delay={delay}
              duration={duration}
              reduceMotion={reduceMotion}
              onComplete={isLast ? () => onCompleteRef.current() : undefined}
            />
            <ReserveArrivalOrb
              kind="blue"
              point={flight.origin}
              size={flight.size}
              delay={delay}
              duration={duration}
              reduceMotion={reduceMotion}
            />
          </span>
        );
      })}
    </div>
  );
}

function ReserveArrivalOrb({
  kind,
  point,
  size,
  delay,
  duration,
  reduceMotion,
  onComplete,
}: {
  kind: "blue" | "yellow";
  point: { x: number; y: number };
  size: number;
  delay: number;
  duration: number;
  reduceMotion: boolean;
  onComplete?: () => void;
}) {
  return (
    <motion.span
      className={`reserve-transfer-arrival reserve-transfer-arrival-${kind} mana-alchemy-socket-${kind} is-ready`}
      style={{
        left: point.x - size / 2,
        top: point.y - size / 2,
        width: size,
        height: size,
      } as CSSProperties}
      initial={{ opacity: 0, scale: reduceMotion ? 0.97 : 0.2 }}
      animate={{
        opacity: reduceMotion ? [0, 1] : [0, 0, 1, 1],
        scale: reduceMotion ? 0.97 : [0.2, 0.2, 1.18, 0.97],
      }}
      transition={{
        duration,
        delay,
        times: reduceMotion ? undefined : [0, kind === "yellow" ? 0.58 : 0.64, 0.84, 1],
        ease: [0.16, 1, 0.3, 1],
      }}
      onAnimationComplete={onComplete}
    >
      <span className="mana-alchemy-orb"><span className="mana-alchemy-liquid" /></span>
    </motion.span>
  );
}

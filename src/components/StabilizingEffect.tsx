import type { AnimationEvent, CSSProperties } from "react";

const STABILIZING_MOTE_COUNT = 5;

type StabilizingWaveStyle = CSSProperties & {
  "--stabilizing-delay": string;
  "--stabilizing-duration": string;
  "--stabilizing-glint-duration": string;
  "--stabilizing-interval": string;
  "--stabilizing-sweep-duration": string;
  "--stabilizing-from-x": string;
  "--stabilizing-from-y": string;
};

type StabilizingEffectStyle = CSSProperties & {
  "--stabilizing-completion-delay"?: string;
};

function seedFromKey(seedKey: string): number {
  let seed = 2166136261;
  for (let index = 0; index < seedKey.length; index += 1) {
    seed ^= seedKey.charCodeAt(index);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

/** Stable visual variation keeps several Stabilizing Echoes from moving in lockstep. */
export function stabilizingWaveStyles(seedKey: string): StabilizingWaveStyle[] {
  let seed = seedFromKey(seedKey);
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };

  const routes = Array.from({ length: STABILIZING_MOTE_COUNT }, (_, index) => {
    const angle = (index / STABILIZING_MOTE_COUNT) * Math.PI * 2 + random() * 0.8;
    const distance = 64 + random() * 26;

    return {
      "--stabilizing-from-x": `${(Math.cos(angle) * distance).toFixed(1)}cqw`,
      "--stabilizing-from-y": `${(Math.sin(angle) * distance * 0.9).toFixed(1)}cqw`,
    };
  });
  const duration = 9.5 + random() * 1.5;
  const firstDelay = 0;
  const moteInterval = duration / STABILIZING_MOTE_COUNT;

  return routes.map((route, index) => ({
    ...route,
    "--stabilizing-duration": `${duration.toFixed(2)}s`,
    "--stabilizing-glint-duration": `${(moteInterval * 1.45).toFixed(2)}s`,
    "--stabilizing-interval": `${moteInterval.toFixed(2)}s`,
    "--stabilizing-sweep-duration": `${(moteInterval * 2).toFixed(2)}s`,
    "--stabilizing-delay": `${(firstDelay - index * moteInterval).toFixed(2)}s`,
  }));
}

export function StabilizingEffect({
  seedKey,
  phase = "active",
  completionDelayMs = 0,
  onCompletion,
}: {
  seedKey: string;
  phase?: "active" | "completing";
  completionDelayMs?: number;
  onCompletion?: () => void;
}) {
  const waves = stabilizingWaveStyles(seedKey);
  const sweepStyle = waves[0];
  const completing = phase === "completing";
  const style = completing
    ? ({ "--stabilizing-completion-delay": `${completionDelayMs}ms` } as StabilizingEffectStyle)
    : undefined;

  const handleAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (
      !completing ||
      event.target !== event.currentTarget ||
      event.animationName !== "stabilizing-completion-lifetime"
    ) return;
    onCompletion?.();
  };

  return (
    <span
      className={completing ? "stabilizing-effect is-completing" : "stabilizing-effect"}
      style={style}
      aria-hidden="true"
      onAnimationEnd={handleAnimationEnd}
    >
      <span className="stabilizing-veil" aria-hidden="true" />
      <span className="stabilizing-gold-patina" aria-hidden="true">
        <span className="stabilizing-gold-charge" style={sweepStyle} />
        <span className="stabilizing-gold-glint" style={sweepStyle} />
      </span>
      <span className="stabilizing-wave-effect" aria-hidden="true">
        <span className="stabilizing-lattice">
          {waves.slice(0, 2).map((style, index) => (
            <span key={`front-${index}`} className="stabilizing-wave-front" style={style} />
          ))}
        </span>
        {waves.map((style, index) => (
          <span key={`mote-${index}`} className="stabilizing-mote" style={style} />
        ))}
      </span>
      {completing && (
        <span className="stabilizing-completion" aria-hidden="true">
          <span className="stabilizing-completion-lattice" />
          <span className="stabilizing-completion-core" />
          <span className="stabilizing-completion-release" />
        </span>
      )}
    </span>
  );
}

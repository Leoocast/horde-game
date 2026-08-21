import type { CSSProperties } from "react";

const STABILIZING_MOTE_COUNT = 4;

type StabilizingWaveStyle = CSSProperties & {
  "--stabilizing-delay": string;
  "--stabilizing-duration": string;
  "--stabilizing-from-x": string;
  "--stabilizing-from-y": string;
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

  return Array.from({ length: STABILIZING_MOTE_COUNT }, (_, index) => {
    const angle = (index / STABILIZING_MOTE_COUNT) * Math.PI * 2 + random() * 0.8;
    const distance = 64 + random() * 26;
    const duration = 7.5 + random() * 3.5;

    return {
      "--stabilizing-from-x": `${(Math.cos(angle) * distance).toFixed(1)}cqw`,
      "--stabilizing-from-y": `${(Math.sin(angle) * distance * 0.9).toFixed(1)}cqw`,
      "--stabilizing-duration": `${duration.toFixed(2)}s`,
      "--stabilizing-delay": `${(-random() * duration).toFixed(2)}s`,
    };
  });
}

export function StabilizingEffect({ seedKey }: { seedKey: string }) {
  const waves = stabilizingWaveStyles(seedKey);

  return (
    <>
      <span className="stabilizing-veil" aria-hidden="true" />
      <span className="stabilizing-gold-patina" aria-hidden="true">
        {waves.map((style, index) => (
          <span key={`charge-${index}`} className="stabilizing-gold-charge" style={style} />
        ))}
      </span>
      <span className="stabilizing-wave-effect" aria-hidden="true">
        <span className="stabilizing-lattice">
          {waves.map((style, index) => (
            <span key={`front-${index}`} className="stabilizing-wave-front" style={style} />
          ))}
        </span>
        {waves.map((style, index) => (
          <span key={`mote-${index}`} className="stabilizing-mote" style={style} />
        ))}
      </span>
    </>
  );
}

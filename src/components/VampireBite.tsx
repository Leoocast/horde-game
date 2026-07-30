import type { Ref } from "react";

type Props = {
  animationId: string;
  elementRef?: Ref<HTMLDivElement>;
};

export function VampireBite({ animationId, elementRef }: Props) {
  const jawGradientId = `blood-pact-jaw-${animationId}`;
  const teethGlowId = `blood-pact-teeth-glow-${animationId}`;

  return (
    <div ref={elementRef} className="blood-pact-vampire-bite">
      <svg viewBox="-25 -25 170 170">
        <defs>
          <linearGradient id={jawGradientId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#ff334b" />
            <stop offset="60%" stopColor="#b80018" />
            <stop offset="100%" stopColor="#4a000a" />
          </linearGradient>
          <filter id={teethGlowId}>
            <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#ff002b" floodOpacity="0.95" />
          </filter>
        </defs>
        <g
          className="blood-pact-jaw-upper"
          fill={`url(#${jawGradientId})`}
          stroke="#ff4d66"
          strokeWidth="1.5"
          filter={`url(#${teethGlowId})`}
        >
          <path d="M 16 28 C 14 44, 20 62, 34 76 C 30 58, 24 38, 22 28 Z" />
          <path d="M 104 28 C 106 44, 100 62, 86 76 C 90 58, 96 38, 98 28 Z" />
          <path d="M 30 28 L 40 28 L 35 44 Z" />
          <path d="M 43 28 L 55 28 L 49 46 Z" />
          <path d="M 65 28 L 77 28 L 71 46 Z" />
          <path d="M 80 28 L 90 28 L 85 44 Z" />
        </g>
        <g
          className="blood-pact-jaw-lower"
          fill={`url(#${jawGradientId})`}
          stroke="#ff4d66"
          strokeWidth="1.5"
          filter={`url(#${teethGlowId})`}
        >
          <path d="M 24 88 C 22 72, 28 54, 36 44 C 34 60, 31 76, 30 88 Z" />
          <path d="M 96 88 C 98 72, 92 54, 84 44 C 86 60, 89 76, 90 88 Z" />
          <path d="M 35 88 L 43 88 L 39 74 Z" />
          <path d="M 46 88 L 54 88 L 50 72 Z" />
          <path d="M 66 88 L 74 88 L 70 72 Z" />
          <path d="M 77 88 L 85 88 L 81 74 Z" />
        </g>
      </svg>
    </div>
  );
}

import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type StormBuffAnimatorProps = {
  eventId: number;
  seedKey: string;
};

type Point = { x: number; y: number };

export type StormBoltTone = "blue" | "yellow" | "white";

type Bolt = {
  path: string;
  branches: string[];
  delay: number;
  primary: boolean;
  tone: StormBoltTone;
};

type StormStyle = CSSProperties & {
  "--storm-delay"?: string;
  "--storm-glow"?: string;
  "--storm-core"?: string;
  "--storm-halo"?: string;
  "--storm-flash"?: string;
  "--storm-deep"?: string;
};

type CardBox = { left: number; top: number; width: number; height: number };

/** `.storm-buff-effect` insets the overlay -38% top, -36% each side and -32% bottom of the slot, so
 *  the card covers this fraction of it. The strike is authored in real pixels over that rectangle:
 *  a fixed viewBox would stretch the bolts differently on tall slots and on cropped rows. */
const OVERLAY_TO_CARD_X = 1 / 1.72;
const OVERLAY_TO_CARD_Y = 1 / 1.7;
const CARD_LEFT_FRACTION = 0.36 / 1.72;
const CARD_TOP_FRACTION = 0.38 / 1.7;

function cardBoxFromOverlay(width: number, height: number): CardBox {
  return {
    left: width * CARD_LEFT_FRACTION,
    top: height * CARD_TOP_FRACTION,
    width: width * OVERLAY_TO_CARD_X,
    height: height * OVERLAY_TO_CARD_Y,
  };
}

export const STORM_BOLT_TONES: readonly StormBoltTone[] = ["blue", "yellow", "white"];
const KAELOR_BOLT_TONE: StormBoltTone = "yellow";

/** Each tone carries a whole strike: bolt stroke, its bloom, and the flash that follows.
 *  Presentation only — the buff is already resolved before this component mounts. */
const TONE_COLORS: Record<StormBoltTone, StormStyle> = {
  blue: {
    "--storm-glow": "rgb(96 196 255 / 0.92)",
    "--storm-core": "#f6fdff",
    "--storm-halo": "rgb(126 216 255 / 0.94)",
    "--storm-flash": "rgb(166 226 255 / 0.76)",
    "--storm-deep": "rgb(30 118 198 / 0.58)",
  },
  yellow: {
    "--storm-glow": "rgb(238 218 116 / 0.9)",
    "--storm-core": "#fffef4",
    "--storm-halo": "rgb(255 239 157 / 0.84)",
    "--storm-flash": "rgb(255 251 226 / 0.8)",
    "--storm-deep": "rgb(178 146 48 / 0.42)",
  },
  white: {
    "--storm-glow": "rgb(238 248 255 / 0.95)",
    "--storm-core": "#ffffff",
    "--storm-halo": "rgb(255 255 255 / 0.92)",
    "--storm-flash": "rgb(233 244 255 / 0.8)",
    "--storm-deep": "rgb(146 178 210 / 0.5)",
  },
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

/** Kaelor's paired bolts share the same warm golden charge. */
export function stormBoltTones(
  _eventId: number,
  _seedKey: string,
  count: number,
): StormBoltTone[] {
  return Array.from({ length: count }, () => KAELOR_BOLT_TONE);
}

function pointsToPath(points: Point[]): string {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(" ");
}

function buildBolt(
  start: Point,
  end: Point,
  rng: () => number,
  segments = 9,
  jagScale = 0.075,
): Point[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy) || 1;
  const normalX = -dy / length;
  const normalY = dx / length;
  const points: Point[] = [];

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const endpointLock = Math.sin(progress * Math.PI);
    const jag = (rng() - 0.5) * (7 + length * jagScale) * endpointLock;
    points.push({
      x: start.x + dx * progress + normalX * jag,
      y: start.y + dy * progress + normalY * jag,
    });
  }
  return points;
}

function buildBranch(
  parent: Point[],
  rng: () => number,
  direction: number,
  reach: number,
): string {
  const startIndex = 3 + Math.floor(rng() * Math.max(1, parent.length - 6));
  const start = parent[startIndex];
  const previous = parent[Math.max(0, startIndex - 1)];
  const dx = start.x - previous.x;
  const dy = start.y - previous.y;
  const length = Math.hypot(dx, dy) || 1;
  const branchLength = reach * (0.7 + rng() * 0.6);
  const end = {
    x: start.x + (dx / length) * branchLength - (dy / length) * branchLength * direction,
    y: start.y + (dy / length) * branchLength + (dx / length) * branchLength * direction,
  };
  return pointsToPath(buildBolt(start, end, rng, 4, 0.14));
}

export type Storm = {
  bolts: Bolt[];
  impact: Point;
  coreRadius: number;
};

/** Sky strike: one heavy bolt falls from far above the slot and a thinner one answers it. Both
 * converge near Kaelor's raised hand before the whiteout and core flash land. */
export function buildStorm(eventId: number, seedKey: string, card: CardBox): Storm {
  const rng = makeRng(hashString(`${eventId}:${seedKey}:kaelor-storm`));
  const tones = stormBoltTones(eventId, seedKey, 2);
  const centerX = card.left + card.width / 2;
  const skyY = card.top - card.height * 0.55;
  const impact: Point = {
    x: card.left + card.width * 0.135,
    y: card.top + card.height * 0.2,
  };

  const mainPoints = buildBolt(
    { x: centerX + card.width * (0.09 + (rng() - 0.5) * 0.05), y: skyY },
    impact,
    rng,
    11,
    0.05,
  );
  const answerPoints = buildBolt(
    { x: centerX - card.width * (0.15 + (rng() - 0.5) * 0.05), y: skyY + card.height * 0.04 },
    impact,
    rng,
    9,
    0.06,
  );

  const branchReach = card.width * 0.12;
  const bolts: Bolt[] = [
    {
      path: pointsToPath(mainPoints),
      branches: [
        buildBranch(mainPoints, rng, -1, branchReach * 1.25),
        buildBranch(mainPoints, rng, 1, branchReach),
      ],
      delay: 110,
      primary: true,
      tone: tones[0],
    },
    {
      path: pointsToPath(answerPoints),
      branches: [buildBranch(answerPoints, rng, 1, branchReach * 0.8)],
      delay: 156,
      primary: false,
      tone: tones[1],
    },
  ];

  return {
    bolts,
    impact,
    coreRadius: card.width * 0.081,
  };
}

/** Local, rules-agnostic storm strike. The store already chose Kaelor and committed his +1/+1;
 * this component only makes that existing buff beat read as his own storm power. */
export function StormBuffAnimator({ eventId, seedKey }: StormBuffAnimatorProps) {
  const hostRef = useRef<HTMLSpanElement>(null);
  const [overlay, setOverlay] = useState<{ width: number; height: number }>();

  /* Measured before paint, so the strike never renders against a stale or square user space. */
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => {
      const rect = host.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      setOverlay((current) => (
        current && Math.abs(current.width - rect.width) < 0.5 && Math.abs(current.height - rect.height) < 0.5
          ? current
          : { width: rect.width, height: rect.height }
      ));
    };
    measure();

    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    observer?.observe(host);
    return () => observer?.disconnect();
  }, []);

  const storm = useMemo(
    () => (overlay ? buildStorm(eventId, seedKey, cardBoxFromOverlay(overlay.width, overlay.height)) : undefined),
    [eventId, seedKey, overlay],
  );
  /* The flash and core belong to the bolt that actually lands, so the impact never closes on a
     colour no bolt carried. */
  const impactStyle = TONE_COLORS[stormBoltTones(eventId, seedKey, 2)[0]];

  return (
    <span className="storm-buff-effect" ref={hostRef} style={impactStyle} aria-hidden="true">
      <span className="storm-buff-whiteout" />
      {storm && overlay && (
      <svg
        className="storm-buff-svg"
        viewBox={`0 0 ${overlay.width.toFixed(2)} ${overlay.height.toFixed(2)}`}
        preserveAspectRatio="none"
      >
        {storm.bolts.map((bolt, index) => {
          const style = { ...TONE_COLORS[bolt.tone], "--storm-delay": `${bolt.delay}ms` } as StormStyle;
          const weight = bolt.primary ? " storm-buff-bolt-primary" : "";
          return (
            <g key={index} className={`storm-buff-bolt-group${weight}`} style={style}>
              <path className="storm-buff-bolt-glow" d={bolt.path} pathLength="1" />
              <path className="storm-buff-bolt-core" d={bolt.path} pathLength="1" />
              {bolt.branches.map((branch, branchIndex) => (
                <g key={branchIndex}>
                  <path className="storm-buff-branch-glow" d={branch} pathLength="1" />
                  <path className="storm-buff-branch-core" d={branch} pathLength="1" />
                </g>
              ))}
            </g>
          );
        })}

        <circle
          className="storm-buff-core"
          cx={storm.impact.x}
          cy={storm.impact.y}
          r={storm.coreRadius}
        />

      </svg>
      )}
    </span>
  );
}

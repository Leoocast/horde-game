import { useEffect, type CSSProperties } from "react";
import { useAudioStore } from "../store/useAudioStore";
import { futureVisualSignature } from "../utils/futureIdentity";

export type DestinyOutcome = "preserved" | "lost";

type Props = {
  outcome: DestinyOutcome;
  seed: string;
};

type SealStyle = CSSProperties & {
  "--outcome-seed-angle": string;
};

type MoteStyle = CSSProperties & {
  "--outcome-mote-angle": string;
  "--outcome-mote-distance": string;
  "--outcome-mote-far": string;
  "--outcome-mote-delay": string;
  "--outcome-mote-size": string;
};

type ShardStyle = CSSProperties & {
  "--outcome-shard-x": string;
  "--outcome-shard-y": string;
  "--outcome-shard-spin": string;
  "--outcome-shard-delay": string;
};

const TAU = Math.PI * 2;
const TICK_COUNT = 24;
const MOTE_COUNT = 22;
/** Puntas de la rosa: cuatro cardinales largas y cuatro intercardinales cortas. */
const STAR_POINTS = 8;
/** Trozos en los que se parte el disco al perderse el Futuro. */
const SHARD_COUNT = 7;
const CENTER = 160;

function hash(n: number): number {
  const value = Math.sin(n * 78.233) * 43758.5453123;
  return value - Math.floor(value);
}

function polar(degrees: number, radius: number): { x: number; y: number } {
  const angle = (degrees * Math.PI) / 180;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

function point(degrees: number, radius: number): string {
  const p = polar(degrees, radius);
  return `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
}

function tickPoint(index: number, radius: number): { x: number; y: number } {
  const angle = (index / TICK_COUNT) * TAU - Math.PI / 2;
  return { x: CENTER + Math.cos(angle) * radius, y: CENTER + Math.sin(angle) * radius };
}

/**
 * Rosa cardinal del Futuro preservado. Las cuatro puntas largas caen exactamente en Norte, Este,
 * Sur y Oeste; por eso el grupo contrarrota la orientación de la seed, que sigue gobernando anillos
 * y materia. Una estrella cardinal girada deja de ser cardinal.
 */
export function cardinalStarPath(): string {
  const segments: string[] = [];
  for (let index = 0; index < STAR_POINTS; index++) {
    const tipAngle = (index * 360) / STAR_POINTS - 90;
    const tipRadius = index % 2 === 0 ? 128 : 54;
    const valleyAngle = tipAngle + 360 / (STAR_POINTS * 2);
    segments.push(`${index === 0 ? "M" : "L"}${point(tipAngle, tipRadius)}`);
    segments.push(`L${point(valleyAngle, 21)}`);
  }
  return `${segments.join(" ")} Z`;
}

/** Trozo del disco: sector dentado, no un arco. Al perderse hay masa que cae, no una línea. */
export function sealShardPath(index: number, signature: number): string {
  const span = 360 / SHARD_COUNT;
  const start = index * span + signature * 40;
  const end = start + span * (0.78 + hash(index * 3.1) * 0.18);
  const outer: string[] = [];
  const inner: string[] = [];
  for (let step = 0; step <= 4; step++) {
    const at = start + ((end - start) * step) / 4;
    outer.push(point(at, 118 + hash(index * 5.3 + step) * 16));
    inner.push(point(end - ((end - start) * step) / 4, 30 + hash(index * 7.7 + step) * 14));
  }
  return `M${outer.join(" L")} L${inner.join(" L")} Z`;
}

function shardStyle(index: number, signature: number): ShardStyle {
  const span = 360 / SHARD_COUNT;
  const middle = ((index + 0.5) * span + signature * 40) * (Math.PI / 180);
  // Se abre hacia su propio lado y cae: la gravedad manda sobre el reparto radial.
  const drift = Math.cos(middle) * (54 + hash(index * 2.9) * 40);
  const fall = 190 + hash(index * 4.1) * 130;
  return {
    "--outcome-shard-x": `${drift.toFixed(1)}px`,
    "--outcome-shard-y": `${fall.toFixed(1)}px`,
    "--outcome-shard-spin": `${((hash(index * 6.7) - 0.5) * 96).toFixed(1)}deg`,
    "--outcome-shard-delay": `${(300 + hash(index * 8.3) * 130).toFixed(0)}ms`,
  };
}

function moteStyle(index: number, signature: number): MoteStyle {
  const angle = (signature * 360 + index * 137.508) % 360;
  const distance = 27 + ((index * 47) % 19);
  const delay = 90 + ((index * 83) % 520);
  const size = 9 + ((index * 31) % 17);
  return {
    "--outcome-mote-angle": `${angle.toFixed(2)}deg`,
    "--outcome-mote-distance": `${-distance}vmin`,
    "--outcome-mote-far": `${-(distance + 16)}vmin`,
    "--outcome-mote-delay": `${delay}ms`,
    "--outcome-mote-size": `${size}px`,
  };
}

/**
 * Sello final del desenlace de una Visión. No decide el resultado: sólo presenta el que ya fijó el
 * engine. La firma de la seed técnica orienta runas y materia para que el mismo Futuro conserve su marca.
 */
export function DestinyOutcomeSeal({ outcome, seed }: Props) {
  const playSfx = useAudioStore((state) => state.playSfx);
  const signature = futureVisualSignature(seed);
  const style: SealStyle = { "--outcome-seed-angle": `${(signature * 360).toFixed(2)}deg` };

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => {
      if (outcome === "preserved") playSfx("buff", { rate: 0.76 });
      else playSfx("stoneCrash", { rate: 0.68 });
    }, reducedMotion ? 40 : 430);
    return () => window.clearTimeout(timer);
  }, [outcome, playSfx]);

  return (
    <div className={`destiny-outcome-seal is-${outcome}`} style={style} aria-hidden="true">
      <div className="destiny-outcome-seal-glow" />
      <svg className="destiny-outcome-seal-svg" viewBox="0 0 320 320">
        <circle className="destiny-outcome-ring destiny-outcome-ring-outer" cx="160" cy="160" r="132" pathLength="1" />
        <circle className="destiny-outcome-ring destiny-outcome-ring-middle" cx="160" cy="160" r="106" pathLength="1" />
        <circle className="destiny-outcome-ring destiny-outcome-ring-inner" cx="160" cy="160" r="72" pathLength="1" />

        <g className="destiny-outcome-ticks">
          {Array.from({ length: TICK_COUNT }, (_, index) => {
            const inner = tickPoint(index, index % 3 === 0 ? 113 : 118);
            const outer = tickPoint(index, 126);
            return <line key={index} x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />;
          })}
        </g>

        {outcome === "preserved" ? (
          <g className="destiny-outcome-preserved-mark destiny-outcome-cardinal">
            <circle className="destiny-outcome-core" cx="160" cy="160" r="54" />
            <path className="destiny-outcome-star-fill" d={cardinalStarPath()} />
            <path className="destiny-outcome-star" pathLength="1" d={cardinalStarPath()} />
            <g className="destiny-outcome-cardinal-rays">
              {[0, 90, 180, 270].map((degrees) => {
                const from = polar(degrees - 90, 137);
                const to = polar(degrees - 90, 152);
                return <line key={degrees} pathLength="1" x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
              })}
            </g>
          </g>
        ) : (
          <g className="destiny-outcome-lost-mark">
            <circle className="destiny-outcome-core" cx="160" cy="160" r="54" />
            <g className="destiny-outcome-shards">
              {Array.from({ length: SHARD_COUNT }, (_, index) => (
                <path
                  key={index}
                  className="destiny-outcome-shard"
                  style={shardStyle(index, signature)}
                  d={sealShardPath(index, signature)}
                />
              ))}
            </g>
            <path className="destiny-outcome-crack destiny-outcome-crack-a" pathLength="1" d="M151 91 L168 126 L150 151 L171 178 L154 226" />
            <path className="destiny-outcome-crack destiny-outcome-crack-b" pathLength="1" d="M150 151 L118 169 L95 164" />
            <path className="destiny-outcome-crack destiny-outcome-crack-c" pathLength="1" d="M171 178 L205 164 L225 173" />
          </g>
        )}
      </svg>

      <div className="destiny-outcome-motes">
        {Array.from({ length: MOTE_COUNT }, (_, index) => (
          <span key={index} className="destiny-outcome-mote" style={moteStyle(index, signature)} />
        ))}
      </div>
    </div>
  );
}

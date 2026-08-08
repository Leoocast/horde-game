import { useId } from "react";
import { ATTACK_CHEVRON_VIEW, attackChevronGeometry } from "./attackChevronGeometry";

/**
 * Halo y galón viven en el mismo contenedor porque comparten la inclinación de
 * la carta: cuando el Eco de la Hueste se declara atacante se ladea 4°, y los
 * marcadores tienen que ladearse y enderezarse con él, no antes.
 */
export function HostAttackerMarker() {
  return (
    <span className="battlefield-attack-markers" aria-hidden="true">
      <span className="battlefield-attack-halo" />
      <AttackChevronGlyph />
    </span>
  );
}

/**
 * Galón del atacante de la Hueste. Comparte el lenguaje de brillo de
 * `TacticalArrowGlyph` —bloom propio y bandas de destello recortadas a la
 * silueta— sobre la hoja afilada del ataque. El degradado corre a lo largo de
 * la hoja: raíz apagada en los hombros y brasa en la punta, que es donde la
 * lectura tiene que caer.
 */
export function AttackChevronGlyph() {
  const instanceId = useId().replace(/:/g, "");
  const { width, height } = ATTACK_CHEVRON_VIEW;
  const { blade, tip, tipBottom } = attackChevronGeometry(width, height);

  const bladeId = `${instanceId}-blade`;
  const shadeId = `${instanceId}-shade`;
  const glintId = `${instanceId}-glint`;
  const sparkId = `${instanceId}-spark`;
  const clipId = `${instanceId}-clip`;
  const bloomId = `${instanceId}-bloom`;

  const band = Math.max(22, width * 0.24);
  // Las dos bandas nacen en los hombros y mueren juntas sobre la punta.
  const glints = [
    { from: -band, to: width / 2 - band },
    { from: width, to: width / 2 },
  ];

  return (
    <svg
      className="battlefield-attack-chevron"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient
          id={bladeId}
          gradientUnits="userSpaceOnUse"
          cx={tip.x}
          cy={tip.y}
          r={Math.hypot(width / 2, tip.y) * 1.02}
        >
          <stop offset="0%" style={{ stopColor: "var(--attack-chevron-hot)" }} />
          <stop offset="26%" style={{ stopColor: "var(--attack-chevron-mid)" }} />
          <stop offset="62%" style={{ stopColor: "var(--attack-chevron-deep)" }} />
          <stop offset="100%" style={{ stopColor: "var(--attack-chevron-root)" }} />
        </radialGradient>
        {/* Volumen: canto superior encendido, canto inferior en sombra. */}
        <linearGradient id={shadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: "#ffffff", stopOpacity: 0.34 }} />
          <stop offset="34%" style={{ stopColor: "#ffffff", stopOpacity: 0.06 }} />
          <stop offset="72%" style={{ stopColor: "#000000", stopOpacity: 0.16 }} />
          <stop offset="100%" style={{ stopColor: "#000000", stopOpacity: 0.42 }} />
        </linearGradient>
        <linearGradient id={glintId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" style={{ stopColor: "var(--attack-chevron-core)", stopOpacity: 0 }} />
          <stop offset="50%" style={{ stopColor: "var(--attack-chevron-spark)", stopOpacity: 0.92 }} />
          <stop offset="100%" style={{ stopColor: "var(--attack-chevron-core)", stopOpacity: 0 }} />
        </linearGradient>
        <radialGradient
          id={sparkId}
          gradientUnits="userSpaceOnUse"
          cx={tipBottom.x}
          cy={tipBottom.y - height * 0.09}
          r={height * 0.5}
        >
          <stop offset="0%" style={{ stopColor: "#fff6dd", stopOpacity: 1 }} />
          <stop offset="42%" style={{ stopColor: "var(--attack-chevron-spark)", stopOpacity: 0.85 }} />
          <stop offset="100%" style={{ stopColor: "var(--attack-chevron-spark)", stopOpacity: 0 }} />
        </radialGradient>
        <clipPath id={clipId}>
          <path d={blade} />
        </clipPath>
        <filter id={bloomId} x="-80%" y="-260%" width="260%" height="620%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.7" result="spread" />
          <feComponentTransfer in="spread">
            <feFuncA type="linear" slope="1.05" />
          </feComponentTransfer>
        </filter>
      </defs>

      <g className="battlefield-attack-chevron-bloom" filter={`url(#${bloomId})`}>
        <path d={blade} fill={`url(#${bladeId})`} />
      </g>

      <path d={blade} fill={`url(#${bladeId})`} />
      <path d={blade} fill={`url(#${shadeId})`} />

      {glints.map((glint) => (
        <g key={glint.from} clipPath={`url(#${clipId})`}>
          <g
            className="battlefield-attack-chevron-glint"
            style={{
              ["--attack-chevron-glint-from" as string]: `${glint.from}px`,
              ["--attack-chevron-glint-to" as string]: `${glint.to}px`,
            }}
          >
            <rect x={0} y={-height} width={band} height={height * 3} fill={`url(#${glintId})`} />
          </g>
        </g>
      ))}

      <g clipPath={`url(#${clipId})`}>
        <g
          className="battlefield-attack-chevron-spark"
          style={{ transformOrigin: `${tipBottom.x}px ${tipBottom.y}px` }}
        >
          <rect
            x={tipBottom.x - height}
            y={tipBottom.y - height}
            width={height * 2}
            height={height * 2}
            fill={`url(#${sparkId})`}
          />
        </g>
      </g>
    </svg>
  );
}

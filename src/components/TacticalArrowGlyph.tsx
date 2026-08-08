import { useId } from "react";
import {
  GLINT_BAND_MIN_PX,
  GLINT_BAND_RATIO,
  tacticalArrowPalette,
  tacticalArrowShape,
  type TacticalArrowCurve,
} from "./tacticalArrowGeometry";

/**
 * Glifo único de todas las flechas del juego: defensa, ataque del Cronista y
 * selección de objetivos. La hoja nace en cero, engrosa hacia la punta y lleva
 * un destello que la recorre; el color lo aporta cada superficie.
 */
export function TacticalArrowGlyph({ curve, color }: { curve: TacticalArrowCurve; color: string }) {
  const instanceId = useId().replace(/:/g, "");
  const { blade, head, chordLength } = tacticalArrowShape(curve);
  const palette = tacticalArrowPalette(color);
  const bladeGradientId = `${instanceId}-blade`;
  const glintGradientId = `${instanceId}-glint`;
  const clipId = `${instanceId}-clip`;
  const bloomId = `${instanceId}-bloom`;

  const band = Math.max(GLINT_BAND_MIN_PX, chordLength * GLINT_BAND_RATIO);
  const angle = (Math.atan2(curve.end.y - curve.start.y, curve.end.x - curve.start.x) * 180) / Math.PI;
  // La banda del destello barre sobre la cuerda; el recorte a la hoja le da la
  // curvatura, así que alcanza con cubrir de lado a lado con margen.
  const bandReach = 160;

  return (
    <g className="tactical-arrow-glyph">
      <defs>
        <linearGradient id={bladeGradientId} gradientUnits="userSpaceOnUse" x1={curve.start.x} y1={curve.start.y} x2={curve.end.x} y2={curve.end.y}>
          <stop offset="0%" stopColor={palette.deep} stopOpacity="0.2" />
          <stop offset="30%" stopColor={palette.mid} stopOpacity="0.9" />
          <stop offset="100%" stopColor={palette.hot} stopOpacity="1" />
        </linearGradient>
        <linearGradient id={glintGradientId} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={palette.core} stopOpacity="0" />
          <stop offset="50%" stopColor={palette.core} stopOpacity="0.9" />
          <stop offset="100%" stopColor={palette.core} stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={blade} />
          <path d={head} />
        </clipPath>
        <filter id={bloomId} x="-70%" y="-70%" width="240%" height="240%" colorInterpolationFilters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="4.7" result="spread" />
          <feComponentTransfer in="spread" result="bloom">
            <feFuncA type="linear" slope="1.05" />
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="bloom" />
            <feMergeNode in="bloom" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g filter={`url(#${bloomId})`}>
        <path className="tactical-arrow-blade" d={blade} fill={`url(#${bladeGradientId})`} />
        <path className="tactical-arrow-head" d={head} fill={`url(#${bladeGradientId})`} />
      </g>
      <g clipPath={`url(#${clipId})`}>
        <g transform={`translate(${curve.start.x} ${curve.start.y}) rotate(${angle})`}>
          <g
            className="tactical-arrow-glint"
            style={{
              ["--tactical-arrow-glint-from" as string]: `${-band}px`,
              ["--tactical-arrow-glint-to" as string]: `${chordLength + band}px`,
            }}
          >
            <rect x={0} y={-bandReach} width={band} height={bandReach * 2} fill={`url(#${glintGradientId})`} />
          </g>
        </g>
      </g>
    </g>
  );
}

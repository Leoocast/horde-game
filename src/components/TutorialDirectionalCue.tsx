import { useId } from "react";

/**
 * Guía direccional del tutorial. Es la Cuchilla de la familia táctica
 * —`TacticalArrowGlyph`— con la punta roma: la misma hoja que nace en cero y
 * engrosa hacia la punta, y el mismo destello que la recorre, pero con la nariz
 * cortada y redondeada para que instruya en vez de amenazar.
 *
 * La geometría está horneada sobre un eje vertical con la punta en `y = 4` y la
 * base en `y = 204`; el viewBox es más alto que ese recorrido para que el glifo
 * se asiente dentro del hueco que le mide `guidedDirectionalCueBounds`. El color
 * lo aporta el contenedor con `--tutorial-cue-*` según el tono.
 */
export function TutorialDirectionalCueGlyph() {
  const instanceId = useId().replace(/:/g, "");
  const bladeId = `${instanceId}-tutorial-cue`;
  const glintId = `${instanceId}-tutorial-cue-glint`;
  const clipId = `${instanceId}-tutorial-cue-clip`;
  const blade = "M26.4 204L27.3 195.8L28 187.5L28.6 179.2L29.3 170.9L29.8 162.6L30.4 154.3L31 146L31.5 137.7L32.1 129.4L32.6 121.1L33.1 112.8L33.7 104.6L34.2 96.4L34.7 88.2L35.2 80.1L35.7 72.1L36.2 64.1L36.6 56.1L37.1 48.3L37.6 40.5L14.4 40.5L14.9 48.3L15.4 56.1L15.8 64.1L16.3 72.1L16.8 80.1L17.3 88.2L17.8 96.4L18.3 104.6L18.9 112.8L19.4 121.1L19.9 129.4L20.5 137.7L21 146L21.6 154.3L22.2 162.6L22.7 170.9L23.4 179.2L24 187.5L24.7 195.8L25.6 204Z";
  const head = "M34.9 17.1L50.8 58.4Q26 31.2 1.2 58.4L17.1 17.1Q26 -9.1 34.9 17.1Z";
  return (
    <svg viewBox="-4 -16 60 240" aria-hidden="true">
      <defs>
        <linearGradient id={bladeId} gradientUnits="userSpaceOnUse" x1="26" y1="204" x2="26" y2="4">
          <stop className="tutorial-directional-stop-deep" offset="0%" />
          <stop className="tutorial-directional-stop-mid" offset="36%" />
          <stop className="tutorial-directional-stop-hot" offset="100%" />
        </linearGradient>
        <linearGradient id={glintId} gradientUnits="userSpaceOnUse" x1="26" y1="-48" x2="26" y2="0">
          <stop className="tutorial-directional-stop-glint" offset="0%" stopOpacity="0" />
          <stop className="tutorial-directional-stop-glint" offset="50%" stopOpacity="0.9" />
          <stop className="tutorial-directional-stop-glint" offset="100%" stopOpacity="0" />
        </linearGradient>
        <clipPath id={clipId}>
          <path d={blade} />
          <path d={head} />
        </clipPath>
      </defs>
      <path className="tutorial-directional-blade" fill={`url(#${bladeId})`} d={blade} />
      <path className="tutorial-directional-head" fill={`url(#${bladeId})`} d={head} />
      <g clipPath={`url(#${clipId})`}>
        <rect className="tutorial-directional-glint" x="-4" y="-48" width="60" height="48" fill={`url(#${glintId})`} />
      </g>
    </svg>
  );
}

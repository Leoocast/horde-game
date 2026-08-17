import { useEffect, useRef } from "react";

import {
  TEMPORAL_BACKDROP_FRAGMENT,
  TEMPORAL_BACKDROP_VERTEX,
} from "./temporalBackdropShader";
import {
  temporalDialTransform,
  uprightTemporalDialLabelTransform,
} from "./temporalDialPresentation";

const DIAL_LABELS = [
  { x: 0, y: -215, text: "000° · N", textAnchor: "middle" },
  { x: 160, y: -155, text: "045°" },
  { x: 217, y: 4, text: "090° · E" },
  { x: 160, y: 163, text: "135°" },
  { x: 0, y: 228, text: "180° · S", textAnchor: "middle" },
  { x: -160, y: 163, text: "225°", textAnchor: "end" },
  { x: -217, y: 4, text: "270° · O", textAnchor: "end" },
  { x: -160, y: -155, text: "315°", textAnchor: "end" },
] as const;

const DIAL_DAMPING_PER_SECOND = 12;
const DIAL_SETTLE_EPSILON = 0.05;

/**
 * Fondo espacio/temporal permanente.
 *
 * Tiene contexto propio a propósito. `sharedVfxRenderer` está construido para efectos
 * transitorios: dibuja en su lienzo WebGL y vuelca el recorte a un canvas 2D con
 * `drawImage` en cada fotograma, y cada efecto hace `clear()` sobre el mismo renderer.
 * Un fondo permanente por esa vía significaría copiar la pantalla completa cada
 * fotograma durante toda la sesión y pelearse con Burn, el vórtice y la derrota.
 *
 * Si no hay WebGL, el lienzo se oculta y queda el fondo CSS de la pantalla.
 */
export function TemporalBackdrop({
  climax = 0,
  grid = false,
  dial = 0,
  dialRevision = 0,
  settleDialImmediately = false,
  onDialSettled,
}: {
  /** Mismo umbral que lleva la música a clímax. */
  climax?: number;
  /** Retículo del instrumento. Sólo en el tablero: el menú va a cielo limpio. */
  grid?: boolean;
  /** Ángulo acumulado del disco de grados, en grados. El aparato mide cómo se mueve
   *  el futuro: a la derecha cuando la Hueste pierde, a la izquierda cuando pierde
   *  el Cronista. */
  dial?: number;
  /** Revisión monotónica del objetivo; un valor que vuelve al ángulo anterior sigue siendo un
   * movimiento nuevo que debe asentarse. */
  dialRevision?: number;
  /** Emergency path: present the exact dial target on the next rendered frame. */
  settleDialImmediately?: boolean;
  /** Señala la revisión exacta que ya terminó de presentar. */
  onDialSettled?: (dialRevision: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dialRef = useRef<SVGGElement | null>(null);
  const dialLabelRefs = useRef<Array<SVGTextElement | null>>([]);
  const targetRef = useRef({ climax, dial, dialRevision, settleDialImmediately });
  const dialLoopActiveRef = useRef(false);
  const onDialSettledRef = useRef(onDialSettled);

  // El bucle lee los valores por referencia para no reiniciarse en cada cambio.
  targetRef.current = { climax, dial, dialRevision, settleDialImmediately };
  onDialSettledRef.current = onDialSettled;

  const positionDial = (degrees: number) => {
    dialRef.current?.setAttribute("transform", temporalDialTransform(degrees));
    dialLabelRefs.current.forEach((label, index) => {
      if (!label) return;
      label.setAttribute(
        "transform",
        uprightTemporalDialLabelTransform(degrees, DIAL_LABELS[index]),
      );
    });
  };

  // Con movimiento reducido o sin renderer activo no hay bucle: el disco salta a su sitio y
  // también completa el handshake para que una captura nunca quede esperando un contexto ausente.
  useEffect(() => {
    if (!dialRef.current) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (dialLoopActiveRef.current && !reducedMotion && !settleDialImmediately) return;
    positionDial(dial);
    onDialSettledRef.current?.(dialRevision);
  }, [dial, dialRevision, settleDialImmediately]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    };

    const vertex = compile(gl.VERTEX_SHADER, TEMPORAL_BACKDROP_VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, TEMPORAL_BACKDROP_FRAGMENT);
    const program = vertex && fragment ? gl.createProgram() : null;
    if (!vertex || !fragment || !program) {
      canvas.style.display = "none";
      return;
    }

    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      canvas.style.display = "none";
      return;
    }
    gl.useProgram(program);

    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, "aPosition");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(program, "uRes");
    const uTime = gl.getUniformLocation(program, "uTime");
    const uClimax = gl.getUniformLocation(program, "uClimax");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    dialLoopActiveRef.current = !reducedMotion;
    const startedAt = performance.now();
    let climaxMix = targetRef.current.climax;
    let dialMix = targetRef.current.dial;
    let lastDrawAt = startedAt;
    let lastReportedDialRevision = targetRef.current.dialRevision;
    let frame = 0;
    let disposed = false;
    let contextLost = false;

    const draw = (now: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(2, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(2, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // El cambio de estado se interpola: un salto seco se ve.
      climaxMix += (targetRef.current.climax - climaxMix) * 0.04;
      // Damping por tiempo, no por frame: el giro conserva velocidad a 60/120/144 Hz y, a
      // diferencia de la aproximación asintótica anterior, hace snap y tiene un final observable.
      const deltaSeconds = Math.min(Math.max((now - lastDrawAt) / 1000, 0), 0.05);
      lastDrawAt = now;
      const dialTarget = targetRef.current.dial;
      const targetRevision = targetRef.current.dialRevision;
      const dialDelta = dialTarget - dialMix;
      if (targetRef.current.settleDialImmediately) {
        dialMix = dialTarget;
        if (lastReportedDialRevision !== targetRevision) {
          lastReportedDialRevision = targetRevision;
          onDialSettledRef.current?.(targetRevision);
        }
      } else if (Math.abs(dialDelta) <= DIAL_SETTLE_EPSILON) {
        dialMix = dialTarget;
        if (lastReportedDialRevision !== targetRevision) {
          lastReportedDialRevision = targetRevision;
          onDialSettledRef.current?.(targetRevision);
        }
      } else {
        dialMix += dialDelta * (1 - Math.exp(-DIAL_DAMPING_PER_SECOND * deltaSeconds));
      }
      // Se escribe el atributo en vez de usar CSS porque el origen de rotación del grupo ya es
      // su propio centro y así no depende de `fill-box`.
      positionDial(dialMix);

      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, reducedMotion ? 8 : (now - startedAt) / 1000);
      gl.uniform1f(uClimax, climaxMix);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      if (disposed || contextLost) return;
      draw(now);
      frame = requestAnimationFrame(loop);
    };

    // Movimiento reducido: un solo fotograma fijo, sin bucle.
    if (reducedMotion) {
      draw(startedAt);
    } else {
      frame = requestAnimationFrame(loop);
    }

    // La ventana oculta no debe seguir dibujando; acompaña a `backgroundThrottling`.
    const onVisibility = () => {
      if (reducedMotion || disposed || contextLost) return;
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      dialLoopActiveRef.current = false;
      positionDial(targetRef.current.dial);
      onDialSettledRef.current?.(targetRef.current.dialRevision);
      canvas.style.display = "none";
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
      dialLoopActiveRef.current = false;
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      // Nada de `loseContext()` aquí: mata el contexto del lienzo para siempre y
      // StrictMode remonta el efecto sobre ese mismo nodo, así que el segundo
      // getContext devolvería null y el fondo no llegaría a dibujarse nunca en
      // desarrollo. El contexto se libera con el propio canvas al desmontarse.
    };
  }, []);

  return (
    <div className="temporal-backdrop" aria-hidden="true">
      <canvas ref={canvasRef} className="temporal-backdrop-sky" />
      {/* El retículo se queda fijo mientras el cosmos deriva detrás: ese contraste es
          lo que hace leer que hay un cristal y un aparato entre el jugador y el fondo.
          Celdas grandes y rectangulares; apretarlas lo convierte en papel milimetrado. */}
      {grid && (
      <svg
        className="temporal-backdrop-grid"
        viewBox="0 0 1000 562"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          {/* Celdas cuadradas. El viewBox se escala uniforme con `slice`, así que 78x78
              en unidades del viewBox son cuadrados perfectos en pantalla. */}
          <pattern
            id="temporalBackdropCells"
            width="78"
            height="78"
            patternUnits="userSpaceOnUse"
            patternTransform="translate(26 20)"
          >
            <path className="cell" d="M78 0H0V78" />
          </pattern>

          {/* Vidrio: un reflejo diagonal muy tenue y un oscurecido hacia los cantos.
              Son las dos señales que hacen leer una superficie física delante del
              fondo en vez de unas líneas dibujadas sobre él. */}
          <linearGradient id="temporalBackdropSheen" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
            <stop offset="0.32" stopColor="#dbeef6" stopOpacity="0.028" />
            <stop offset="0.45" stopColor="#ffffff" stopOpacity="0.05" />
            <stop offset="0.6" stopColor="#dbeef6" stopOpacity="0.016" />
            <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="temporalBackdropGlassEdge" cx="0.5" cy="0.5" r="0.74">
            <stop offset="0.52" stopColor="#020a0c" stopOpacity="0" />
            <stop offset="1" stopColor="#020a0c" stopOpacity="0.42" />
          </radialGradient>
          {/* Blanco deja ver, negro oculta: el centro se vacía de celdas y reaparecen
              difuminadas hacia fuera, para que la rejilla no cruce por detrás de las
              cartas. Sólo enmascara las celdas, no el marco ni los grados. */}
          <radialGradient id="temporalBackdropFade" cx="0.5" cy="0.5" r="0.62">
            <stop offset="0" stopColor="#0b0b0b" />
            <stop offset="0.34" stopColor="#2a2a2a" />
            <stop offset="0.72" stopColor="#c8c8c8" />
            <stop offset="1" stopColor="#ffffff" />
          </radialGradient>
          <mask id="temporalBackdropCellMask">
            <rect width="1000" height="562" fill="url(#temporalBackdropFade)" />
          </mask>
        </defs>
        <rect
          width="1000"
          height="562"
          fill="url(#temporalBackdropCells)"
          mask="url(#temporalBackdropCellMask)"
        />
        <rect x="26" y="20" width="948" height="522" fill="url(#temporalBackdropGlassEdge)" />
        <rect x="26" y="20" width="948" height="522" fill="url(#temporalBackdropSheen)" />
        <rect className="frame" x="26" y="20" width="948" height="522" />
        {/* El canto que capta la luz, arriba e izquierda: da grosor al cristal. */}
        <path className="glass-lip" d="M27 541 V21 H973" />

        {/* Los grados: la parte central del instrumento. */}
        <g ref={dialRef} className="dial" transform={temporalDialTransform(0)}>
          <circle className="dial-ring" r="196" pathLength={360} strokeDasharray="1 14" />
          <circle className="dial-arc" r="183" pathLength={360} strokeDasharray="34 18 5 33" />

          <path className="dial-tick" d="M0 -208 V-195 M147 -147 L138 -138 M208 0 H195 M147 147 L138 138" />
          <path className="dial-tick" d="M0 208 V195 M-147 147 L-138 138 M-208 0 H-195 M-147 -147 L-138 -138" />

          {DIAL_LABELS.map((label, index) => (
            <text
              key={label.text}
              ref={(element) => { dialLabelRefs.current[index] = element; }}
              className="dial-label"
              x={label.x}
              y={label.y}
              textAnchor={"textAnchor" in label ? label.textAnchor : undefined}
              transform={uprightTemporalDialLabelTransform(0, label)}
            >
              {label.text}
            </text>
          ))}
        </g>

        {/* Las marcas caen sobre líneas reales de la rejilla. Si no coinciden, el
            retículo deja de parecer un mismo aparato. */}
        <g className="edge-tick">
          <path d="M260 20 V32 M494 20 V32 M728 20 V32" />
          <path d="M260 542 V530 M494 542 V530 M728 542 V530" />
          <path d="M26 176 H38 M26 332 H38 M26 488 H38" />
          <path d="M974 176 H962 M974 332 H962 M974 488 H962" />
        </g>

      </svg>
      )}
    </div>
  );
}

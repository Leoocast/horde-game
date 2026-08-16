import { useEffect, useRef } from "react";

import {
  TEMPORAL_BACKDROP_FRAGMENT,
  TEMPORAL_BACKDROP_VERTEX,
} from "./temporalBackdropShader";

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
  board = 0,
  climax = 0,
}: {
  /** 0 menú, 1 tablero. Se interpola, así que sirve de transición entre pantallas. */
  board?: number;
  /** Mismo umbral que lleva la música a clímax. */
  climax?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const targetRef = useRef({ board, climax });

  // El bucle lee los valores por referencia para no reiniciarse en cada cambio.
  targetRef.current = { board, climax };

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
    const uBoard = gl.getUniformLocation(program, "uBoard");
    const uClimax = gl.getUniformLocation(program, "uClimax");

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const startedAt = performance.now();
    let boardMix = targetRef.current.board;
    let climaxMix = targetRef.current.climax;
    let frame = 0;
    let disposed = false;

    const draw = (now: number) => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(2, Math.round(canvas.clientWidth * ratio));
      const height = Math.max(2, Math.round(canvas.clientHeight * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      // Los cambios de pantalla y de estado se interpolan: un salto seco se ve.
      boardMix += (targetRef.current.board - boardMix) * 0.06;
      climaxMix += (targetRef.current.climax - climaxMix) * 0.04;

      gl.viewport(0, 0, width, height);
      gl.uniform2f(uRes, width, height);
      gl.uniform1f(uTime, reducedMotion ? 8 : (now - startedAt) / 1000);
      gl.uniform1f(uBoard, boardMix);
      gl.uniform1f(uClimax, climaxMix);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const loop = (now: number) => {
      if (disposed) return;
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
      if (reducedMotion || disposed) return;
      cancelAnimationFrame(frame);
      if (!document.hidden) frame = requestAnimationFrame(loop);
    };
    document.addEventListener("visibilitychange", onVisibility);

    const onContextLost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      canvas.style.display = "none";
    };
    canvas.addEventListener("webglcontextlost", onContextLost);

    return () => {
      disposed = true;
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

  return <canvas ref={canvasRef} className="temporal-backdrop" aria-hidden="true" />;
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

import { futureVisualSignature } from "../utils/futureIdentity";
import {
  DESTINY_CONSTELLATION_EDGES,
  DESTINY_CONSTELLATION_NODES,
  DESTINY_CONSTELLATION_TOTAL_MS,
  DESTINY_CONSTELLATION_VERDICT_AT,
  destinyConstellationBloomAt,
  destinyConstellationPlan,
} from "./destinyConstellationGeometry";
import {
  DESTINY_CONSTELLATION_FRAGMENT_SHADER,
  DESTINY_CONSTELLATION_VERTEX_SHADER,
} from "./destinyConstellationShader";
import {
  TEMPORAL_DIAL_VIEWBOX_HEIGHT,
  TEMPORAL_DIAL_VIEWBOX_WIDTH,
  chronicleSigilPlan,
  temporalDialRingRadius,
  TEMPORAL_DIAL_RING_RADIUS,
} from "./chronicleSigilGeometry";
import {
  boundedVfxPixelRatio,
  renderSharedVfxFrame,
  sharedVfxUnavailable,
} from "./sharedVfxRenderer";

type Props = {
  seed: string;
  /** El primer fotograma válido ya está en pantalla: el tablero puede retirarse. */
  onSequenceStart: () => void;
  /** La figura está cerrada y la onda en marcha: el desenlace puede nombrarse. */
  onVerdict: () => void;
};

/** El tablero vivo se retira mientras la constelación se construye sobre el instrumento. */
const CLEARING_BODY_CLASS = "is-victory-clearing";
/** El canvas se copia de WebGL a 2D: más de 60 entregas por segundo sólo duplican trabajo. */
const FRAME_INTERVAL_MS = 1000 / 60;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Silueta quieta para movimiento reducido o falta de WebGL, sobre el propio instrumento. */
function stillStarPoints(signature: number): string {
  const plan = chronicleSigilPlan(TEMPORAL_DIAL_RING_RADIUS, signature);
  return plan.nodes
    .slice(0, DESTINY_CONSTELLATION_NODES - 1)
    .map((node) => `${(500 + node.x).toFixed(1)},${(281 + node.y).toFixed(1)}`)
    .join(" ");
}

/**
 * Victoria: motas de luz entran desde fuera del encuadre, encienden una a una las puntas de la
 * rosa cardinal y cierran la figura exactamente sobre el disco de grados que ya está en el
 * tablero. El Capítulo queda preservado en la Crónica.
 *
 * No hay captura ni placa: el tablero se retira solo y lo que queda detrás es el espacio del
 * propio juego, con su cielo y su instrumento todavía vivos.
 *
 * La maqueta de decisión es `dev/mockups/vfx/destiny-constellation.html`.
 */
export function VictoryConstellationAnimator({ seed, onSequenceStart, onVerdict }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const signature = futureVisualSignature(seed);
  // Los callbacks entran por ref para que un renderizado del padre no reinicie el reloj.
  const sequenceStartRef = useRef(onSequenceStart);
  const verdictRef = useRef(onVerdict);
  sequenceStartRef.current = onSequenceStart;
  verdictRef.current = onVerdict;

  useEffect(() => {
    const canvas = canvasRef.current;
    const clearBoard = () => document.body.classList.add(CLEARING_BODY_CLASS);
    let sequenceAnnounced = false;
    let verdictAnnounced = false;
    const announceSequence = () => {
      if (sequenceAnnounced) return;
      sequenceAnnounced = true;
      sequenceStartRef.current();
    };
    const announceVerdict = () => {
      if (verdictAnnounced) return;
      verdictAnnounced = true;
      verdictRef.current();
    };

    // Sin movimiento o sin WebGL queda la silueta quieta: el tablero se retira igual y el
    // desenlace se nombra de inmediato.
    if (!canvas || prefersReducedMotion() || sharedVfxUnavailable()) {
      setFallback(true);
      clearBoard();
      announceSequence();
      announceVerdict();
      return () => document.body.classList.remove(CLEARING_BODY_CLASS);
    }

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uUnit: { value: 1 },
      uBloom: { value: 0 },
      uSeed: { value: signature },
      uNode: { value: Array.from({ length: DESTINY_CONSTELLATION_NODES }, () => new THREE.Vector4()) },
      uEdge: { value: Array.from({ length: DESTINY_CONSTELLATION_EDGES }, () => new THREE.Vector4()) },
      uEdgeT: { value: new Array<number>(DESTINY_CONSTELLATION_EDGES).fill(0) },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DESTINY_CONSTELLATION_VERTEX_SHADER,
      fragmentShader: DESTINY_CONSTELLATION_FRAGMENT_SHADER,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();

    let width = 1;
    let height = 1;
    let pixelRatio = 1;

    /* El instrumento manda sobre el tamaño de la figura, no al revés: el plan se construye a
       partir del radio del aro para que la punta larga caiga exactamente sobre él. */
    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      pixelRatio = boundedVfxPixelRatio(width, height, window.devicePixelRatio || 1);
      const plan = destinyConstellationPlan(temporalDialRingRadius(width, height), signature);

      uniforms.uRes.value.set(width, height);
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uCenter.value.set(width / 2, height / 2);
      uniforms.uUnit.value = plan.unit;
      plan.nodes.forEach((node, index) => {
        uniforms.uNode.value[index].set(node.x, node.y, node.lockAt, node.seed);
      });
      plan.edges.forEach((edge, index) => {
        uniforms.uEdge.value[index].set(edge.ax, edge.ay, edge.bx, edge.by);
        uniforms.uEdgeT.value[index] = edge.lockAt;
      });
    };
    resize();
    window.addEventListener("resize", resize);

    const renderConstellationFrame = () => renderSharedVfxFrame(canvas, {
      scene,
      camera,
      width,
      height,
      pixelRatio,
      // La figura se calibró en lineal, como el signo y el vórtice.
      outputEncoding: THREE.LinearEncoding,
    });

    // Este render permanece oculto: paga contexto, shaders y la primera copia 2D antes de que
    // empiece el reloj visible, para no perder el primer tramo de las motas.
    if (!renderConstellationFrame()) {
      setFallback(true);
      clearBoard();
      announceSequence();
      announceVerdict();
      window.removeEventListener("resize", resize);
      geometry.dispose();
      material.dispose();
      return () => document.body.classList.remove(CLEARING_BODY_CLASS);
    }

    let frame = 0;
    let startedAt = 0;
    let firstFramePresented = false;
    let lastRenderedAt = Number.NEGATIVE_INFINITY;

    const tick = (now: number) => {
      // En paneles de 120/144 Hz la copia WebGL→2D no necesita repetirse en cada refresco.
      if (now - lastRenderedAt < FRAME_INTERVAL_MS) {
        frame = window.requestAnimationFrame(tick);
        return;
      }
      const sinceLastRender = now - lastRenderedAt;
      lastRenderedAt = Number.isFinite(sinceLastRender)
        ? now - (sinceLastRender % FRAME_INTERVAL_MS)
        : now;

      const elapsed = now - startedAt;
      const t = Math.min(elapsed / DESTINY_CONSTELLATION_TOTAL_MS, 1);
      uniforms.uTime.value = now / 1000;
      uniforms.uT.value = t;
      uniforms.uBloom.value = destinyConstellationBloomAt(t);

      const drawn = renderConstellationFrame();
      if (!drawn) {
        setFallback(true);
        clearBoard();
        announceSequence();
        announceVerdict();
        return;
      }
      if (!firstFramePresented) {
        firstFramePresented = true;
        canvas.classList.add("is-ready");
        // El tablero se retira con el primer fotograma ya pintado de la constelación.
        clearBoard();
        announceSequence();
      }

      // La construcción es muda: la acompaña el tema de victoria, no un cue por punta.
      if (t >= DESTINY_CONSTELLATION_VERDICT_AT) announceVerdict();
      // La figura se queda encendida: no se desvanece al terminar.
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame((now) => {
      startedAt = now;
      tick(now);
    });

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.body.classList.remove(CLEARING_BODY_CLASS);
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      geometry.dispose();
      material.dispose();
    };
  }, [seed, signature]);

  return (
    <div className={`victory-constellation ${fallback ? "is-fallback" : ""}`} aria-hidden="true">
      <canvas ref={canvasRef} className="victory-constellation-canvas" />
      {fallback && (
        <svg
          className="victory-constellation-still"
          viewBox={`0 0 ${TEMPORAL_DIAL_VIEWBOX_WIDTH} ${TEMPORAL_DIAL_VIEWBOX_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
        >
          <polygon points={stillStarPoints(signature)} />
          <circle cx="500" cy="281" r="6" />
        </svg>
      )}
    </div>
  );
}

import { useEffect, useRef } from "react";
import * as THREE from "three";

import {
  CHRONICLE_SIGIL_DIAL_AT,
  CHRONICLE_SIGIL_DURATION_MS,
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_NODES,
  chronicleSigilChargeAt,
  chronicleSigilMotesAt,
  chronicleSigilPlan,
  chronicleSigilPresenceAt,
  chronicleSigilScaleAt,
  chronicleSigilSeatAt,
  chronicleSigilSweepAt,
  chronicleSigilSweepPresenceAt,
  temporalDialRingRadius,
} from "./chronicleSigilGeometry";
import {
  CHRONICLE_SIGIL_FRAGMENT_SHADER,
  CHRONICLE_SIGIL_VERTEX_SHADER,
} from "./chronicleSigilShader";
import { boundedVfxPixelRatio, renderSharedVfxFrame, sharedVfxUnavailable } from "./sharedVfxRenderer";
import { futureVisualSignature } from "../utils/futureIdentity";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Props = {
  /** Semilla de la partida: el mismo Futuro dibuja siempre el mismo signo. */
  seed: string;
  /** Instante absoluto del reloj de la página en que las cortinas empiezan a abrirse. */
  startsAtMs: number;
  /** El instrumento del tablero ya puede encenderse debajo. */
  onDialReady: () => void;
  /** El signo terminó de apagarse y el tablero recupera el control. */
  onComplete: () => void;
};

/**
 * Obertura del tablero: el signo del Futuro se traza sobre el Campo desnudo cuando el
 * encuentro empieza a abrirse, se sienta en las marcas del instrumento de grados, le entrega
 * su aro y desaparece. Recién entonces entra el HUD y detrás la mano inicial.
 *
 * El corte y la apertura del VS no se tocan: este componente monta exactamente cuando las
 * cortinas dejan de estar cerradas y no interviene en su animación.
 *
 * La maqueta de decisión es `dev/mockups/vfx/board-overture.html`.
 */
export function ChronicleSigilOverture({ seed, startsAtMs, onDialReady, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Los callbacks entran por ref para que un renderizado del padre no reinicie el reloj.
  const dialReadyRef = useRef(onDialReady);
  const completeCallbackRef = useRef(onComplete);
  const dialCommittedRef = useRef(false);
  const completeCommittedRef = useRef(false);
  dialReadyRef.current = onDialReady;
  completeCallbackRef.current = onComplete;

  useEffect(() => {
    const canvas = canvasRef.current;
    const announceDial = () => {
      if (dialCommittedRef.current) return;
      dialCommittedRef.current = true;
      dialReadyRef.current();
    };
    const finish = () => {
      if (completeCommittedRef.current) return;
      completeCommittedRef.current = true;
      // El aro pudo no llegar a anunciarse si el efecto se cortó antes de la entrega.
      announceDial();
      completeCallbackRef.current();
    };
    // Sin movimiento o sin WebGL no hay obertura: el tablero se entrega entero de una vez.
    if (!canvas || prefersReducedMotion() || sharedVfxUnavailable()) {
      finish();
      return;
    }

    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uUnit: { value: 1 },
      uDialR: { value: 1 },
      uScale: { value: 1 },
      uPresence: { value: 0 },
      uMotes: { value: 1 },
      uCharge: { value: 0 },
      uSeat: { value: 0 },
      uSweep: { value: 0 },
      uSweepPresence: { value: 1 },
      uNode: { value: Array.from({ length: CHRONICLE_SIGIL_NODES }, () => new THREE.Vector4()) },
      uEdge: { value: Array.from({ length: CHRONICLE_SIGIL_EDGES }, () => new THREE.Vector4()) },
      uEdgeT: { value: new Array<number>(CHRONICLE_SIGIL_EDGES).fill(0) },
    };

    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: CHRONICLE_SIGIL_VERTEX_SHADER,
      fragmentShader: CHRONICLE_SIGIL_FRAGMENT_SHADER,
      transparent: true,
      premultipliedAlpha: true,
      depthTest: false,
      depthWrite: false,
    });
    const scene = new THREE.Scene();
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();

    const signature = futureVisualSignature(seed);
    let width = 1;
    let height = 1;
    let pixelRatio = 1;

    /* El instrumento manda sobre el tamaño del signo, no al revés: el plan se construye a
       partir del radio del aro para que la punta larga caiga exactamente sobre él. El
       retículo cubre con `slice`, así que su escala es el mayor de los dos factores. */
    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      pixelRatio = boundedVfxPixelRatio(width, height, window.devicePixelRatio || 1);
      const ringRadius = temporalDialRingRadius(width, height);
      const plan = chronicleSigilPlan(ringRadius, signature);

      uniforms.uRes.value.set(width, height);
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uCenter.value.set(width / 2, height / 2);
      uniforms.uUnit.value = plan.unit;
      uniforms.uDialR.value = plan.ringRadius;
      plan.nodes.forEach((node, index) => {
        uniforms.uNode.value[index].set(node.x, node.y, node.lockAt, node.seed);
      });
      plan.edges.forEach((edge, index) => {
        uniforms.uEdge.value[index].set(edge.ax, edge.ay, edge.bx, edge.by);
        uniforms.uEdgeT.value[index] = edge.drawAt;
      });
    };
    resize();
    window.addEventListener("resize", resize);

    let frame = 0;
    let firstFramePresented = false;
    let failedFrames = 0;

    const tick = (now: number) => {
      const elapsed = now - startsAtMs;
      const seconds = Math.max(0, elapsed / 1000);

      uniforms.uTime.value = now / 1000;
      uniforms.uT.value = seconds;
      uniforms.uScale.value = chronicleSigilScaleAt(seconds);
      uniforms.uPresence.value = chronicleSigilPresenceAt(seconds);
      uniforms.uMotes.value = chronicleSigilMotesAt(seconds);
      uniforms.uCharge.value = chronicleSigilChargeAt(seconds);
      uniforms.uSeat.value = chronicleSigilSeatAt(seconds);
      uniforms.uSweep.value = chronicleSigilSweepAt(seconds);
      uniforms.uSweepPresence.value = chronicleSigilSweepPresenceAt(seconds);

      const drawn = renderSharedVfxFrame(canvas, {
        scene,
        camera,
        width,
        height,
        pixelRatio,
        outputEncoding: THREE.LinearEncoding,
      });
      if (drawn && elapsed >= 0 && !firstFramePresented) {
        firstFramePresented = true;
        // El lienzo sólo se revela cuando ya tiene una imagen válida del shader.
        canvas.style.opacity = "1";
      }
      if (!drawn && !firstFramePresented) {
        failedFrames += 1;
        // Dos intentos: `false` también cubre un canvas sin contexto 2D, no sólo WebGL ausente.
        if (failedFrames >= 2 || sharedVfxUnavailable()) {
          finish();
          return;
        }
      }

      if (seconds >= CHRONICLE_SIGIL_DIAL_AT) announceDial();
      if (elapsed >= CHRONICLE_SIGIL_DURATION_MS) {
        finish();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      canvas.style.opacity = "0";
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      geometry.dispose();
      material.dispose();
    };
  }, [seed, startsAtMs]);

  return <canvas ref={canvasRef} className="chronicle-sigil-overture" aria-hidden="true" />;
}

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";
import { shardPath, shardSuction, shardTiming } from "./destinyShardSuction";
import {
  DESTINY_HORIZON_RATIO,
  DESTINY_VORTEX_FRAGMENT_SHADER,
  DESTINY_VORTEX_VERTEX_SHADER,
} from "./destinyVortexShader";
import { renderSharedVfxFrame, sharedVfxUnavailable } from "./sharedVfxRenderer";

export type DestinyTransitionKind = "rewrite" | "contemplate";

type Props = {
  kind: DestinyTransitionKind;
  seed: string;
  onCovered: () => void;
  onComplete: () => void;
};

const COVER_MS = 980;
const REVEAL_MS = 1_040;
const COMPLETE_MS = COVER_MS + REVEAL_MS;
const REDUCED_COVER_MS = 120;
const REDUCED_COMPLETE_MS = 300;
/** El lienzo cubre la pantalla: se limita la resolución antes que el detalle del shader. */
const MAX_PIXEL_RATIO = 1.35;

/* Recorrido de la escena para repartirla en piezas. Un elemento que ocupa más que `SHARD_MAX_AREA`
   todavía es un contenedor y se abre; uno por debajo de `SHARD_MIN_AREA` es un icono suelto que no
   aporta nada al colapso. El tope de piezas y de profundidad mantiene acotado el número de capas
   que el compositor tiene que rasterizar. */
const SHARD_MAX_AREA = 0.22;
const SHARD_MIN_AREA = 0.0006;
const SHARD_MAX_DEPTH = 7;
const SHARD_LIMIT = 56;

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Shard = { element: HTMLElement; rect: DOMRect };

/** Piezas visibles de la escena, sin conocer un solo nombre de clase del tablero. */
function collectShards(root: Element, viewport: { width: number; height: number }): Shard[] {
  const viewportArea = Math.max(1, viewport.width * viewport.height);
  const shards: Shard[] = [];

  const visit = (element: HTMLElement, depth: number): void => {
    if (shards.length >= SHARD_LIMIT) return;
    const rect = element.getBoundingClientRect();
    const area = rect.width * rect.height;
    if (area <= 0) return;
    // Fuera de la pantalla no hay nada que tragarse.
    if (rect.right <= 0 || rect.bottom <= 0 || rect.left >= viewport.width || rect.top >= viewport.height) return;

    const share = area / viewportArea;
    if (share > SHARD_MAX_AREA && depth < SHARD_MAX_DEPTH) {
      for (const child of Array.from(element.children)) {
        if (child instanceof HTMLElement) visit(child, depth + 1);
      }
      return;
    }
    if (share >= SHARD_MIN_AREA) shards.push({ element, rect });
  };

  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement) visit(child, 1);
  }
  return shards;
}

export function DestinyRewriteTransition({ kind, seed, onCovered, onComplete }: Props) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);
  const [phase, setPhase] = useState<"absorbing" | "revealing">("absorbing");
  // Sin WebGL o con movimiento reducido queda una silueta quieta en vez de un hueco vacío.
  const [still, setStill] = useState(false);
  const futureCode = futureCodeFromSeed(seed);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
    const coverMs = reducedMotion ? REDUCED_COVER_MS : COVER_MS;
    const completeMs = reducedMotion ? REDUCED_COMPLETE_MS : COMPLETE_MS;

    document.body.classList.add("destiny-rewrite-active", "destiny-rewrite-absorbing");
    playSfx("activateEffect", { rate: 0.72 });

    const coverTimer = window.setTimeout(() => {
      document.body.classList.remove("destiny-rewrite-absorbing");
      document.body.classList.add("destiny-rewrite-revealing");
      setPhase("revealing");
      onCovered();
      // El horizonte se cierra sobre la escena: ese golpe es el clímax y no puede ser mudo.
      playSfx("stoneCrash", { rate: 0.62 });
    }, coverMs);
    // El futuro nuevo llega después del golpe, no encima; con movimiento reducido, casi pegado.
    const revealTimer = window.setTimeout(() => playSfx("drawOne", { rate: 0.78 }), coverMs + (reducedMotion ? 80 : 260));
    const completeTimer = window.setTimeout(onComplete, completeMs);

    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(revealTimer);
      window.clearTimeout(completeTimer);
      document.body.classList.remove("destiny-rewrite-active", "destiny-rewrite-absorbing", "destiny-rewrite-revealing");
    };
  }, [onComplete, onCovered, playSfx]);

  /* La escena no cae como un bloque: cada pieza se va por su cuenta, se estira en el eje que apunta
     al horizonte y llega tarde según lo lejos que estaba. Las animaciones se cancelan al pasar a
     revelar, así que la escena que vuelve nunca hereda una pieza tragada. */
  useEffect(() => {
    if (phase !== "absorbing" || prefersReducedMotion()) return;
    const scene = document.querySelector(".game-screen") ?? document.querySelector(".main-menu-shell");
    if (!scene) return;

    const viewport = { width: window.innerWidth, height: window.innerHeight };
    const shards = collectShards(scene, viewport);
    const animations = shards.map(({ element, rect }) => {
      const suction = shardSuction(rect, viewport);
      const { delayMs, durationMs } = shardTiming(suction.reach, COVER_MS);
      const radial = `rotate(${suction.angleDeg.toFixed(2)}deg)`;
      const unradial = `rotate(${(-suction.angleDeg).toFixed(2)}deg)`;
      element.style.willChange = "transform, opacity";
      /* La trayectoria ya viene muestreada de una sola función continua, así que el efecto se
         reproduce `linear`: la aceleración está en las posiciones, no en la curva de tiempo.
         Ponerle un easing propio a cada tramo hacía que uno terminara lanzado y el siguiente
         arrancara parado, y esa costura se veía como un frenazo a mitad de la caída.
         Todos los pasos comparten la misma lista de funciones de transform para que el navegador
         interpole componente a componente en vez de caer a interpolar matrices. */
      return element.animate(
        shardPath(suction).map((step) => ({
          offset: step.offset,
          opacity: step.opacity,
          transform: `translate(${step.x.toFixed(1)}px, ${step.y.toFixed(1)}px) ${radial} scale(${step.along.toFixed(4)}, ${step.across.toFixed(4)}) ${unradial}`,
        })),
        { duration: durationMs, delay: delayMs, easing: "linear", fill: "forwards" },
      );
    });

    return () => {
      for (const animation of animations) animation.cancel();
      for (const { element } of shards) element.style.willChange = "";
    };
  }, [phase]);

  // El agujero negro es un único plano a pantalla completa dibujado por el renderer compartido.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) {
      setStill(true);
      return;
    }

    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uCollapse: { value: 0 },
      uBurst: { value: 0 },
      uCenter: { value: new THREE.Vector2(0, 0) },
      uRadius: { value: 1 },
      uDisk: { value: new THREE.Vector3(1.0, 0.78, 0.34) },
      uRim: { value: new THREE.Vector3(0.34, 0.82, 0.78) },
      uCore: { value: new THREE.Vector3(1.0, 0.96, 0.86) },
    };
    const geometry = new THREE.PlaneGeometry(2, 2);
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader: DESTINY_VORTEX_VERTEX_SHADER,
      fragmentShader: DESTINY_VORTEX_FRAGMENT_SHADER,
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
    const resize = () => {
      width = Math.max(1, window.innerWidth);
      height = Math.max(1, window.innerHeight);
      uniforms.uRes.value.set(width, height);
      uniforms.uCenter.value.set(width / 2, height / 2);
      uniforms.uRadius.value = Math.min(width, height) * DESTINY_HORIZON_RATIO;
    };
    resize();
    window.addEventListener("resize", resize);

    const start = performance.now();
    let previous = start;
    let spin = 0;
    let frame = 0;
    let firstFramePresented = false;
    const tick = (now: number) => {
      const elapsed = now - start;
      // El giro se acumula por delta time: acelera al colapsar sin saltar cuando cambia el ritmo.
      const deltaSeconds = Math.min((now - previous) / 1000, 0.05);
      previous = now;
      const collapse = Math.min(elapsed / COVER_MS, 1);
      const burst = Math.max(0, Math.min((elapsed - COVER_MS) / REVEAL_MS, 1));
      spin += deltaSeconds * (1.05 + 3.6 * collapse * collapse) * (1 - 0.75 * burst);

      uniforms.uTime.value = now / 1000;
      uniforms.uSpin.value = spin;
      uniforms.uCollapse.value = collapse;
      uniforms.uBurst.value = burst;

      const drawn = renderSharedVfxFrame(canvas, {
        scene,
        camera,
        width,
        height,
        pixelRatio,
        outputEncoding: THREE.LinearEncoding,
      });
      if (drawn && !firstFramePresented) {
        firstFramePresented = true;
        // El lienzo sólo se revela cuando ya tiene una imagen válida del shader.
        canvas.style.opacity = "1";
      }
      if (!drawn && !firstFramePresented && sharedVfxUnavailable()) setStill(true);
      if (elapsed <= COMPLETE_MS) frame = requestAnimationFrame(tick);
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
  }, []);

  return (
    <div
      className={`destiny-vortex-overlay is-${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={t(kind === "rewrite" ? "destiny.transitionRewrite" : "destiny.transitionContemplate", { code: futureCode })}
    >
      <div className="destiny-vortex-veil" />
      <canvas ref={canvasRef} className="destiny-vortex-canvas" aria-hidden="true" />
      {still && <div className="destiny-vortex-still" aria-hidden="true" />}
      <div className="destiny-vortex-caption">
        <small>{t("destiny.future", { code: futureCode })}</small>
        <strong>{t(kind === "rewrite" ? "destiny.rewriting" : "destiny.contemplating")}</strong>
      </div>
    </div>
  );
}

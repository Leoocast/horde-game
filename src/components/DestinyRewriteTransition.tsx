import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { futureCodeFromSeed, futureVisualSignature } from "../utils/futureIdentity";
import { shardPath, shardSuction, shardTiming } from "./destinyShardSuction";
import {
  DESTINY_HORIZON_RATIO,
  DESTINY_VORTEX_FRAGMENT_SHADER,
  DESTINY_VORTEX_VERTEX_SHADER,
} from "./destinyVortexShader";
import { boundedVfxPixelRatio, renderSharedVfxFrame, sharedVfxUnavailable } from "./sharedVfxRenderer";
import {
  nextDestinyTransitionPhase,
  type DestinyTransitionPhase,
} from "./destinyTransitionBarrier";

export type DestinyTransitionKind = "rewrite" | "contemplate";

type Props = {
  transitionId: number;
  kind: DestinyTransitionKind;
  seed: string;
  opensVision?: boolean;
  onCovered: (transitionId: number, release: () => void) => void;
  onComplete: (transitionId: number) => void;
};

const COVER_MS = 980;
const REVEAL_MS = 1_040;
const COMPLETE_MS = COVER_MS + REVEAL_MS;
const REDUCED_COVER_MS = 120;
const REDUCED_REVEAL_MS = 180;
/** El shader y la copia WebGL→2D no ganan detalle por encima de 60 entregas por segundo. */
const FRAME_INTERVAL_MS = 1000 / 60;
/* Recorrido de la escena para repartirla en piezas. Un elemento que ocupa más que `SHARD_MAX_AREA`
   todavía es un contenedor y se abre; uno por debajo de `SHARD_MIN_AREA` es un icono suelto que no
   aporta nada al colapso. El tope de piezas y de profundidad mantiene acotado el número de capas
   que el compositor tiene que rasterizar. */
const SHARD_MAX_AREA = 0.22;
const SHARD_MIN_AREA = 0.0006;
const SHARD_MAX_DEPTH = 7;
const SHARD_LIMIT = 56;
const DESTINY_BODY_CLASSES = [
  "destiny-rewrite-active",
  "destiny-rewrite-absorbing",
  "destiny-rewrite-covered",
  "destiny-rewrite-revealing",
] as const;

function clearDestinyTransitionBodyClasses(): void {
  document.body.classList.remove(...DESTINY_BODY_CLASSES);
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Shard = { element: HTMLElement; rect: DOMRect; previousWillChange: string };

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
    if (share >= SHARD_MIN_AREA) {
      shards.push({ element, rect, previousWillChange: element.style.willChange });
    }
  };

  for (const child of Array.from(root.children)) {
    if (child instanceof HTMLElement) visit(child, 1);
  }
  return shards;
}

export function DestinyRewriteTransition({ transitionId, kind, seed, opensVision = kind === "rewrite", onCovered, onComplete }: Props) {
  const t = useTranslation();
  const playSfx = useAudioStore((state) => state.playSfx);
  const [phase, setPhase] = useState<DestinyTransitionPhase>("absorbing");
  const phaseRef = useRef<DestinyTransitionPhase>(phase);
  phaseRef.current = phase;
  // Sin WebGL o con movimiento reducido queda una silueta quieta en vez de un hueco vacío.
  const [still, setStill] = useState(false);
  const futureCode = futureCodeFromSeed(seed);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startSoundPlayedRef = useRef(false);
  const coverCommittedRef = useRef(false);
  const releaseCommittedRef = useRef(false);
  const revealSoundPlayedRef = useRef(false);
  const completeCommittedRef = useRef(false);
  // El cambio de Futuro puede re-renderizar App (por ejemplo, 0 -> 3 turnos al salir del
  // tutorial). Igual que la obertura, el reloj conserva una sola ejecución y toma siempre los
  // callbacks y el audio más recientes desde refs.
  const coveredCallbackRef = useRef(onCovered);
  const completeCallbackRef = useRef(onComplete);
  const playSfxRef = useRef(playSfx);
  coveredCallbackRef.current = onCovered;
  completeCallbackRef.current = onComplete;
  playSfxRef.current = playSfx;

  const releaseTransition = () => {
    if (releaseCommittedRef.current) return;
    releaseCommittedRef.current = true;
    document.body.classList.remove("destiny-rewrite-covered");
    document.body.classList.add("destiny-rewrite-revealing");
    setPhase((current) => nextDestinyTransitionPhase(current, "release"));
  };

  useEffect(() => {
    const reducedMotion = prefersReducedMotion();
    const coverMs = reducedMotion ? REDUCED_COVER_MS : COVER_MS;

    document.body.classList.add("destiny-rewrite-active", "destiny-rewrite-absorbing");
    // StrictMode vuelve a ejecutar los efectos de montaje. El sonido y los commits pertenecen
    // a la transición, no a cada ejecución del efecto.
    if (!startSoundPlayedRef.current) {
      startSoundPlayedRef.current = true;
      playSfxRef.current("activateEffect", { rate: 0.72 });
    }

    const coverTimer = window.setTimeout(() => {
      if (coverCommittedRef.current) return;
      coverCommittedRef.current = true;
      document.body.classList.remove("destiny-rewrite-absorbing");
      document.body.classList.add("destiny-rewrite-covered");
      setPhase((current) => nextDestinyTransitionPhase(current, "cover"));
      // El horizonte se cierra sobre la escena: ese golpe es el clímax y no puede ser mudo.
      playSfxRef.current("stoneCrash", { rate: 0.62 });
      try {
        coveredCallbackRef.current(transitionId, releaseTransition);
      } catch {
        // La escena nunca puede quedar atrapada por un callback de integración defectuoso.
        releaseTransition();
      }
    }, coverMs);

    return () => {
      window.clearTimeout(coverTimer);
      clearDestinyTransitionBodyClasses();
    };
  }, [transitionId]);

  useEffect(() => {
    if (phase !== "revealing") return;
    const reducedMotion = prefersReducedMotion();
    const revealMs = reducedMotion ? REDUCED_REVEAL_MS : REVEAL_MS;
    // El futuro nuevo llega después del release explícito, no mientras el guardado está en hold.
    const revealTimer = window.setTimeout(() => {
      if (revealSoundPlayedRef.current) return;
      revealSoundPlayedRef.current = true;
      playSfxRef.current("drawOne", { rate: 0.78 });
    }, reducedMotion ? 80 : 260);
    const completeTimer = window.setTimeout(() => {
      if (completeCommittedRef.current) return;
      completeCommittedRef.current = true;
      setPhase((current) => nextDestinyTransitionPhase(current, "complete"));
      // `onComplete` desmonta este overlay. Quitar las clases antes evita que el siguiente paint
      // vea el tablero todavía bajo la animación mientras el cleanup pasivo espera su turno.
      clearDestinyTransitionBodyClasses();
      completeCallbackRef.current(transitionId);
    }, revealMs);
    return () => {
      window.clearTimeout(revealTimer);
      window.clearTimeout(completeTimer);
    };
  }, [phase, transitionId]);

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
      for (const { element, previousWillChange } of shards) {
        element.style.willChange = previousWillChange;
      }
    };
  }, [phase]);

  // El agujero negro es un único plano a pantalla completa dibujado por el renderer compartido.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) {
      setStill(true);
      return;
    }

    let pixelRatio = boundedVfxPixelRatio(
      window.innerWidth,
      window.innerHeight,
      window.devicePixelRatio || 1,
    );
    const uniforms = {
      uRes: { value: new THREE.Vector2(1, 1) },
      uPixelRatio: { value: pixelRatio },
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uSeed: { value: futureVisualSignature(seed) },
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
      pixelRatio = boundedVfxPixelRatio(width, height, window.devicePixelRatio || 1);
      uniforms.uRes.value.set(width, height);
      uniforms.uPixelRatio.value = pixelRatio;
      uniforms.uCenter.value.set(width / 2, height / 2);
      uniforms.uRadius.value = Math.min(width, height) * DESTINY_HORIZON_RATIO;
    };
    resize();
    window.addEventListener("resize", resize);

    let previous = performance.now();
    let activeElapsed = 0;
    let spin = 0;
    let frame = 0;
    let firstFramePresented = false;
    let failedFrames = 0;
    let lastRenderedAt = Number.NEGATIVE_INFINITY;
    const tick = (now: number) => {
      const deltaMs = Math.max(0, now - previous);
      previous = now;
      if (phaseRef.current !== "covered") activeElapsed += deltaMs;
      if (now - lastRenderedAt < FRAME_INTERVAL_MS && activeElapsed <= COMPLETE_MS) {
        frame = requestAnimationFrame(tick);
        return;
      }
      const sinceLastRender = now - lastRenderedAt;
      lastRenderedAt = Number.isFinite(sinceLastRender)
        ? now - (sinceLastRender % FRAME_INTERVAL_MS)
        : now;
      // El giro se acumula por delta time: acelera al colapsar sin saltar cuando cambia el ritmo.
      const deltaSeconds = phaseRef.current === "covered" ? 0 : Math.min(deltaMs / 1000, 0.05);
      const collapse = Math.min(activeElapsed / COVER_MS, 1);
      const burst = Math.max(0, Math.min((activeElapsed - COVER_MS) / REVEAL_MS, 1));
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
        setStill(false);
        // El lienzo sólo se revela cuando ya tiene una imagen válida del shader.
        canvas.style.opacity = "1";
      }
      if (!drawn && !firstFramePresented) {
        failedFrames += 1;
        // `false` también cubre un canvas sin contexto 2D, no sólo WebGL ausente. Dos intentos
        // evitan mostrar el respaldo por un fallo transitorio del primer fotograma.
        if (failedFrames >= 2 || sharedVfxUnavailable()) setStill(true);
      }
      if (activeElapsed <= COMPLETE_MS || phaseRef.current === "covered") frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      canvas.style.opacity = "0";
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      canvas.width = 1;
      canvas.height = 1;
      geometry.dispose();
      material.dispose();
    };
  }, [seed]);

  return (
    <div
      className={`destiny-vortex-overlay is-${phase}`}
      role="status"
      aria-live="assertive"
      aria-label={t(kind === "rewrite"
        ? "destiny.transitionContemplateAgain"
        : opensVision
          ? "destiny.transitionContemplateFuture"
          : "destiny.seekingAnotherFuture", { code: futureCode })}
    >
      <div className="destiny-vortex-veil" />
      <canvas ref={canvasRef} className="destiny-vortex-canvas" aria-hidden="true" />
      {still && <div className="destiny-vortex-still" aria-hidden="true" />}
      <div className="destiny-vortex-caption">
        <small>{t("destiny.future", { code: futureCode })}</small>
        <strong>{t(kind === "rewrite"
          ? "destiny.openingAnotherVision"
          : opensVision
            ? "destiny.openingVision"
            : "destiny.seekingAnotherFuture")}</strong>
      </div>
    </div>
  );
}

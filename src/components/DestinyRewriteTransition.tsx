import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useTranslation } from "../i18n/useTranslation";
import { useAudioStore } from "../store/useAudioStore";
import { futureCodeFromSeed } from "../utils/futureIdentity";
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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
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
      playSfx("drawOne", { rate: 0.78 });
    }, coverMs);
    const completeTimer = window.setTimeout(onComplete, completeMs);

    return () => {
      window.clearTimeout(coverTimer);
      window.clearTimeout(completeTimer);
      document.body.classList.remove("destiny-rewrite-active", "destiny-rewrite-absorbing", "destiny-rewrite-revealing");
    };
  }, [onComplete, onCovered, playSfx]);

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

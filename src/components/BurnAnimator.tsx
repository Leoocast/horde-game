import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import * as THREE from "three";
import { useGameStore, type BurnAnimationState } from "../store/useGameStore";
import { burnPathCurvature } from "../store/burnAnimation";
import { ClassicBurnAnimator } from "./ClassicBurnAnimator";
import { burnProjectileOriginRatios, BURN_DURATION_MS } from "./burnPresentation";
import {
  BURN_FIREBALL_FRAGMENT_SHADER,
  BURN_FIREBALL_VERTEX_SHADER,
  BURN_MAX_ROUTES,
  burnImpactRoutes,
  burnMaterialColors,
  burnRenderBatches,
} from "./burnFireball";

type BurnGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

/** El lienzo cubre la pantalla, así que se limita la resolución antes que el número de rutas. */
const MAX_PIXEL_RATIO = 1.35;

export function BurnAnimator() {
  const burn = useGameStore((state) => state.burnAnimation);
  const classicBurn = burn?.renderer === "classic" ? burn : undefined;
  return (
    <>
      <ProceduralBurnAnimator burn={classicBurn ? undefined : burn} />
      {classicBurn && <ClassicBurnAnimator burn={classicBurn} />}
    </>
  );
}

function ProceduralBurnAnimator({ burn }: { burn: BurnAnimationState | undefined }) {
  const [geometries, setGeometries] = useState<BurnGeometry[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);

  useLayoutEffect(() => {
    // React puede mostrar el portal antes de que el siguiente requestAnimationFrame pinte el
    // shader. Mantener oculto el buffer WebGL evita exponer su rectángulo de limpieza entre beats.
    if (canvasRef.current) canvasRef.current.style.opacity = "0";
    if (!burn) {
      setGeometries([]);
      return;
    }
    const source = burn.sourceId
      ? document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.sourceId}"]`)
      : undefined;
    const sourceRect = source?.getBoundingClientRect();
    const fallbackStartX = sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth * 0.5;
    const fallbackStartY = sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight * 0.28;
    const targets = burn.targets?.length
      ? burn.targets
      : [{ targetId: burn.targetId, targetKind: burn.targetKind ?? "card" }];
    const targetEndpoints = targets.flatMap((target): Array<Pick<BurnGeometry, "endX" | "endY">> => {
      const targetElement = target.targetKind === "playerLife"
        ? document.querySelector<HTMLElement>('[data-player-life-panel="true"]')
        : target.targetKind === "hostLife"
          ? document.querySelector<HTMLElement>('[data-host-life-emblem="true"]')
          : target.targetId
            ? document.querySelector<HTMLElement>(`[data-card-slot-id="${target.targetId}"]`)
            : undefined;
      if (!targetElement) return [];
      const targetRect = targetElement.getBoundingClientRect();
      return [{
        endX: targetRect.left + targetRect.width / 2,
        endY: targetRect.top + targetRect.height / 2,
      }];
    });
    if (burn.targets?.length) {
      setGeometries(targetEndpoints.map((endpoint) => ({
        startX: fallbackStartX,
        startY: fallbackStartY,
        ...endpoint,
      })));
      return;
    }

    const endpoint = targetEndpoints[0];
    if (!endpoint) {
      setGeometries([]);
      return;
    }
    const projectileCount = Math.max(1, Math.min(BURN_MAX_ROUTES, burn.projectileCount ?? 1));
    const originRatios = burnProjectileOriginRatios(
      projectileCount,
      burn.projectileOrigin ?? "center",
    );
    setGeometries(originRatios.map((origin) => ({
      startX: sourceRect ? sourceRect.left + sourceRect.width * origin.x : fallbackStartX,
      startY: sourceRect ? sourceRect.top + sourceRect.height * origin.y : fallbackStartY,
      ...endpoint,
    })));
  }, [burn]);

  const projectileGapMs = Math.max(0, burn?.projectileGapMs ?? 90);
  const impacts = burnImpactRoutes(
    geometries.length,
    Boolean(burn?.targets?.length),
    projectileGapMs,
  );

  // Toda la presentación vive en un canvas y un contexto. Una descarga grande puede requerir
  // varias pasadas de seis rutas; ninguna ruta de reglas se descarta por ese límite del GLSL.
  useEffect(() => {
    if (!burn || geometries.length === 0) {
      if (canvasRef.current) canvasRef.current.style.opacity = "0";
      rendererRef.current?.clear();
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer = rendererRef.current;
    if (!renderer) {
      try {
        renderer = new THREE.WebGLRenderer({
          canvas,
          alpha: true,
          antialias: false,
          premultipliedAlpha: true,
        });
      } catch {
        return;
      }
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(Math.max(1, window.innerWidth), Math.max(1, window.innerHeight), false);
      renderer.clear();
      rendererRef.current = renderer;
    }
    const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    renderer.setPixelRatio(pixelRatio);

    const colors = burnMaterialColors(burn.variant);
    const scale = Math.max(0.5, Math.min(3, burn.scale ?? 1));
    const emptySlots = () => Array.from({ length: BURN_MAX_ROUTES }, () => new THREE.Vector2());
    const batches = burnRenderBatches(geometries.length, impacts);
    const scene = new THREE.Scene();
    const planeGeometry = new THREE.PlaneGeometry(2, 2);
    const passes = batches.map((batch, batchIndex) => {
      const uniforms = {
        uRes: { value: new THREE.Vector2(1, 1) },
        uPixelRatio: { value: pixelRatio },
        uTime: { value: 0 },
        uT: { value: 0 },
        uCount: { value: batch.routeIndexes.length },
        uStart: { value: emptySlots() },
        uEnd: { value: emptySlots() },
        uDelay: { value: new Array(BURN_MAX_ROUTES).fill(0) },
        uImpactCount: { value: batch.impacts.length },
        uImpactPos: { value: emptySlots() },
        uImpactDelay: { value: new Array(BURN_MAX_ROUTES).fill(0) },
        uScale: { value: scale },
        uCurve: { value: burnPathCurvature(burn.trajectory) },
        uCore: { value: new THREE.Vector3(...colors.core) },
        uHot: { value: new THREE.Vector3(...colors.hot) },
        uMid: { value: new THREE.Vector3(...colors.mid) },
        uDeep: { value: new THREE.Vector3(...colors.deep) },
        uSmoke: { value: new THREE.Vector3(...colors.smoke) },
        uInk: { value: colors.ink },
      };

      batch.routeIndexes.forEach((routeIndex, localIndex) => {
        const route = geometries[routeIndex];
        uniforms.uStart.value[localIndex].set(route.startX, route.startY);
        uniforms.uEnd.value[localIndex].set(route.endX, route.endY);
        uniforms.uDelay.value[localIndex] = (routeIndex * projectileGapMs) / BURN_DURATION_MS;
      });
      batch.impacts.forEach((impact, localImpactIndex) => {
        const routeIndex = batch.routeIndexes[impact.routeIndex];
        const route = geometries[routeIndex];
        uniforms.uImpactPos.value[localImpactIndex].set(route.endX, route.endY);
        uniforms.uImpactDelay.value[localImpactIndex] = impact.delayMs / BURN_DURATION_MS;
      });

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: BURN_FIREBALL_VERTEX_SHADER,
        fragmentShader: BURN_FIREBALL_FRAGMENT_SHADER,
        transparent: true,
        premultipliedAlpha: true,
        depthTest: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(planeGeometry, material);
      mesh.renderOrder = batchIndex;
      scene.add(mesh);
      return { material, uniforms };
    });
    const camera = new THREE.Camera();

    const resize = () => {
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      for (const pass of passes) pass.uniforms.uRes.value.set(width, height);
      renderer.setSize(width, height, false);
    };
    resize();
    window.addEventListener("resize", resize);
    const shakeAnimation = canvasRef.current?.animate(
      [
        { transform: "translate(0, 0) rotate(0)", offset: 0 },
        { transform: "translate(0, 0) rotate(0)", offset: 0.5799 },
        { transform: "translate(-14px, 8px) rotate(-0.8deg)", offset: 0.58 },
        { transform: "translate(13px, -8px) rotate(0.72deg)", offset: 0.59 },
        { transform: "translate(-9px, -5px) rotate(-0.45deg)", offset: 0.6 },
        { transform: "translate(7px, 4px) rotate(0.32deg)", offset: 0.61 },
        { transform: "translate(-4px, 2px) rotate(-0.16deg)", offset: 0.63 },
        { transform: "translate(0, 0) rotate(0)", offset: 0.68 },
        { transform: "translate(0, 0) rotate(0)", offset: 1 },
      ],
      { duration: BURN_DURATION_MS, easing: "linear" },
    );

    // El reloj se extiende con el retraso del último impacto, igual que las animaciones CSS
    // encadenadas que reemplaza; el store sigue siendo quien desmonta el efecto.
    const lastImpactDelayMs = impacts.reduce((longest, impact) => Math.max(longest, impact.delayMs), 0);
    const lastRouteDelayMs = Math.max(0, geometries.length - 1) * projectileGapMs;
    const lastDelayMs = Math.max(lastImpactDelayMs, lastRouteDelayMs);
    const totalMs = BURN_DURATION_MS + lastDelayMs;
    const start = performance.now();
    let frame = 0;
    let firstFramePresented = false;
    const tick = (now: number) => {
      const elapsed = now - start;
      for (const pass of passes) {
        pass.uniforms.uTime.value = now / 1000;
        pass.uniforms.uT.value = elapsed / BURN_DURATION_MS;
      }
      renderer.render(scene, camera);
      if (!firstFramePresented) {
        firstFramePresented = true;
        // El canvas sólo se revela después de tener una imagen procedural válida.
        canvas.style.opacity = "1";
      }
      if (elapsed <= totalMs) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      canvas.style.opacity = "0";
      cancelAnimationFrame(frame);
      shakeAnimation?.cancel();
      window.removeEventListener("resize", resize);
      renderer.clear();
      planeGeometry.dispose();
      for (const pass of passes) pass.material.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [burn, geometries]);

  // El contexto nace sólo al reproducir el primer Burn, se reutiliza entre atacantes apilados y
  // se libera al desmontar el campo. Nunca se fuerza su pérdida entre beats.
  useEffect(() => () => {
    rendererRef.current?.dispose();
    rendererRef.current = null;
  }, []);

  const active = Boolean(burn && geometries.length > 0);
  const finalProjectileDelay = Math.max(0, geometries.length - 1) * projectileGapMs;
  const style = active
    ? ({
        "--burn-start-x": `${geometries[0].startX}px`,
        "--burn-start-y": `${geometries[0].startY}px`,
      } as CSSProperties)
    : ({ display: "none" } as CSSProperties);
  const impactStyle = (geometry: BurnGeometry): CSSProperties => ({
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
  } as CSSProperties);
  const finalImpact = impacts[impacts.length - 1];
  const finalImpactGeometry = finalImpact
    ? geometries[finalImpact.routeIndex]
    : geometries[geometries.length - 1];
  const impactAnimationStyle = finalImpactGeometry
    ? ({
        ...impactStyle(finalImpactGeometry),
        animationDelay: `${finalProjectileDelay}ms`,
      } as CSSProperties)
    : undefined;

  return createPortal(
    <div
      className={[
        "burn-animation-layer",
        burn?.variant === "oil" ? "burn-animation-layer-oil" : "",
        burn?.variant === "emerald" ? "burn-animation-layer-emerald" : "",
        burn?.variant === "golden" ? "burn-animation-layer-golden" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="burn-canvas" />

      {active && burn && (
        <Fragment key={burn.id}>
          <div className="burn-screen-flash" style={impactAnimationStyle} />
          {impacts.map((impact, impactIndex) => {
            const geometry = geometries[impact.routeIndex];
            if (!geometry) return null;
            return (
              <span
                key={impactIndex}
                className="burn-damage-number"
                style={{ ...impactStyle(geometry), animationDelay: `${640 + impact.delayMs}ms` }}
              >
                {burn.impactLabel ?? `-${burn.amount}`}
              </span>
            );
          })}
        </Fragment>
      )}
    </div>,
    document.body,
  );
}

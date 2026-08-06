import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import type { BurnAnimationState } from "../store/useGameStore";
import {
  burnProjectileOriginRatios,
  burnProjectileParticleTimings,
} from "./burnPresentation";

type BurnGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

const EMBER_COUNT = 32;
const CHARGE_PARTICLES = [
  { a: 12, r: 42, s: 3 },
  { a: 86, r: 33, s: 3 },
  { a: 155, r: 45, s: 5 },
  { a: 228, r: 36, s: 3 },
  { a: 307, r: 40, s: 4 },
];
const TRAIL_RIBBONS = [
  { w: 84, h: 18, y: 0, r: 0, blur: 6, o: 0.9 },
  { w: 68, h: 10, y: -10, r: -7, blur: 4, o: 0.9 },
  { w: 62, h: 9, y: 10, r: 8, blur: 4, o: 0.86 },
];
const TRAIL_STREAKS = [
  { w: 94, h: 3, y: -4, r: -1, blur: 2, o: 0.92 },
  { w: 78, h: 2, y: 7, r: 2, blur: 1.6, o: 0.96 },
];
const IMPACT_SMOKE = [
  { x: -82, y: -20, s: 0.8, drift: -26, s2: 1.08, s3: 1.376, drift2: -39 },
  { x: -44, y: -58, s: 1, drift: -14, s2: 1.35, s3: 1.72, drift2: -21 },
  { x: 0, y: -74, s: 1.15, drift: 8, s2: 1.552, s3: 1.978, drift2: 12 },
  { x: 46, y: -52, s: 0.96, drift: 18, s2: 1.296, s3: 1.651, drift2: 27 },
  { x: 84, y: -16, s: 0.78, drift: 28, s2: 1.053, s3: 1.342, drift2: 42 },
  { x: -18, y: -28, s: 0.72, drift: -4, s2: 0.972, s3: 1.238, drift2: -6 },
];

/** The former DOM/CSS fireball, retained only by registered presentation exceptions. */
export function ClassicBurnAnimator({ burn }: { burn: BurnAnimationState }) {
  const [geometries, setGeometries] = useState<BurnGeometry[]>([]);
  const fireballBodyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const traceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const source = burn.sourceId
      ? document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.sourceId}"]`)
      : undefined;
    const sourceRect = source?.getBoundingClientRect();
    const fallbackStartX = sourceRect
      ? sourceRect.left + sourceRect.width / 2
      : window.innerWidth * 0.5;
    const fallbackStartY = sourceRect
      ? sourceRect.top + sourceRect.height / 2
      : window.innerHeight * 0.28;
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
    const projectileCount = Math.max(1, Math.min(6, burn.projectileCount ?? 1));
    setGeometries(burnProjectileOriginRatios(
      projectileCount,
      burn.projectileOrigin ?? "center",
    ).map((origin) => ({
      startX: sourceRect ? sourceRect.left + sourceRect.width * origin.x : fallbackStartX,
      startY: sourceRect ? sourceRect.top + sourceRect.height * origin.y : fallbackStartY,
      ...endpoint,
    })));
  }, [burn]);

  useEffect(() => {
    if (geometries.length === 0) return;
    const trace = traceRef.current;
    if (!trace) return;

    let frame = 0;
    let cancelled = false;
    let lastSpawn = 0;
    const start = performance.now();
    const visualScale = Math.max(0.5, Math.min(3, burn.scale ?? 1));
    const projectileGapMs = Math.max(0, burn.projectileGapMs ?? 90);
    const particleTimings = burnProjectileParticleTimings(geometries.length, projectileGapMs);
    const embersSpawned = particleTimings.map(() => false);
    const routeVectors = geometries.map((geometry) => {
      const travelLength = Math.hypot(
        geometry.endX - geometry.startX,
        geometry.endY - geometry.startY,
      ) || 1;
      const backX = -(geometry.endX - geometry.startX) / travelLength;
      const backY = -(geometry.endY - geometry.startY) / travelLength;
      return { backX, backY, perpX: -backY, perpY: backX };
    });

    const spawnParticle = (
      x: number,
      y: number,
      size: number,
      life: number,
      dx: number,
      dy: number,
    ) => {
      const particle = document.createElement("i");
      particle.className = "burn-trace-particle";
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--life", `${life}ms`);
      particle.style.setProperty("--dx", `${dx}px`);
      particle.style.setProperty("--dy", `${dy}px`);
      trace.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    };

    const spawnTrace = (projectileIndex: number) => {
      const fireballBody = fireballBodyRefs.current[projectileIndex];
      if (!fireballBody) return;
      const { backX, backY, perpX, perpY } = routeVectors[projectileIndex];
      const rect = fireballBody.getBoundingClientRect();
      const size = (2 + Math.random() * 4) * visualScale;
      const magnitude = (24 + Math.random() * 68) * visualScale;
      const spread = (Math.random() - 0.5) * 42 * visualScale;
      spawnParticle(
        rect.left + rect.width * (0.35 + Math.random() * 0.3),
        rect.top + rect.height * (0.3 + Math.random() * 0.4),
        size,
        260 + Math.random() * 480,
        backX * magnitude + perpX * spread,
        backY * magnitude + perpY * spread,
      );
    };

    const spawnEmbers = (geometry: BurnGeometry) => {
      for (let index = 0; index < EMBER_COUNT; index += 1) {
        const angle = Math.random() * Math.PI * 2;
        const distance = (40 + Math.random() * 220) * visualScale;
        spawnParticle(
          geometry.endX,
          geometry.endY,
          (2.5 + Math.random() * 6) * visualScale,
          420 + Math.random() * 560,
          Math.cos(angle) * distance,
          Math.sin(angle) * distance,
        );
      }
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const activeRoutes: number[] = [];
      for (const timing of particleTimings) {
        if (elapsed >= timing.impactMs - 30) {
          if (!embersSpawned[timing.projectileIndex]) {
            embersSpawned[timing.projectileIndex] = true;
            spawnEmbers(geometries[timing.projectileIndex]);
          }
        } else if (elapsed >= timing.flightStartMs) {
          activeRoutes.push(timing.projectileIndex);
        }
      }
      if (embersSpawned.every(Boolean)) return;
      if (activeRoutes.length > 0 && now - lastSpawn > 8) {
        for (const routeIndex of activeRoutes) {
          const bursts = 2 + Math.floor(Math.random() * 2);
          for (let index = 0; index < bursts; index += 1) spawnTrace(routeIndex);
        }
        lastSpawn = now;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      trace.replaceChildren();
    };
  }, [burn, geometries]);

  if (geometries.length === 0) return null;
  const firstGeometry = geometries[0];
  const projectileGapMs = Math.max(0, burn.projectileGapMs ?? 90);
  const finalProjectileDelay = (geometries.length - 1) * projectileGapMs;
  const style = {
    "--burn-start-x": `${firstGeometry.startX}px`,
    "--burn-start-y": `${firstGeometry.startY}px`,
    "--burn-vfx-scale": `${Math.max(0.5, Math.min(3, burn.scale ?? 1))}`,
  } as CSSProperties;
  const projectileStyle = (geometry: BurnGeometry, delay: number): CSSProperties => ({
    "--burn-start-x": `${geometry.startX}px`,
    "--burn-start-y": `${geometry.startY}px`,
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
    "--burn-dx": `${geometry.endX - geometry.startX}px`,
    "--burn-dy": `${geometry.endY - geometry.startY}px`,
    "--burn-angle": `${Math.atan2(
      geometry.endY - geometry.startY,
      geometry.endX - geometry.startX,
    ) * 180 / Math.PI}deg`,
    animationDelay: `${delay}ms`,
  } as CSSProperties);
  const impactStyle = (geometry: BurnGeometry): CSSProperties => ({
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
  } as CSSProperties);
  const impacts = burn.targets?.length
    ? geometries.map((geometry, index) => ({ geometry, delay: index * projectileGapMs }))
    : [{ geometry: geometries[geometries.length - 1], delay: finalProjectileDelay }];
  const chargeGeometries = burn.projectileOrigin === "split-horizontal"
    ? geometries
    : [firstGeometry];

  return createPortal(
    <div
      key={burn.id}
      className="burn-animation-layer burn-animation-layer-classic"
      style={style}
      aria-hidden="true"
    >
      <div className="burn-world">
        {chargeGeometries.map((geometry, chargeIndex) => (
          <div key={chargeIndex} className="burn-charge" style={{
            "--burn-start-x": `${geometry.startX}px`,
            "--burn-start-y": `${geometry.startY}px`,
          } as CSSProperties}>
            <div className="burn-charge-visual">
              <span className="burn-charge-glow" />
              <span className="burn-charge-distortion" />
              <span className="burn-charge-arc" />
              {CHARGE_PARTICLES.map((particle, index) => (
                <i key={index} className="burn-charge-particle" style={{
                  "--a": `${particle.a}deg`,
                  "--r": `${particle.r}px`,
                  "--s": `${particle.s}px`,
                } as CSSProperties} />
              ))}
            </div>
          </div>
        ))}
        <div ref={traceRef} className="burn-trace-layer" />
        {geometries.map((geometry, projectileIndex) => {
          const delay = projectileIndex * projectileGapMs;
          return (
            <div key={projectileIndex} className="burn-fireball" style={projectileStyle(geometry, delay)}>
              <div className="burn-projectile-visual">
                <div className="burn-trail">
                  {TRAIL_RIBBONS.map((trail, index) => (
                    <i key={index} className="burn-trail-ribbon" style={{
                      "--w": `${trail.w}px`,
                      "--h": `${trail.h}px`,
                      "--y": `${trail.y}px`,
                      "--r": `${trail.r}deg`,
                      "--blur": `${trail.blur}px`,
                      "--o": `${trail.o}`,
                      animationDelay: `${delay}ms`,
                    } as CSSProperties} />
                  ))}
                  {TRAIL_STREAKS.map((trail, index) => (
                    <i key={index} className="burn-trail-streak" style={{
                      "--w": `${trail.w}px`,
                      "--h": `${trail.h}px`,
                      "--y": `${trail.y}px`,
                      "--r": `${trail.r}deg`,
                      "--blur": `${trail.blur}px`,
                      "--o": `${trail.o}`,
                      animationDelay: `${delay}ms`,
                    } as CSSProperties} />
                  ))}
                </div>
                <div ref={(element) => {
                  fireballBodyRefs.current[projectileIndex] = element;
                }} className="burn-fireball-body">
                  <div className="burn-ball-outer" />
                  <div className="burn-ball-mid" />
                  <div className="burn-ball-core" />
                  <div className="burn-ball-hotspot" />
                </div>
              </div>
            </div>
          );
        })}
        {impacts.map(({ geometry, delay }, impactIndex) => (
          <div key={impactIndex} className="burn-impact" style={impactStyle(geometry)}>
            <div className="burn-impact-visual">
              <div className="burn-void-disc" style={{ animationDelay: `${delay}ms` }} />
              <div className="burn-impact-core" style={{ animationDelay: `${delay}ms` }} />
              <div className="burn-shock-ring one" style={{
                "--size": "112px",
                "--border-size": "7px",
                "--ring-blur": "1px",
                animationDelay: `${delay}ms`,
              } as CSSProperties} />
              <div className="burn-shock-ring two" style={{
                "--size": "92px",
                "--border-size": "3px",
                "--ring-blur": "2px",
                animationDelay: `${delay}ms`,
              } as CSSProperties} />
              {IMPACT_SMOKE.map((puff, index) => (
                <i key={index} className="burn-impact-smoke" style={{
                  "--x": `${puff.x}px`,
                  "--y": `${puff.y}px`,
                  "--s": `${puff.s}`,
                  "--drift": `${puff.drift}px`,
                  "--s2": `${puff.s2}`,
                  "--s3": `${puff.s3}`,
                  "--drift2": `${puff.drift2}px`,
                  animationDelay: `${delay}ms`,
                } as CSSProperties} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="burn-screen-flash" style={{
        ...impactStyle(impacts[impacts.length - 1].geometry),
        animationDelay: `${finalProjectileDelay}ms`,
      }} />
      {impacts.map(({ geometry, delay }, impactIndex) => (
        <span key={impactIndex} className="burn-damage-number" style={{
          ...impactStyle(geometry),
          animationDelay: `${640 + delay}ms`,
        }}>
          {burn.impactLabel ?? `-${burn.amount}`}
        </span>
      ))}
    </div>,
    document.body,
  );
}

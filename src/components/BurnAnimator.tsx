import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../store/useGameStore";
import { burnProjectileOriginRatios, burnProjectileParticleTimings } from "./burnPresentation";

type BurnGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

// Master clock mirrors the CSS --burn-duration (1100ms). Flight runs 20%–58%, impact at 58%.
const EMBER_COUNT = 32;

// Ported verbatim from the reference (assets/examples/Fireball/fireball.html).
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
  { x: -44, y: -58, s: 1.0, drift: -14, s2: 1.35, s3: 1.72, drift2: -21 },
  { x: 0, y: -74, s: 1.15, drift: 8, s2: 1.552, s3: 1.978, drift2: 12 },
  { x: 46, y: -52, s: 0.96, drift: 18, s2: 1.296, s3: 1.651, drift2: 27 },
  { x: 84, y: -16, s: 0.78, drift: 28, s2: 1.053, s3: 1.342, drift2: 42 },
  { x: -18, y: -28, s: 0.72, drift: -4, s2: 0.972, s3: 1.238, drift2: -6 },
];

export function BurnAnimator() {
  const burn = useGameStore((state) => state.burnAnimation);
  const [geometries, setGeometries] = useState<BurnGeometry[]>([]);
  const fireballBodyRefs = useRef<Array<HTMLDivElement | null>>([]);
  const traceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
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
    const projectileCount = Math.max(1, Math.min(6, burn.projectileCount ?? 1));
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

  // Every route sheds trace sparks from its live fireball body and bursts its own ember ring at
  // its target, including simultaneous multi-target volleys.
  useEffect(() => {
    if (!burn || geometries.length === 0) return;
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

    // Sparks fly opposite each ball's heading with lateral spread, so every route streams from
    // its own tail regardless of travel angle.
    const routeVectors = geometries.map((geometry) => {
      const travelLen = Math.hypot(geometry.endX - geometry.startX, geometry.endY - geometry.startY) || 1;
      const backX = -(geometry.endX - geometry.startX) / travelLen;
      const backY = -(geometry.endY - geometry.startY) / travelLen;
      return { backX, backY, perpX: -backY, perpY: backX };
    });

    const spawnTrace = (projectileIndex: number) => {
      const fireballBody = fireballBodyRefs.current[projectileIndex];
      if (!fireballBody) return;
      const { backX, backY, perpX, perpY } = routeVectors[projectileIndex];
      const rect = fireballBody.getBoundingClientRect();
      const particle = document.createElement("i");
      particle.className = "burn-trace-particle";
      const size = (2 + Math.random() * 4) * visualScale;
      const life = 260 + Math.random() * 480;
      // Anchor sparks to the visible fireball body instead of biasing them toward the right side
      // of the wider projectile/trail box. This stays centered at every flight angle.
      const x = rect.left + rect.width * (0.35 + Math.random() * 0.3);
      const y = rect.top + rect.height * (0.3 + Math.random() * 0.4);
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--life", `${life}ms`);
      const mag = (24 + Math.random() * 68) * visualScale;
      const spread = (Math.random() - 0.5) * 42 * visualScale;
      particle.style.setProperty("--dx", `${backX * mag + perpX * spread}px`);
      particle.style.setProperty("--dy", `${backY * mag + perpY * spread}px`);
      trace.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    };

    const spawnEmber = (geometry: BurnGeometry) => {
      const size = (2.5 + Math.random() * 6) * visualScale;
      const life = 420 + Math.random() * 560;
      const angle = Math.random() * Math.PI * 2;
      // Wide spread so plenty of embers clear the impact core and read against the dark board.
      const dist = (40 + Math.random() * 220) * visualScale;
      const particle = document.createElement("i");
      particle.className = "burn-trace-particle";
      particle.style.left = `${geometry.endX}px`;
      particle.style.top = `${geometry.endY}px`;
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--life", `${life}ms`);
      particle.style.setProperty("--dx", `${Math.cos(angle) * dist}px`);
      particle.style.setProperty("--dy", `${Math.sin(angle) * dist}px`);
      trace.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    };

    const tick = (now: number) => {
      if (cancelled) return;
      const elapsed = now - start;
      const activeTraceIndexes: number[] = [];

      for (const timing of particleTimings) {
        if (elapsed >= timing.impactMs - 30) {
          if (!embersSpawned[timing.projectileIndex]) {
            embersSpawned[timing.projectileIndex] = true;
            const geometry = geometries[timing.projectileIndex];
            for (let i = 0; i < EMBER_COUNT; i++) spawnEmber(geometry);
          }
        } else if (elapsed >= timing.flightStartMs) {
          activeTraceIndexes.push(timing.projectileIndex);
        }
      }

      if (embersSpawned.every(Boolean)) return;

      if (activeTraceIndexes.length > 0 && now - lastSpawn > 8) {
        for (const projectileIndex of activeTraceIndexes) {
          const bursts = 2 + Math.floor(Math.random() * 2);
          for (let i = 0; i < bursts; i++) spawnTrace(projectileIndex);
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

  if (!burn || geometries.length === 0) return null;
  const firstGeometry = geometries[0];
  const projectileGapMs = Math.max(0, burn.projectileGapMs ?? 90);
  const finalProjectileDelay = (geometries.length - 1) * projectileGapMs;
  const impactAnimationStyle = { animationDelay: `${finalProjectileDelay}ms` } as CSSProperties;
  const style = {
    "--burn-start-x": `${firstGeometry.startX}px`,
    "--burn-start-y": `${firstGeometry.startY}px`,
    "--burn-vfx-scale": `${Math.max(0.5, Math.min(3, burn.scale ?? 1))}`,
  } as CSSProperties;
  const projectileStyle = (geometry: BurnGeometry, delay: number): CSSProperties => {
    const dx = geometry.endX - geometry.startX;
    const dy = geometry.endY - geometry.startY;
    return {
      "--burn-start-x": `${geometry.startX}px`,
      "--burn-start-y": `${geometry.startY}px`,
      "--burn-end-x": `${geometry.endX}px`,
      "--burn-end-y": `${geometry.endY}px`,
      "--burn-dx": `${dx}px`,
      "--burn-dy": `${dy}px`,
      "--burn-angle": `${(Math.atan2(dy, dx) * 180) / Math.PI}deg`,
      animationDelay: `${delay}ms`,
    } as CSSProperties;
  };
  const impactStyle = (geometry: BurnGeometry): CSSProperties => ({
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
  } as CSSProperties);
  // A Raid volley repeats one route and lands as one aggregate impact. Chainwhirler supplies
  // explicit targets, so every route owns its own impact and damage number.
  const impacts = burn.targets?.length
    ? geometries.map((geometry, index) => ({ geometry, delay: index * projectileGapMs }))
    : [{ geometry: geometries[geometries.length - 1], delay: finalProjectileDelay }];
  const chargeGeometries = burn.projectileOrigin === "split-horizontal"
    ? geometries
    : [firstGeometry];
  const chargeStyle = (geometry: BurnGeometry): CSSProperties => ({
    "--burn-start-x": `${geometry.startX}px`,
    "--burn-start-y": `${geometry.startY}px`,
  }) as CSSProperties;

  return createPortal(
    <div
      key={burn.id}
      className={[
        "burn-animation-layer",
        burn.variant === "oil" ? "burn-animation-layer-oil" : "",
        burn.variant === "emerald" ? "burn-animation-layer-emerald" : "",
        burn.variant === "golden" ? "burn-animation-layer-golden" : "",
      ].filter(Boolean).join(" ")}
      style={style}
      aria-hidden="true"
    >
      <div className="burn-world">
        {/* Split casters charge once at each source hand; centered casts retain one charge. */}
        {chargeGeometries.map((geometry, chargeIndex) => (
          <div key={chargeIndex} className="burn-charge" style={chargeStyle(geometry)}>
            <div className="burn-charge-visual">
              <span className="burn-charge-glow" />
              <span className="burn-charge-distortion" />
              <span className="burn-charge-arc" />
              {CHARGE_PARTICLES.map((particle, index) => (
                <i
                  key={index}
                  className="burn-charge-particle"
                  style={{ "--a": `${particle.a}deg`, "--r": `${particle.r}px`, "--s": `${particle.s}px` } as CSSProperties}
                />
              ))}
            </div>
          </div>
        ))}

        <div ref={traceRef} className="burn-trace-layer" />

        {/* Every projectile owns its route and particles. Repeated routes may still share one
            aggregate rules impact at their common destination. */}
        {geometries.map((geometry, projectileIndex) => {
          const projectileDelay = projectileIndex * projectileGapMs;
          return (
          <div
            key={projectileIndex}
            className="burn-fireball"
            style={projectileStyle(geometry, projectileDelay)}
          >
            <div className="burn-projectile-visual">
              <div className="burn-trail">
                {TRAIL_RIBBONS.map((t, index) => (
                  <i
                    key={index}
                    className="burn-trail-ribbon"
                    style={{ "--w": `${t.w}px`, "--h": `${t.h}px`, "--y": `${t.y}px`, "--r": `${t.r}deg`, "--blur": `${t.blur}px`, "--o": `${t.o}`, animationDelay: `${projectileDelay}ms` } as CSSProperties}
                  />
                ))}
                {TRAIL_STREAKS.map((t, index) => (
                  <i
                    key={index}
                    className="burn-trail-streak"
                    style={{ "--w": `${t.w}px`, "--h": `${t.h}px`, "--y": `${t.y}px`, "--r": `${t.r}deg`, "--blur": `${t.blur}px`, "--o": `${t.o}`, animationDelay: `${projectileDelay}ms` } as CSSProperties}
                  />
                ))}
              </div>
              <div
                ref={(element) => {
                  fireballBodyRefs.current[projectileIndex] = element;
                }}
                className="burn-fireball-body"
              >
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
              <div className="burn-shock-ring one" style={{ "--size": "112px", "--border-size": "7px", "--ring-blur": "1px", animationDelay: `${delay}ms` } as CSSProperties} />
              <div className="burn-shock-ring two" style={{ "--size": "92px", "--border-size": "3px", "--ring-blur": "2px", animationDelay: `${delay}ms` } as CSSProperties} />
              {IMPACT_SMOKE.map((puff, index) => (
                <i
                  key={index}
                  className="burn-impact-smoke"
                  style={{
                    "--x": `${puff.x}px`,
                    "--y": `${puff.y}px`,
                    "--s": `${puff.s}`,
                    "--drift": `${puff.drift}px`,
                    "--s2": `${puff.s2}`,
                    "--s3": `${puff.s3}`,
                    "--drift2": `${puff.drift2}px`,
                    animationDelay: `${delay}ms`,
                  } as CSSProperties}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="burn-screen-flash" style={impactAnimationStyle} />
      {impacts.map(({ geometry, delay }, impactIndex) => (
        <span
          key={impactIndex}
          className="burn-damage-number"
          style={{ ...impactStyle(geometry), animationDelay: `${640 + delay}ms` }}
        >
          {burn.impactLabel ?? `-${burn.amount}`}
        </span>
      ))}
    </div>,
    document.body,
  );
}

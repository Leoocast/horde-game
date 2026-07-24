import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { useGameStore } from "../store/useGameStore";

type BurnGeometry = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

// Master clock mirrors the CSS --burn-duration (1100ms). Flight runs 20%–58%, impact at 58%.
const IMPACT_AT_MS = 638;
const FLIGHT_START_MS = 220;
const EMBER_COUNT = 64;

// Ported verbatim from the reference (assets/examples/Fireball/fireball.html).
const CHARGE_PARTICLES = [
  { a: 12, r: 42, s: 3 },
  { a: 86, r: 33, s: 3 },
  { a: 155, r: 45, s: 5 },
  { a: 228, r: 36, s: 3 },
  { a: 307, r: 40, s: 4 },
];
const TRAIL_RIBBONS = [
  { w: 96, h: 36, y: 0, r: 0, blur: 7, o: 0.9 },
  { w: 78, h: 18, y: -18, r: -7, blur: 5, o: 0.9 },
  { w: 72, h: 16, y: 17, r: 8, blur: 5, o: 0.86 },
];
const TRAIL_STREAKS = [
  { w: 108, h: 6, y: -6, r: -1, blur: 3, o: 0.92 },
  { w: 88, h: 4, y: 11, r: 2, blur: 2.4, o: 0.96 },
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
  const [geometry, setGeometry] = useState<BurnGeometry>();
  const projectileRef = useRef<HTMLDivElement>(null);
  const traceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!burn) {
      setGeometry(undefined);
      return;
    }
    const source = burn.sourceId
      ? document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.sourceId}"]`)
      : undefined;
    const target = document.querySelector<HTMLElement>(`[data-card-slot-id="${burn.targetId}"]`);
    if (!target) return;
    const sourceRect = source?.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    setGeometry({
      startX: sourceRect ? sourceRect.left + sourceRect.width / 2 : window.innerWidth * 0.5,
      startY: sourceRect ? sourceRect.top + sourceRect.height / 2 : window.innerHeight * 0.28,
      endX: targetRect.left + targetRect.width / 2,
      endY: targetRect.top + targetRect.height / 2,
    });
  }, [burn]);

  // Trace sparks bleed off the fireball along its real path; a ring of embers bursts on impact.
  // Both read live DOM rects, exactly like the reference.
  useEffect(() => {
    if (!burn || !geometry) return;
    const trace = traceRef.current;
    if (!trace) return;

    let frame = 0;
    let cancelled = false;
    let lastSpawn = 0;
    let embersSpawned = false;
    const start = performance.now();

    const spawnTrace = () => {
      const projectile = projectileRef.current;
      if (!projectile) return;
      const rect = projectile.getBoundingClientRect();
      const particle = document.createElement("i");
      particle.className = "burn-trace-particle";
      const size = 2 + Math.random() * 4;
      const life = 260 + Math.random() * 480;
      const x = rect.left + rect.width * (0.1 + Math.random() * 0.32);
      const y = rect.top + rect.height * (0.28 + Math.random() * 0.44);
      particle.style.left = `${x}px`;
      particle.style.top = `${y}px`;
      particle.style.setProperty("--size", `${size}px`);
      particle.style.setProperty("--life", `${life}ms`);
      particle.style.setProperty("--dx", `${-30 - Math.random() * 80}px`);
      particle.style.setProperty("--dy", `${-10 + Math.random() * 60}px`);
      trace.appendChild(particle);
      particle.addEventListener("animationend", () => particle.remove(), { once: true });
    };

    const spawnEmber = () => {
      const size = 2.5 + Math.random() * 6;
      const life = 420 + Math.random() * 560;
      const angle = Math.random() * Math.PI * 2;
      // Wide spread so plenty of embers clear the impact core and read against the dark board.
      const dist = 40 + Math.random() * 220;
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
      if (elapsed >= IMPACT_AT_MS - 30) {
        if (!embersSpawned) {
          embersSpawned = true;
          for (let i = 0; i < EMBER_COUNT; i++) spawnEmber();
        }
        return;
      }
      if (elapsed >= FLIGHT_START_MS && now - lastSpawn > 8) {
        const bursts = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < bursts; i++) spawnTrace();
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
  }, [burn, geometry]);

  if (!burn || !geometry) return null;
  const dx = geometry.endX - geometry.startX;
  const dy = geometry.endY - geometry.startY;
  // The ball squash and the trail are both aimed along the travel heading.
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const style = {
    "--burn-start-x": `${geometry.startX}px`,
    "--burn-start-y": `${geometry.startY}px`,
    "--burn-end-x": `${geometry.endX}px`,
    "--burn-end-y": `${geometry.endY}px`,
    "--burn-dx": `${dx}px`,
    "--burn-dy": `${dy}px`,
    "--burn-angle": `${angle}deg`,
  } as CSSProperties;

  return createPortal(
    <div key={burn.id} className="burn-animation-layer" style={style} aria-hidden="true">
      <div className="burn-world">
        {/* Charge build-up at the source card. */}
        <div className="burn-charge">
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

        <div ref={traceRef} className="burn-trace-layer" />

        {/* Multi-layer morphing fireball with attached trail. */}
        <div ref={projectileRef} className="burn-fireball">
          <div className="burn-trail">
            {TRAIL_RIBBONS.map((t, index) => (
              <i
                key={index}
                className="burn-trail-ribbon"
                style={{ "--w": `${t.w}px`, "--h": `${t.h}px`, "--y": `${t.y}px`, "--r": `${t.r}deg`, "--blur": `${t.blur}px`, "--o": `${t.o}` } as CSSProperties}
              />
            ))}
            {TRAIL_STREAKS.map((t, index) => (
              <i
                key={index}
                className="burn-trail-streak"
                style={{ "--w": `${t.w}px`, "--h": `${t.h}px`, "--y": `${t.y}px`, "--r": `${t.r}deg`, "--blur": `${t.blur}px`, "--o": `${t.o}` } as CSSProperties}
              />
            ))}
          </div>
          <div className="burn-fireball-body">
            <div className="burn-ball-outer" />
            <div className="burn-ball-mid" />
            <div className="burn-ball-core" />
            <div className="burn-ball-hotspot" />
            <div className="burn-ball-shadow" />
          </div>
        </div>

        {/* Layered impact anchored on the target card. */}
        <div className="burn-impact">
          <div className="burn-void-disc" />
          <div className="burn-impact-core" />
          <div className="burn-shock-ring one" style={{ "--size": "112px", "--border-size": "7px", "--ring-blur": "1px" } as CSSProperties} />
          <div className="burn-shock-ring two" style={{ "--size": "92px", "--border-size": "3px", "--ring-blur": "2px" } as CSSProperties} />
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
              } as CSSProperties}
            />
          ))}
        </div>
      </div>

      <div className="burn-screen-flash" />
      <span className="burn-damage-number">-{burn.amount}</span>
    </div>,
    document.body,
  );
}

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import * as THREE from "three";
import { useGameStore } from "../store/useGameStore";
import { useAudioStore } from "../store/useAudioStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";

type ScreenPoint = { x: number; y: number };
type SmokeRoute = "extraction" | "orbit" | "recovery";
type SmokeTendrilProfile = {
  className: string;
  start: number;
  end: number;
  amplitude: number;
  frequency: number;
  phase: number;
  drift: number;
  warped?: boolean;
};
type ShaderSmokePuff = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  route: SmokeRoute;
  delay: number;
  duration: number;
  size: number;
  phase: number;
  lateralBias: number;
  opacity: number;
};

const SMOKE_TENDRILS: SmokeTendrilProfile[] = [
  { className: "drain-essence-smoke-wisp", start: 0, end: 0.9, amplitude: 42, frequency: 2.7, phase: 1.2, drift: 16, warped: true },
  { className: "drain-essence-smoke-wisp", start: 0.12, end: 1, amplitude: 34, frequency: 2.2, phase: 3.8, drift: -21, warped: true },
  { className: "drain-essence-smoke-wisp is-faint", start: 0.3, end: 0.96, amplitude: 49, frequency: 3.4, phase: 0.5, drift: 11, warped: true },
  { className: "drain-essence-smoke-vein", start: 0, end: 1, amplitude: 13, frequency: 2.1, phase: 1.8, drift: 2 },
  { className: "drain-essence-smoke-vein is-faint", start: 0.16, end: 0.95, amplitude: 22, frequency: 2.8, phase: 4.1, drift: -7 },
];

const SMOKE_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// This follows the official Three.js flame example's core idea in WebGL-compatible GLSL:
// stretch the UVs, displace them with animated noise, then derive both shape and alpha from it.
const SMOKE_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uEmber;
  uniform float uGreen;
  varying vec2 vUv;

  float hash21(vec2 point) {
    point = fract(point * vec2(123.34, 456.21));
    point += dot(point, point + 45.32);
    return fract(point.x * point.y);
  }

  float valueNoise(vec2 point) {
    vec2 cell = floor(point);
    vec2 local = fract(point);
    local = local * local * (3.0 - 2.0 * local);
    float a = hash21(cell);
    float b = hash21(cell + vec2(1.0, 0.0));
    float c = hash21(cell + vec2(0.0, 1.0));
    float d = hash21(cell + vec2(1.0, 1.0));
    return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
  }

  float fbm(vec2 point) {
    float value = 0.0;
    float amplitude = 0.5;
    mat2 rotation = mat2(0.8, -0.6, 0.6, 0.8);
    for (int octave = 0; octave < 4; octave++) {
      value += amplitude * valueNoise(point);
      point = rotation * point * 2.03 + 13.17;
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    vec2 centered = uv * 2.0 - 1.0;

    float time = uTime * 0.52 + uSeed * 7.31;
    float broadNoise = fbm(vec2(centered.x * 1.35 - time * 0.42, centered.y * 1.8 + uSeed * 2.7));
    float fineNoise = fbm(vec2(centered.x * 3.4 - time * 0.7, centered.y * 4.1 - time * 0.16 + uSeed));

    // Pull and fold the cloud sideways like the torn smoke in the card illustration.
    centered.y += (broadNoise - 0.5) * 0.72;
    centered.x += sin(centered.y * 3.2 + time) * 0.12;

    float radial = length(vec2(centered.x * 0.68, centered.y * 1.18));
    float raggedEdge = radial + (1.0 - broadNoise) * 0.48 + (fineNoise - 0.5) * 0.2;
    float body = 1.0 - smoothstep(0.34, 1.02, raggedEdge);

    float horizontalFade = smoothstep(0.0, 0.13, uv.x) * (1.0 - smoothstep(0.76, 1.0, uv.x));
    float verticalFade = smoothstep(0.0, 0.12, uv.y) * (1.0 - smoothstep(0.84, 1.0, uv.y));
    float alpha = body * horizontalFade * verticalFade * uOpacity;
    if (alpha < 0.012) discard;

    vec3 charcoal = vec3(0.055, 0.068, 0.072);
    vec3 ash = vec3(0.48, 0.53, 0.54);
    vec3 color = mix(charcoal, ash, smoothstep(0.24, 0.82, broadNoise) * 0.72);
    vec3 spiritCharcoal = vec3(0.025, 0.12, 0.065);
    vec3 spiritAsh = vec3(0.28, 0.68, 0.42);
    vec3 spiritColor = mix(spiritCharcoal, spiritAsh, smoothstep(0.22, 0.8, broadNoise) * 0.82);
    color = mix(color, spiritColor, uGreen);

    float emberNoise = fbm(vec2(centered.x * 6.4 + uSeed * 3.0, centered.y * 8.1 - time * 0.9));
    float ember = smoothstep(0.72, 0.9, emberNoise) * smoothstep(0.08, 0.64, body) * uEmber;
    color += vec3(0.34, 0.025, 0.045) * ember;

    gl_FragColor = vec4(color, alpha);
  }
`;

function quadraticScreenPoint(
  start: ScreenPoint,
  control: ScreenPoint,
  end: ScreenPoint,
  progress: number,
): ScreenPoint {
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
    y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
  };
}

function quadraticScreenTangent(
  start: ScreenPoint,
  control: ScreenPoint,
  end: ScreenPoint,
  progress: number,
): ScreenPoint {
  const x = 2 * (1 - progress) * (control.x - start.x) + 2 * progress * (end.x - control.x);
  const y = 2 * (1 - progress) * (control.y - start.y) + 2 * progress * (end.y - control.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function buildSmokeTendrilPath(
  start: ScreenPoint,
  control: ScreenPoint,
  end: ScreenPoint,
  profile: SmokeTendrilProfile,
): string {
  const points: string[] = [];
  for (let index = 0; index <= 64; index += 1) {
    const localProgress = index / 64;
    const progress = profile.start + (profile.end - profile.start) * localProgress;
    const point = quadraticScreenPoint(start, control, end, progress);
    const tangent = quadraticScreenTangent(start, control, end, progress);
    const envelope = Math.sin(Math.PI * localProgress);
    const offset =
      (
        Math.sin(progress * Math.PI * profile.frequency + profile.phase) * profile.amplitude +
        Math.sin(progress * Math.PI * profile.frequency * 2.37 + profile.phase * 0.7) * profile.amplitude * 0.26
      ) * envelope +
      profile.drift * envelope;
    const x = point.x - tangent.y * offset;
    const y = point.y + tangent.x * offset;
    points.push(`${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return points.join(" ");
}

function seededNoise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function createSmokeMaterial(seed: number, ember: number, green: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERTEX_SHADER,
    fragmentShader: SMOKE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
      uEmber: { value: ember },
      uGreen: { value: green },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

export function DrainEssenceAnimator() {
  const game = useGameStore((state) => state.game);
  const active = useGameStore((state) => state.drainEssenceAnimation);
  const resolve = useGameStore((state) => state.resolveDrainEssenceAnimation);
  const complete = useGameStore((state) => state.completeDrainEssenceAnimation);
  const playSfx = useAudioStore((state) => state.playSfx);
  const cardRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const targetAuraRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);
  const extractionTendrilRefs = useRef<Array<SVGPathElement | null>>([]);
  const recoveryPathRef = useRef<SVGPathElement>(null);
  const recoveryOrbRef = useRef<SVGGElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const cardElement = cardRef.current;
    const vignetteElement = vignetteRef.current;
    const targetAuraElement = targetAuraRef.current;
    const threeCanvas = threeCanvasRef.current;
    const recoveryPathElement = recoveryPathRef.current;
    const recoveryOrbElement = recoveryOrbRef.current;
    const extractionPathElements = extractionTendrilRefs.current
      .filter((element): element is SVGPathElement => Boolean(element));
    if (
      !cardElement ||
      !vignetteElement ||
      !targetAuraElement ||
      !threeCanvas ||
      !recoveryPathElement ||
      !recoveryOrbElement ||
      extractionPathElements.length === 0
    ) return;

    const targetElement = document.querySelector<HTMLElement>(`[data-card-slot-id="${active.targetId}"]`);
    const targetRect = targetElement?.getBoundingClientRect();
    if (!targetElement || !targetRect || targetRect.width === 0 || targetRect.height === 0) {
      resolve(active.id);
      complete(active.id);
      return;
    }

    const fallbackWidth = Math.max(198, Math.min(246, window.innerWidth * 0.15));
    const fallbackHeight = fallbackWidth * (680 / 488);
    const fallbackCenteredLeft = (window.innerWidth - fallbackWidth) / 2;
    const fallbackRightAnchor = window.innerWidth - Math.min(window.innerWidth * 0.055, 70) - fallbackWidth;
    const fallbackLeft = fallbackCenteredLeft + (fallbackRightAnchor - fallbackCenteredLeft) * 0.48;
    const fallbackTop = (window.innerHeight - fallbackHeight) / 2 - Math.min(window.innerHeight * 0.035, 30);
    const displayedCard = active.origin ?? {
      left: fallbackLeft,
      top: fallbackTop,
      width: fallbackWidth,
      height: fallbackHeight,
    };
    const targetWidth = displayedCard.width;
    const targetHeight = displayedCard.height;
    const targetLeft = displayedCard.left;
    const targetTop = displayedCard.top;
    const sourceX = targetRect.left + targetRect.width / 2;
    const sourceY = targetRect.top + targetRect.height / 2;
    const spellX = targetLeft + targetWidth / 2;
    const spellY = targetTop + targetHeight / 2;
    const lifeEmblem =
      document.querySelector<HTMLElement>('[data-player-life-emblem="true"]') ??
      document.querySelector<HTMLElement>('[data-player-life-panel="true"]');
    const lifeRect = lifeEmblem?.getBoundingClientRect();
    const lifeX = lifeRect ? lifeRect.left + lifeRect.width / 2 : window.innerWidth - 58;
    const lifeY = lifeRect ? lifeRect.top + lifeRect.height / 2 : window.innerHeight - 58;

    const extractionStart = { x: sourceX, y: sourceY };
    const extractionEnd = { x: spellX, y: spellY };
    const extractionControl = {
      x: (sourceX + spellX) / 2 + (sourceY - spellY) * 0.12,
      y: (sourceY + spellY) / 2 - 92,
    };
    const recoveryStart = { x: spellX, y: spellY };
    const recoveryEnd = { x: lifeX, y: lifeY };
    const recoveryControl = {
      x: (spellX + lifeX) / 2 + (spellY - lifeY) * 0.08,
      y: Math.min(spellY, lifeY) - 76,
    };

    cardElement.style.width = `${targetWidth}px`;
    cardElement.style.height = `${targetHeight}px`;
    vignetteElement.style.setProperty("--drain-source-x", `${sourceX}px`);
    vignetteElement.style.setProperty("--drain-source-y", `${sourceY}px`);
    targetAuraElement.style.left = `${targetRect.left - 5}px`;
    targetAuraElement.style.top = `${targetRect.top - 5}px`;
    targetAuraElement.style.width = `${targetRect.width + 10}px`;
    targetAuraElement.style.height = `${targetRect.height + 10}px`;

    for (let index = 0; index < SMOKE_TENDRILS.length; index += 1) {
      extractionTendrilRefs.current[index]?.setAttribute(
        "d",
        buildSmokeTendrilPath(extractionStart, extractionControl, extractionEnd, SMOKE_TENDRILS[index]),
      );
    }
    recoveryPathElement.setAttribute(
      "d",
      `M ${spellX} ${spellY} Q ${recoveryControl.x} ${recoveryControl.y} ${lifeX} ${lifeY}`,
    );

    gsap.set(cardElement, {
      left: targetLeft,
      top: targetTop,
      scale: 1,
      rotation: 0,
      opacity: 1,
      filter: "none",
      transformOrigin: "50% 50%",
    });
    gsap.set(vignetteElement, { opacity: 0 });
    gsap.set(targetAuraElement, { opacity: 0, scale: 0.96 });
    for (const path of extractionPathElements) {
      const length = path.getTotalLength();
      gsap.set(path, { strokeDasharray: length, strokeDashoffset: length, opacity: 0 });
    }
    const recoveryLength = recoveryPathElement.getTotalLength();
    gsap.set(recoveryPathElement, {
      strokeDasharray: recoveryLength,
      strokeDashoffset: recoveryLength,
      opacity: 0,
    });
    gsap.set(recoveryOrbElement, {
      x: spellX,
      y: spellY,
      scale: 0.65,
      opacity: 0,
      transformOrigin: "50% 50%",
    });
    targetElement.classList.add("drain-essence-target-draining");

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
      0,
      window.innerWidth,
      window.innerHeight,
      0,
      -100,
      100,
    );
    camera.position.z = 10;
    let renderer: THREE.WebGLRenderer | undefined;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: threeCanvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
      renderer.setClearColor(0x000000, 0);
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    } catch {
      renderer = undefined;
    }

    const geometry = new THREE.PlaneGeometry(1, 1);
    const puffs: ShaderSmokePuff[] = [];

    const addPuff = (
      route: SmokeRoute,
      index: number,
      delay: number,
      duration: number,
      size: number,
      opacity: number,
    ) => {
      const seed = seededNoise(index, route === "extraction" ? 2.1 : route === "orbit" ? 5.6 : 7.4);
      const ember = route === "recovery"
        ? 0
        : seededNoise(index, 4.9) > 0.72 ? 0.26 : 0.04;
      const material = createSmokeMaterial(seed, ember, route === "recovery" ? 1 : 0);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.visible = false;
      scene.add(mesh);
      puffs.push({
        mesh,
        material,
        route,
        delay,
        duration,
        size,
        phase: seededNoise(index, 5.8) * Math.PI * 2,
        lateralBias: (seededNoise(index, 9.2) - 0.5) * (route === "extraction" ? 46 : route === "orbit" ? 12 : 14),
        opacity,
      });
    };

    for (let index = 0; index < 46; index += 1) {
      addPuff(
        "extraction",
        index,
        0.03 + (index % 23) * 0.015 + Math.floor(index / 23) * 0.025,
        0.54 + seededNoise(index, 1.7) * 0.14,
        94 + seededNoise(index, 3.3) * 72,
        0.28 + seededNoise(index, 6.2) * 0.18,
      );
    }
    for (let index = 0; index < 22; index += 1) {
      addPuff(
        "orbit",
        index,
        0.54 + (index % 11) * 0.02 + Math.floor(index / 11) * 0.035,
        0.42 + seededNoise(index, 4.4) * 0.13,
        72 + seededNoise(index, 3.9) * 54,
        0.26 + seededNoise(index, 7.3) * 0.17,
      );
    }
    for (let index = 0; index < 18; index += 1) {
      addPuff(
        "recovery",
        index,
        0.92 + index * 0.008,
        0.34 + seededNoise(index, 8.6) * 0.08,
        38 + seededNoise(index, 2.8) * 30,
        0.3 + seededNoise(index, 6.8) * 0.17,
      );
    }

    let elapsed = 0;
    let lastFrameTime = performance.now();
    let animationFrame = 0;
    const tick = (now: number) => {
      const deltaSeconds = Math.min(now - lastFrameTime, 64) / 1000;
      lastFrameTime = now;
      elapsed += deltaSeconds;

      for (const puff of puffs) {
        const localTime = elapsed - puff.delay;
        if (localTime < 0 || localTime > puff.duration) {
          puff.mesh.visible = false;
          puff.material.uniforms.uOpacity.value = 0;
          continue;
        }
        const progress = Math.min(1, localTime / puff.duration);
        const recovery = puff.route === "recovery";
        const orbiting = puff.route === "orbit";
        let screenX: number;
        let screenY: number;
        let tangent: ScreenPoint;
        let taper: number;
        if (orbiting) {
          const angle = puff.phase + progress * Math.PI * 2 * 1.18;
          const radiusX = targetWidth * 0.46 + puff.lateralBias;
          const radiusY = targetHeight * 0.43 + puff.lateralBias * 0.45;
          screenX = spellX + Math.cos(angle) * radiusX;
          screenY = spellY + Math.sin(angle) * radiusY;
          const tangentX = -Math.sin(angle) * radiusX;
          const tangentY = Math.cos(angle) * radiusY;
          const tangentLength = Math.hypot(tangentX, tangentY) || 1;
          tangent = { x: tangentX / tangentLength, y: tangentY / tangentLength };
          taper = 0.72 + Math.sin(Math.PI * progress) * 0.18;
        } else {
          const start = recovery ? recoveryStart : extractionStart;
          const control = recovery ? recoveryControl : extractionControl;
          const end = recovery ? recoveryEnd : extractionEnd;
          const point = quadraticScreenPoint(start, control, end, progress);
          tangent = quadraticScreenTangent(start, control, end, progress);
          const envelope = Math.sin(Math.PI * progress);
          const ripple =
            Math.sin(progress * Math.PI * (recovery ? 3.2 : 4.7) + puff.phase) *
            (recovery ? 7 : 19) *
            envelope;
          const offset = puff.lateralBias * envelope + ripple;
          screenX = point.x - tangent.y * offset;
          screenY = point.y + tangent.x * offset;
          taper = recovery ? 0.76 - progress * 0.28 : 1 - progress * 0.48;
        }
        const flutter = 1 + Math.sin(elapsed * 5.2 + puff.phase) * 0.12;
        const fade = Math.pow(Math.sin(Math.PI * progress), 0.72);

        puff.mesh.visible = true;
        puff.mesh.position.set(screenX, window.innerHeight - screenY, recovery ? 4 : orbiting ? 3 : 2);
        puff.mesh.rotation.z = -Math.atan2(tangent.y, tangent.x);
        puff.mesh.scale.set(
          puff.size * 1.45 * taper,
          puff.size * 0.72 * taper * flutter,
          1,
        );
        puff.material.uniforms.uTime.value = elapsed;
        puff.material.uniforms.uOpacity.value = fade * puff.opacity;
      }

      renderer?.render(scene, camera);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

    const recoveryMotion = { progress: 0 };
    const timeline = gsap.timeline({
      onComplete: () => complete(active.id),
    });
    timeline
      .to(vignetteElement, { opacity: 1, duration: 0.22, ease: "power2.out" }, 0)
      .to(targetAuraElement, {
        opacity: 1,
        scale: 1,
        duration: 0.16,
        ease: "power2.out",
      }, 0.02)
      .call(() => playSfx("activateEffect", { volume: 0.55 }), [], 0.04)
      .to(extractionPathElements, {
        strokeDashoffset: 0,
        opacity: 0.58,
        duration: 0.6,
        ease: "power2.inOut",
      }, 0.04)
      .to(cardElement, {
        filter: "brightness(1.08) saturate(0.86) drop-shadow(0 0 18px rgba(91, 34, 47, 0.5))",
        duration: 0.18,
        ease: "power2.out",
      }, 0.58)
      .to(extractionPathElements, {
        opacity: 0,
        duration: 0.2,
        ease: "power1.out",
      }, 0.72)
      .to(recoveryPathElement, {
        strokeDashoffset: 0,
        opacity: 0.7,
        duration: 0.4,
        ease: "power2.inOut",
      }, 0.92)
      .to(recoveryOrbElement, {
        opacity: 0.8,
        scale: 1,
        duration: 0.09,
        ease: "back.out(2)",
      }, 0.92)
      .to(recoveryMotion, {
        progress: 1,
        duration: 0.4,
        ease: "power2.inOut",
        onUpdate: () => {
          const point = quadraticScreenPoint(
            recoveryStart,
            recoveryControl,
            recoveryEnd,
            recoveryMotion.progress,
          );
          gsap.set(recoveryOrbElement, { x: point.x, y: point.y });
        },
      }, 0.92)
      .call(() => resolve(active.id), [], 1.32)
      .to([recoveryPathElement, recoveryOrbElement], {
        opacity: 0,
        duration: 0.14,
        ease: "power1.out",
      }, 1.34)
      .to(cardElement, {
        scale: 0.2,
        opacity: 0,
        rotation: -2,
        filter: "brightness(1.45) saturate(0.18) blur(13px)",
        duration: 0.24,
        ease: "back.in(1.25)",
      }, 1.34)
      .to(targetAuraElement, {
        opacity: 0,
        scale: 1.04,
        duration: 0.18,
        ease: "power1.out",
      }, 1.35)
      .to(vignetteElement, { opacity: 0, duration: 0.28, ease: "power1.out" }, 1.42);

    return () => {
      timeline.kill();
      window.cancelAnimationFrame(animationFrame);
      targetElement.classList.remove("drain-essence-target-draining");
      for (const puff of puffs) {
        scene.remove(puff.mesh);
        puff.material.dispose();
      }
      geometry.dispose();
      renderer?.dispose();
    };
  }, [active?.id, complete, playSfx, resolve]);

  if (!active || typeof document === "undefined") return null;
  const showFullImage = shouldShowFullCardImage(active.card.definitionId);

  return createPortal(
    <>
      <div ref={vignetteRef} className="drain-essence-vignette" aria-hidden="true" />
      <div key={active.id} className="drain-essence-animation-layer" aria-hidden="true">
        <svg className="drain-essence-ribbon-svg" viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}>
          <defs>
            <filter id="drain-essence-smoke-warp" x="-40%" y="-60%" width="180%" height="220%">
              <feTurbulence type="fractalNoise" baseFrequency="0.009 0.025" numOctaves="2" seed="17" result="smokeNoise" />
              <feDisplacementMap in="SourceGraphic" in2="smokeNoise" scale="14" xChannelSelector="R" yChannelSelector="B" result="displacedSmoke" />
              <feGaussianBlur in="displacedSmoke" stdDeviation="1.1" result="softSmoke" />
              <feMerge>
                <feMergeNode in="softSmoke" />
                <feMergeNode in="displacedSmoke" />
              </feMerge>
            </filter>
          </defs>
          {SMOKE_TENDRILS.map((profile, index) => (
            <path
              key={`smoke-tendril-${index}`}
              ref={(element) => {
                extractionTendrilRefs.current[index] = element;
              }}
              className={profile.className}
              filter={profile.warped ? "url(#drain-essence-smoke-warp)" : undefined}
            />
          ))}
          <path ref={recoveryPathRef} className="drain-essence-recovery-path" />
          <g ref={recoveryOrbRef} className="drain-essence-recovery-orb">
            <circle r="18" className="drain-essence-recovery-orb-haze" />
            <circle r="8" className="drain-essence-recovery-orb-shell" />
            <circle r="2.8" className="drain-essence-recovery-orb-core" />
          </g>
        </svg>
        <canvas ref={threeCanvasRef} className="drain-essence-three-canvas" />
        <div ref={targetAuraRef} className="drain-essence-target-aura" />
        <div ref={cardRef} className="drain-essence-card-host">
          <div className="drain-essence-card-shell">
            <Card
              game={game}
              card={active.card}
              selectionDisabled
              suppressContextMenu
              suppressHoverOverlay
              suppressCardId
              suppressSummoningSickness
              highRes
              showFullImage={showFullImage}
              showCostBadge={showFullImage}
              preferNativeImageRendering={showFullImage}
            />
            <span className="drain-essence-card-void" />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

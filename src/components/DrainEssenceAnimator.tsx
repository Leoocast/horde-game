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

  useLayoutEffect(() => {
    if (!active) return;
    const cardElement = cardRef.current;
    const vignetteElement = vignetteRef.current;
    const targetAuraElement = targetAuraRef.current;
    const threeCanvas = threeCanvasRef.current;
    if (
      !cardElement ||
      !vignetteElement ||
      !targetAuraElement ||
      !threeCanvas
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
        phase: route === "orbit"
          ? ((index % 11) / 11) * Math.PI * 2 + Math.floor(index / 11) * 0.28
          : seededNoise(index, 5.8) * Math.PI * 2,
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
        101 + seededNoise(index, 3.3) * 78,
        0.28 + seededNoise(index, 6.2) * 0.18,
      );
    }
    for (let index = 0; index < 22; index += 1) {
      addPuff(
        "orbit",
        index,
        0.5 + (index % 11) * 0.012 + Math.floor(index / 11) * 0.025,
        0.4 + seededNoise(index, 4.4) * 0.1,
        78 + seededNoise(index, 3.9) * 58,
        0.26 + seededNoise(index, 7.3) * 0.17,
      );
    }
    for (let index = 0; index < 26; index += 1) {
      addPuff(
        "recovery",
        index,
        0.86 + index * 0.006,
        0.34 + seededNoise(index, 8.6) * 0.07,
        48 + seededNoise(index, 2.8) * 39,
        0.34 + seededNoise(index, 6.8) * 0.17,
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
          const angle = puff.phase + progress * Math.PI * 2 * 1.42;
          const spiral = 1 - progress * 0.86;
          const radiusX = (targetWidth * 0.48 + puff.lateralBias) * spiral + 8;
          const radiusY = (targetHeight * 0.43 + puff.lateralBias * 0.45) * spiral + 10;
          screenX = spellX + Math.cos(angle) * radiusX;
          screenY = spellY + Math.sin(angle) * radiusY;
          const tangentX = -Math.sin(angle) * radiusX;
          const tangentY = Math.cos(angle) * radiusY;
          const tangentLength = Math.hypot(tangentX, tangentY) || 1;
          tangent = { x: tangentX / tangentLength, y: tangentY / tangentLength };
          taper = 0.8 - progress * 0.34 + Math.sin(Math.PI * progress) * 0.12;
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
          puff.size * 0.8 * taper * flutter,
          1,
        );
        puff.material.uniforms.uTime.value = elapsed;
        puff.material.uniforms.uOpacity.value = fade * puff.opacity;
      }

      renderer?.render(scene, camera);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

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
      .call(() => playSfx("activateEffect"), [], 0.04)
      .to(cardElement, {
        filter: "brightness(1.08) saturate(0.86) drop-shadow(0 0 18px rgba(91, 34, 47, 0.5))",
        duration: 0.18,
        ease: "power2.out",
      }, 0.54)
      .call(() => resolve(active.id), [], 1.26)
      .to(cardElement, {
        scale: 0.2,
        opacity: 0,
        rotation: -2,
        filter: "brightness(1.45) saturate(0.18) blur(13px)",
        duration: 0.24,
        ease: "back.in(1.25)",
      }, 1.28)
      .to(targetAuraElement, {
        opacity: 0,
        scale: 1.04,
        duration: 0.18,
        ease: "power1.out",
      }, 1.29)
      .to(vignetteElement, { opacity: 0, duration: 0.26, ease: "power1.out" }, 1.35);

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

import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import * as THREE from "three";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";

type ScreenPoint = { x: number; y: number };
type SmokeRole = "head" | "trail";
type SmokePuff = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  role: SmokeRole;
  size: number;
  phase: number;
  lateralBias: number;
  opacity: number;
  trailOffset: number;
};
type BloodDrop = {
  mesh: THREE.Mesh;
  delay: number;
  duration: number;
  size: number;
  phase: number;
  lateralBias: number;
};
type SmokeVein = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  trailOffset: number;
  lateralBias: number;
  length: number;
  thickness: number;
  phase: number;
  opacity: number;
};
type SmokeRibbon = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  trailOffset: number;
  lateralBias: number;
  length: number;
  thickness: number;
  phase: number;
  opacity: number;
};
type SmokeImpactWisp = {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  delay: number;
  duration: number;
  angle: number;
  distance: number;
  size: number;
  curl: number;
  rise: number;
  phase: number;
  opacity: number;
};

const PROJECTILE_LAUNCH_SECONDS = 0.68;
const PROJECTILE_TRAVEL_SECONDS = 0.24;
const PROJECTILE_IMPACT_SECONDS = PROJECTILE_LAUNCH_SECONDS + PROJECTILE_TRAVEL_SECONDS;

const SMOKE_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SMOKE_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  uniform float uBlood;
  uniform float uEmber;
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
    float time = uTime * 0.68 + uSeed * 7.31;
    float broadNoise = fbm(vec2(centered.x * 1.32 - time * 0.5, centered.y * 1.72 + uSeed * 2.7));
    float fineNoise = fbm(vec2(centered.x * 3.6 - time * 0.82, centered.y * 4.2 - time * 0.2 + uSeed));

    centered.y += (broadNoise - 0.5) * 0.46;
    centered.x += sin(centered.y * 3.4 + time) * 0.11;

    float radial = length(vec2(centered.x * 0.82, centered.y * 1.04));
    float tornRadius = 0.79 + (broadNoise - 0.5) * 0.38 + (fineNoise - 0.5) * 0.16;
    float body = 1.0 - smoothstep(tornRadius - 0.34, tornRadius, radial);
    float foldedBody = smoothstep(0.08, 0.86, body) * mix(0.58, 1.0, broadNoise);
    float wisps = smoothstep(0.52, 0.86, broadNoise) * (1.0 - smoothstep(0.66, 1.04, radial)) * 0.22;
    float horizontalFade = smoothstep(0.01, 0.13, uv.x) * (1.0 - smoothstep(0.87, 0.995, uv.x));
    float verticalFade = smoothstep(0.01, 0.12, uv.y) * (1.0 - smoothstep(0.88, 0.995, uv.y));
    float alpha = (foldedBody + wisps) * horizontalFade * verticalFade * uOpacity;
    if (alpha < 0.012) discard;

    vec3 charcoal = vec3(0.018, 0.021, 0.024);
    vec3 ash = vec3(0.49, 0.5, 0.5);
    vec3 smokeColor = mix(charcoal, ash, smoothstep(0.18, 0.86, broadNoise) * 0.76);
    smokeColor *= mix(0.7, 1.08, fineNoise);
    vec3 driedBlood = vec3(0.13, 0.002, 0.018);
    vec3 freshBlood = vec3(0.72, 0.018, 0.09);
    vec3 bloodColor = mix(driedBlood, freshBlood, smoothstep(0.2, 0.82, broadNoise));
    vec3 color = mix(smokeColor, bloodColor, uBlood);

    float emberNoise = fbm(vec2(centered.x * 6.5 + uSeed * 3.0, centered.y * 8.2 - time));
    float ember = smoothstep(0.72, 0.91, emberNoise) * smoothstep(0.08, 0.64, body) * uEmber;
    color += vec3(0.58, 0.018, 0.055) * ember;

    gl_FragColor = vec4(color, alpha);
  }
`;

const VEIN_VERTEX_SHADER = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const VEIN_FRAGMENT_SHADER = `
  precision highp float;

  uniform float uTime;
  uniform float uOpacity;
  uniform float uSeed;
  varying vec2 vUv;

  float hash11(float value) {
    return fract(sin(value * 127.1) * 43758.5453);
  }

  void main() {
    float x = vUv.x;
    float time = uTime * 4.2 + uSeed * 11.7;
    float taper = smoothstep(0.015, 0.16, x) * (1.0 - smoothstep(0.78, 0.99, x));
    float smokePulse = 0.76 + 0.24 * sin(x * 31.0 - time * 2.1 + uSeed * 8.0);

    float mainVein =
      0.5 +
      sin(x * 8.4 + time + uSeed * 5.0) * 0.075 +
      sin(x * 22.0 - time * 0.72 + uSeed * 9.0) * 0.026;
    float mainDistance = abs(vUv.y - mainVein);
    float mainCore = 1.0 - smoothstep(0.012, 0.04, mainDistance);
    float mainGlow = 1.0 - smoothstep(0.025, 0.17, mainDistance);

    float branchDirection = mix(-0.24, 0.24, hash11(uSeed + 3.7));
    float branchStart = smoothstep(0.3, 0.46, x);
    float branchEnd = 1.0 - smoothstep(0.72, 0.94, x);
    float branchVein =
      mainVein +
      branchDirection * branchStart +
      sin(x * 16.0 + time * 0.55 + uSeed) * 0.035;
    float branchDistance = abs(vUv.y - branchVein);
    float branchCore = (1.0 - smoothstep(0.01, 0.034, branchDistance)) * branchStart * branchEnd;
    float branchGlow = (1.0 - smoothstep(0.02, 0.13, branchDistance)) * branchStart * branchEnd;

    float core = max(mainCore, branchCore * 0.72);
    float glow = max(mainGlow, branchGlow * 0.58);
    float concealment =
      smoothstep(
        0.26,
        0.74,
        0.5 +
        sin(x * 17.0 + time * 0.38 + uSeed * 13.0) * 0.28 +
        sin(x * 43.0 - time * 0.22) * 0.16
      );
    float alpha = (core * 0.42 + glow * 0.1) * taper * smokePulse * concealment * uOpacity;
    if (alpha < 0.012) discard;

    vec3 deepCrimson = vec3(0.105, 0.0, 0.014);
    vec3 hotCrimson = vec3(0.48, 0.008, 0.055);
    vec3 veinColor = mix(deepCrimson, hotCrimson, core * 0.48 + glow * 0.1);
    gl_FragColor = vec4(veinColor, alpha);
  }
`;

function seededNoise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function quadraticPoint(start: ScreenPoint, control: ScreenPoint, end: ScreenPoint, progress: number): ScreenPoint {
  const inverse = 1 - progress;
  return {
    x: inverse * inverse * start.x + 2 * inverse * progress * control.x + progress * progress * end.x,
    y: inverse * inverse * start.y + 2 * inverse * progress * control.y + progress * progress * end.y,
  };
}

function quadraticTangent(start: ScreenPoint, control: ScreenPoint, end: ScreenPoint, progress: number): ScreenPoint {
  const x = 2 * (1 - progress) * (control.x - start.x) + 2 * progress * (end.x - control.x);
  const y = 2 * (1 - progress) * (control.y - start.y) + 2 * progress * (end.y - control.y);
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function linearPoint(start: ScreenPoint, end: ScreenPoint, progress: number): ScreenPoint {
  return {
    x: start.x + (end.x - start.x) * progress,
    y: start.y + (end.y - start.y) * progress,
  };
}

function linearTangent(start: ScreenPoint, end: ScreenPoint): ScreenPoint {
  const x = end.x - start.x;
  const y = end.y - start.y;
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

function createSmokeMaterial(seed: number, blood: number, ember: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: SMOKE_VERTEX_SHADER,
    fragmentShader: SMOKE_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
      uBlood: { value: blood },
      uEmber: { value: ember },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

function createVeinMaterial(seed: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: VEIN_VERTEX_SHADER,
    fragmentShader: VEIN_FRAGMENT_SHADER,
    uniforms: {
      uTime: { value: 0 },
      uOpacity: { value: 0 },
      uSeed: { value: seed },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
  });
}

export function FinalBanquetAnimator() {
  const game = useGameStore((state) => state.game);
  const active = useGameStore((state) => state.finalBanquetAnimation);
  const beginStrike = useGameStore((state) => state.beginFinalBanquetStrike);
  const beginImpact = useGameStore((state) => state.beginFinalBanquetImpact);
  const complete = useGameStore((state) => state.completeFinalBanquetAnimation);
  const playSfx = useAudioStore((state) => state.playSfx);
  const cardRef = useRef<HTMLDivElement>(null);
  const vignetteRef = useRef<HTMLDivElement>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    if (!active) return;
    const cardElement = cardRef.current;
    const vignetteElement = vignetteRef.current;
    const threeCanvas = threeCanvasRef.current;
    const targetElement = document.querySelector<HTMLElement>(`[data-card-slot-id="${active.targetId}"]`);
    const targetRect = targetElement?.getBoundingClientRect();
    if (!cardElement || !vignetteElement || !threeCanvas || !targetElement || !targetRect) {
      complete(active.id);
      return;
    }

    const lifeElement =
      document.querySelector<HTMLElement>('[data-player-life-emblem="true"]') ??
      document.querySelector<HTMLElement>('[data-player-life-panel="true"]');
    const lifeRect = lifeElement?.getBoundingClientRect();
    const fallbackWidth = Math.max(198, Math.min(246, window.innerWidth * 0.15));
    const fallbackHeight = fallbackWidth * (680 / 488);
    const origin = active.origin ?? {
      left: (window.innerWidth - fallbackWidth) / 2 + window.innerWidth * 0.13,
      top: (window.innerHeight - fallbackHeight) / 2 + 40,
      width: fallbackWidth,
      height: fallbackHeight,
    };
    const life = lifeRect
      ? { x: lifeRect.left + lifeRect.width / 2, y: lifeRect.top + lifeRect.height / 2 }
      : { x: window.innerWidth - 56, y: window.innerHeight - 56 };
    const card = { x: origin.left + origin.width / 2, y: origin.top + origin.height / 2 };
    const target = { x: targetRect.left + targetRect.width / 2, y: targetRect.top + targetRect.height / 2 };
    const bloodControl = {
      x: (life.x + card.x) / 2 + 72,
      y: Math.min(life.y, card.y) - 52,
    };
    const strikeTangent = linearTangent(card, target);
    const strikeAngle = Math.atan2(strikeTangent.y, strikeTangent.x);

    cardElement.style.left = `${origin.left}px`;
    cardElement.style.top = `${origin.top}px`;
    cardElement.style.width = `${origin.width}px`;
    cardElement.style.height = `${origin.height}px`;
    vignetteElement.style.setProperty("--final-banquet-target-x", `${target.x}px`);
    vignetteElement.style.setProperty("--final-banquet-target-y", `${target.y}px`);

    gsap.set(cardElement, { opacity: 1, scale: 1, rotation: 0, filter: "none", transformOrigin: "50% 50%" });
    gsap.set(vignetteElement, { opacity: 0 });

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, window.innerWidth, window.innerHeight, 0, -100, 100);
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
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    } catch {
      renderer = undefined;
    }

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const bloodLight = new THREE.PointLight(0xff264d, 3.8, Math.max(window.innerWidth, window.innerHeight));
    bloodLight.position.set(card.x, window.innerHeight - card.y, 38);
    scene.add(bloodLight);

    const smokeGeometry = new THREE.PlaneGeometry(1, 1);
    const bloodGeometry = new THREE.SphereGeometry(1, 14, 12);
    const bloodMaterial = new THREE.MeshPhongMaterial({
      color: 0x8f001d,
      emissive: 0x2d0009,
      specular: 0xff8ca1,
      shininess: 150,
      transparent: true,
      opacity: 0.96,
    });
    const puffs: SmokePuff[] = [];
    const bloodDrops: BloodDrop[] = [];
    const veins: SmokeVein[] = [];
    const ribbons: SmokeRibbon[] = [];
    const impactWisps: SmokeImpactWisp[] = [];
    const addPuff = (
      role: SmokeRole,
      index: number,
      size: number,
      opacity: number,
      trailOffset = 0,
    ): SmokePuff => {
      const blood = role === "head" ? 0.1 : 0.045;
      const ember = role === "head" ? 0.14 : 0.06;
      const material = createSmokeMaterial(seededNoise(index, 5.7), blood, ember);
      const mesh = new THREE.Mesh(smokeGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      const puff: SmokePuff = {
        mesh,
        material,
        role,
        size,
        phase: seededNoise(index, 4.6) * Math.PI * 2,
        lateralBias: 0,
        opacity,
        trailOffset,
      };
      puffs.push(puff);
      return puff;
    };
    const addVein = (
      index: number,
      length: number,
      thickness: number,
      opacity: number,
    ): SmokeVein => {
      const material = createVeinMaterial(seededNoise(index, 14.2));
      const mesh = new THREE.Mesh(smokeGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      const vein: SmokeVein = {
        mesh,
        material,
        trailOffset: 0,
        lateralBias: 0,
        length,
        thickness,
        phase: seededNoise(index, 15.9) * Math.PI * 2,
        opacity,
      };
      veins.push(vein);
      return vein;
    };
    const addRibbon = (
      index: number,
      length: number,
      thickness: number,
      opacity: number,
    ): SmokeRibbon => {
      const material = createSmokeMaterial(seededNoise(index, 18.4), 0.025, 0.025);
      const mesh = new THREE.Mesh(smokeGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      const ribbon: SmokeRibbon = {
        mesh,
        material,
        trailOffset: 0,
        lateralBias: 0,
        length,
        thickness,
        phase: seededNoise(index, 19.7) * Math.PI * 2,
        opacity,
      };
      ribbons.push(ribbon);
      return ribbon;
    };
    const addImpactWisp = (index: number, angleOffset: number): void => {
      const material = createSmokeMaterial(seededNoise(index, 23.6), 0.004, 0);
      const mesh = new THREE.Mesh(smokeGeometry, material);
      mesh.visible = false;
      scene.add(mesh);
      impactWisps.push({
        mesh,
        material,
        delay: seededNoise(index, 22.1) * 0.035,
        duration: 0.22 + seededNoise(index, 24.9) * 0.11,
        angle: strikeAngle + angleOffset + (seededNoise(index, 25.7) - 0.5) * 0.2,
        distance: 18 + seededNoise(index, 27.1) * 30,
        size: 26 + seededNoise(index, 28.4) * 24,
        curl: (seededNoise(index, 29.3) - 0.5) * 22,
        rise: 4 + seededNoise(index, 31.4) * 16,
        phase: seededNoise(index, 30.8) * Math.PI * 2,
        opacity: 0.3 + seededNoise(index, 32.2) * 0.18,
      });
    };

    for (let index = 0; index < 64; index += 1) {
      const mesh = new THREE.Mesh(bloodGeometry, bloodMaterial);
      mesh.visible = false;
      scene.add(mesh);
      const lane = (index % 5) - 2;
      bloodDrops.push({
        mesh,
        delay: 0.03 + (index % 32) * 0.0057 + Math.floor(index / 32) * 0.018,
        duration: 0.4 + seededNoise(index, 1.8) * 0.1,
        size: 5.4 + seededNoise(index, 3.4) * 5.6,
        phase: seededNoise(index, 4.8) * Math.PI * 2,
        lateralBias: lane * 11 + (seededNoise(index, 9.2) - 0.5) * 13,
      });
    }
    // Like the existing fireball, the projectile has one compact layered head and a tapered
    // attached wake. It is not a chain of equally-sized clouds spread across the route.
    for (let index = 0; index < 16; index += 1) {
      const puff = addPuff(
        "head",
        index,
        66 + seededNoise(index, 3.8) * 52,
        0.52 + seededNoise(index, 7.2) * 0.2,
        seededNoise(index, 10.7) * 0.014,
      );
      puff.lateralBias = (seededNoise(index, 9.2) - 0.5) * 20;
    }
    for (let index = 0; index < 36; index += 1) {
      const tailProgress = index / 35;
      const puff = addPuff(
        "trail",
        index + 30,
        76 - tailProgress * 34 + seededNoise(index, 3.8) * 24,
        0.32 + (1 - tailProgress) * 0.18 + seededNoise(index, 7.2) * 0.1,
        0.018 + tailProgress * 0.19 + seededNoise(index, 10.7) * 0.008,
      );
      puff.lateralBias = (seededNoise(index, 9.2) - 0.5) * (24 + tailProgress * 14);
    }

    // These overlapping ribbons keep the wake physically connected to the projectile head.
    // Their centers follow the same straight axis; only the smoke texture ripples.
    for (let index = 0; index < 9; index += 1) {
      const ribbon = addRibbon(
        index,
        82 - index * 4 + seededNoise(index, 17.2) * 18,
        28 - index * 1.5 + seededNoise(index, 20.4) * 8,
        0.2 + seededNoise(index, 21.6) * 0.11,
      );
      ribbon.trailOffset = 0.018 + index * 0.018;
      ribbon.lateralBias = (seededNoise(index, 22.8) - 0.5) * 12;
    }

    // Thin branching filaments live inside the smoke mass. They replace the old red/white
    // spheres, which read as floating confetti rather than supernatural energy.
    for (let index = 0; index < 9; index += 1) {
      const vein = addVein(
        index,
        38 + seededNoise(index, 3.1) * 34,
        14 + seededNoise(index, 8.8) * 10,
        0.16 + seededNoise(index, 6.5) * 0.12,
      );
      vein.trailOffset = 0.008 + seededNoise(index, 2.4) * 0.1;
      vein.lateralBias = (seededNoise(index, 7.8) - 0.5) * 16;
    }

    // Small smoke clumps peel away at contact. Their volume expands as they drift, so they
    // read as smoke rather than flat streaks or a radial particle explosion.
    const impactAngleOffsets = [
      -1.4, -1.12, -0.84, -0.58, -0.34, -0.12, 0.14, 0.38,
      0.62, 0.9, 1.18, 1.44, 2.28, 2.62, -2.34, -2.7,
    ];
    impactAngleOffsets.forEach((angleOffset, index) => addImpactWisp(index, angleOffset));

    let elapsed = 0;
    let lastFrameTime = performance.now();
    let animationFrame = 0;
    const tick = (now: number) => {
      const deltaSeconds = Math.min(now - lastFrameTime, 64) / 1000;
      lastFrameTime = now;
      elapsed += deltaSeconds;

      for (const drop of bloodDrops) {
        const localTime = elapsed - drop.delay;
        if (localTime < 0 || localTime > drop.duration) {
          drop.mesh.visible = false;
          continue;
        }
        const progress = Math.min(1, localTime / drop.duration);
        const point = quadraticPoint(life, bloodControl, card, progress);
        const tangent = quadraticTangent(life, bloodControl, card, progress);
        const envelope = Math.sin(Math.PI * progress);
        const ripple = Math.sin(progress * Math.PI * 3.4 + drop.phase) * 6 * envelope;
        const lateral = drop.lateralBias * envelope + ripple;
        const screenX = point.x - tangent.y * lateral;
        const screenY = point.y + tangent.x * lateral;
        const visibleScale = Math.pow(Math.sin(Math.PI * progress), 0.46);
        const stretch = 1 + Math.min(1.15, 0.48 + (1 - progress) * 0.42);

        drop.mesh.visible = true;
        drop.mesh.position.set(screenX, window.innerHeight - screenY, 2);
        drop.mesh.rotation.z = -Math.atan2(tangent.y, tangent.x);
        drop.mesh.scale.set(
          drop.size * visibleScale * stretch,
          drop.size * visibleScale * 0.72,
          drop.size * visibleScale * 0.82,
        );
      }

      const projectileHead = (elapsed - PROJECTILE_LAUNCH_SECONDS) / PROJECTILE_TRAVEL_SECONDS;
      const projectileFade =
        projectileHead <= 0.9
          ? 1
          : Math.max(0, Math.min(1, (1 - projectileHead) / 0.1));
      for (const puff of puffs) {
        const progress = projectileHead - puff.trailOffset;
        if (projectileHead > 1 || progress < 0 || progress > 1) {
          puff.mesh.visible = false;
          puff.material.uniforms.uOpacity.value = 0;
          continue;
        }
        const point = linearPoint(card, target, progress);
        const tangent = strikeTangent;
        const isHead = puff.role === "head";
        const envelope = 0.24 + Math.sin(Math.PI * progress) * 0.62;
        const ripple = Math.sin(progress * Math.PI * 4.2 + puff.phase) * (isHead ? 3.5 : 6.5) * envelope;
        const lateral = puff.lateralBias * envelope + ripple;
        const screenX = point.x - tangent.y * lateral;
        const screenY = point.y + tangent.x * lateral;
        const headWeight = Math.max(0, 1 - puff.trailOffset / 0.22);
        const flutter = 1 + Math.sin(elapsed * (isHead ? 18 : 13) + puff.phase) * (isHead ? 0.1 : 0.16);
        const launchFade = Math.min(1, (projectileHead - puff.trailOffset) / 0.035);
        const width = isHead
          ? puff.size * (1.04 + headWeight * 0.26)
          : puff.size * (1.38 + (1 - headWeight) * 0.5);
        const height = isHead
          ? puff.size * (0.68 + headWeight * 0.16) * flutter
          : puff.size * (0.46 + headWeight * 0.12) * flutter;

        puff.mesh.visible = true;
        puff.mesh.position.set(screenX, window.innerHeight - screenY, 3);
        puff.mesh.rotation.z = -Math.atan2(tangent.y, tangent.x);
        puff.mesh.scale.set(width, height, 1);
        puff.material.uniforms.uTime.value = elapsed;
        puff.material.uniforms.uOpacity.value =
          launchFade *
          projectileFade *
          puff.opacity *
          (isHead ? 0.8 + headWeight * 0.2 : 0.55 + headWeight * 0.34);
      }

      for (const ribbon of ribbons) {
        const progress = projectileHead - ribbon.trailOffset;
        if (projectileHead > 1 || progress < 0 || progress > 1) {
          ribbon.mesh.visible = false;
          ribbon.material.uniforms.uOpacity.value = 0;
          continue;
        }
        const point = linearPoint(card, target, progress);
        const tailWeight = Math.max(0, 1 - ribbon.trailOffset / 0.18);
        const lateral =
          ribbon.lateralBias * (0.35 + Math.sin(Math.PI * progress) * 0.65) +
          Math.sin(elapsed * 16 + ribbon.phase) * 2.5;
        const screenX = point.x - strikeTangent.y * lateral;
        const screenY = point.y + strikeTangent.x * lateral;
        const launchFade = Math.min(1, (projectileHead - ribbon.trailOffset) / 0.028);
        const pulse = 0.92 + Math.sin(elapsed * 15 + ribbon.phase) * 0.08;

        ribbon.mesh.visible = true;
        ribbon.mesh.position.set(screenX, window.innerHeight - screenY, 2.5);
        ribbon.mesh.rotation.z = -strikeAngle;
        ribbon.mesh.scale.set(ribbon.length * pulse, ribbon.thickness * (0.8 + tailWeight * 0.2), 1);
        ribbon.material.uniforms.uTime.value = elapsed;
        ribbon.material.uniforms.uOpacity.value =
          launchFade * projectileFade * ribbon.opacity * (0.58 + tailWeight * 0.42);
      }

      for (const vein of veins) {
        const progress = projectileHead - vein.trailOffset;
        if (projectileHead > 1 || progress < 0 || progress > 1) {
          vein.mesh.visible = false;
          vein.material.uniforms.uOpacity.value = 0;
          continue;
        }
        const point = linearPoint(card, target, progress);
        const tangent = strikeTangent;
        const envelope = 0.26 + Math.sin(Math.PI * progress) * 0.56;
        const ripple = Math.sin(progress * Math.PI * 5.2 + vein.phase) * 3.5 * envelope;
        const lateral = vein.lateralBias * envelope + ripple;
        const screenX = point.x - tangent.y * lateral;
        const screenY = point.y + tangent.x * lateral;
        const launchFade = Math.min(1, (projectileHead - vein.trailOffset) / 0.03);
        const pulse = 0.86 + Math.sin(elapsed * 22 + vein.phase) * 0.14;

        vein.mesh.visible = true;
        vein.mesh.position.set(screenX, window.innerHeight - screenY, 2.8);
        vein.mesh.rotation.z = -Math.atan2(tangent.y, tangent.x);
        vein.mesh.scale.set(vein.length * pulse, vein.thickness * (0.9 + envelope * 0.18), 1);
        vein.material.uniforms.uTime.value = elapsed;
        vein.material.uniforms.uOpacity.value = launchFade * projectileFade * vein.opacity;
      }

      for (const wisp of impactWisps) {
        const localTime = elapsed - PROJECTILE_IMPACT_SECONDS + 0.012 - wisp.delay;
        if (localTime < 0 || localTime > wisp.duration) {
          wisp.mesh.visible = false;
          wisp.material.uniforms.uOpacity.value = 0;
          continue;
        }
        const progress = Math.min(1, localTime / wisp.duration);
        const easedDistance = 1 - Math.pow(1 - progress, 2.4);
        const directionX = Math.cos(wisp.angle);
        const directionY = Math.sin(wisp.angle);
        const curl = Math.sin(Math.PI * progress) * wisp.curl;
        const screenX =
          target.x +
          directionX * wisp.distance * easedDistance -
          directionY * curl;
        const screenY =
          target.y +
          directionY * wisp.distance * easedDistance +
          directionX * curl -
          wisp.rise * progress * progress;
        const fadeIn = Math.min(1, progress / 0.12);
        const fadeOut = Math.pow(1 - progress, 0.62);
        const expansion = 0.32 + (1 - Math.pow(1 - progress, 2)) * 0.96;
        const flutter = 1 + Math.sin(elapsed * 11 + wisp.phase) * 0.09;

        wisp.mesh.visible = true;
        wisp.mesh.position.set(screenX, window.innerHeight - screenY, 6);
        wisp.mesh.rotation.z = -wisp.angle + Math.sin(progress * Math.PI + wisp.phase) * 0.22;
        wisp.mesh.scale.set(
          wisp.size * expansion * (0.86 + progress * 0.16),
          wisp.size * expansion * flutter,
          1,
        );
        wisp.material.uniforms.uTime.value = elapsed;
        wisp.material.uniforms.uOpacity.value = wisp.opacity * fadeIn * fadeOut;
      }

      renderer?.render(scene, camera);
      animationFrame = window.requestAnimationFrame(tick);
    };
    animationFrame = window.requestAnimationFrame(tick);

    const timeline = gsap.timeline();
    timeline
      .to(vignetteElement, { opacity: 1, duration: 0.22, ease: "power2.out" }, 0)
      .call(() => playSfx("bloodSplash2"), [], 0.025)
      .to(cardElement, {
        scale: 1.035,
        filter: "brightness(1.16) saturate(1.08) drop-shadow(0 0 18px rgba(164, 17, 50, 0.72))",
        duration: 0.36,
        ease: "power2.out",
      }, 0.1)
      .call(() => beginStrike(active.id), [], PROJECTILE_LAUNCH_SECONDS - 0.02)
      .call(() => playSfx("activateEffect"), [], PROJECTILE_LAUNCH_SECONDS)
      .to(cardElement, {
        scale: 1.075,
        filter: "brightness(1.38) saturate(0.82) drop-shadow(0 0 30px rgba(137, 15, 43, 0.88))",
        duration: 0.14,
        ease: "power3.out",
      }, PROJECTILE_LAUNCH_SECONDS - 0.02)
      .to(cardElement, { x: -5, duration: 0.032, yoyo: true, repeat: 5, ease: "none" }, PROJECTILE_LAUNCH_SECONDS + 0.1)
      .call(() => {
        beginImpact(active.id);
        playSfx("attack");
      }, [], PROJECTILE_IMPACT_SECONDS)
      .to(cardElement, {
        x: 0,
        scale: 1,
        filter: "none",
        duration: 0.3,
        ease: "power2.out",
      }, PROJECTILE_IMPACT_SECONDS + 0.07)
      .to(cardElement, {
        scale: 0.2,
        opacity: 0,
        rotation: -2,
        filter: "brightness(1.45) saturate(0.18) blur(13px)",
        duration: 0.24,
        ease: "back.in(1.25)",
      }, 1.34)
      .to(vignetteElement, { opacity: 0, duration: 0.35, ease: "power1.out" }, 1.25)
      .call(() => complete(active.id), [], 1.68);

    return () => {
      timeline.kill();
      window.cancelAnimationFrame(animationFrame);
      for (const puff of puffs) {
        scene.remove(puff.mesh);
        puff.material.dispose();
      }
      for (const drop of bloodDrops) scene.remove(drop.mesh);
      for (const vein of veins) {
        scene.remove(vein.mesh);
        vein.material.dispose();
      }
      for (const ribbon of ribbons) {
        scene.remove(ribbon.mesh);
        ribbon.material.dispose();
      }
      for (const wisp of impactWisps) {
        scene.remove(wisp.mesh);
        wisp.material.dispose();
      }
      smokeGeometry.dispose();
      bloodGeometry.dispose();
      bloodMaterial.dispose();
      renderer?.dispose();
    };
  }, [active?.id, beginImpact, beginStrike, complete, playSfx]);

  if (!active || typeof document === "undefined") return null;
  const showFullImage = shouldShowFullCardImage(active.card.definitionId);

  return createPortal(
    <>
      <div ref={vignetteRef} className="final-banquet-vignette" aria-hidden="true" />
      <div key={active.id} className="final-banquet-animation-layer" aria-hidden="true">
        <canvas ref={threeCanvasRef} className="final-banquet-three-canvas" />
        <div ref={cardRef} className="final-banquet-card-host">
          <div className="final-banquet-card-shell">
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
            <span className="final-banquet-card-veins" />
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

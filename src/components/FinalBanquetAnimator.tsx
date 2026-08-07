import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";
import * as THREE from "three";
import { useAudioStore } from "../store/useAudioStore";
import { useGameStore } from "../store/useGameStore";
import { shouldShowFullCardImage } from "../utils/cardImages";
import { Card } from "./Card";
import { renderSharedVfxFrame } from "./sharedVfxRenderer";

type ScreenPoint = { x: number; y: number };
type BloodDrop = {
  mesh: THREE.Mesh;
  delay: number;
  duration: number;
  size: number;
  phase: number;
  lateralBias: number;
};
type BoltLayer = {
  mesh: THREE.Mesh;
  geometry: THREE.BufferGeometry;
  positionAttribute: THREE.BufferAttribute;
  material: THREE.MeshBasicMaterial;
  width: number;
  opacity: number;
};
type LightningBolt = {
  core: BoltLayer;
  glow: BoltLayer;
  seed: number;
  lane: number;
};
type LightningBranch = LightningBolt & {
  index: number;
  parentSeed: number;
  parentLane: number;
};
type ElectricSpark = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  delay: number;
  duration: number;
  angle: number;
  distance: number;
  length: number;
  thickness: number;
};

const LIGHTNING_LAUNCH_SECONDS = 0.68;
const LIGHTNING_TRAVEL_SECONDS = 0.24;
const LIGHTNING_IMPACT_SECONDS = LIGHTNING_LAUNCH_SECONDS + LIGHTNING_TRAVEL_SECONDS;
const LIGHTNING_AFTERGLOW_SECONDS = 0.34;
const MAX_LIGHTNING_SEGMENTS = 16;

function seededNoise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - clamp01(value), 3);
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

function createBoltLayer(
  scene: THREE.Scene,
  color: number,
  width: number,
  opacity: number,
  renderOrder: number,
): BoltLayer {
  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(
    new Float32Array((MAX_LIGHTNING_SEGMENTS + 1) * 2 * 3),
    3,
  );
  const indices: number[] = [];
  for (let index = 0; index < MAX_LIGHTNING_SEGMENTS; index += 1) {
    const vertex = index * 2;
    indices.push(vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2);
  }
  geometry.setAttribute("position", positionAttribute);
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.visible = false;
  mesh.renderOrder = renderOrder;
  scene.add(mesh);
  return { mesh, geometry, positionAttribute, material, width, opacity };
}

function createLightningBolt(scene: THREE.Scene, seed: number, lane: number, scale = 1): LightningBolt {
  return {
    glow: createBoltLayer(scene, 0xa83cff, 22 * scale, 0.48, 5),
    core: createBoltLayer(scene, 0xffefff, 5.5 * scale, 1, 7),
    seed,
    lane,
  };
}

function setBoltLayer(
  layer: BoltLayer,
  screenPoints: ScreenPoint[],
  opacity: number,
  viewportHeight: number,
): void {
  if (screenPoints.length < 2 || opacity <= 0.005) {
    layer.mesh.visible = false;
    layer.material.opacity = 0;
    return;
  }

  const positions = layer.positionAttribute.array as Float32Array;
  for (let index = 0; index < screenPoints.length; index += 1) {
    const previous = screenPoints[Math.max(0, index - 1)];
    const next = screenPoints[Math.min(screenPoints.length - 1, index + 1)];
    const tangentX = next.x - previous.x;
    const tangentY = next.y - previous.y;
    const tangentLength = Math.hypot(tangentX, tangentY) || 1;
    const normalX = -tangentY / tangentLength;
    const normalY = tangentX / tangentLength;
    const halfWidth = layer.width / 2;
    const point = screenPoints[index];

    const offset = index * 6;
    positions[offset] = point.x + normalX * halfWidth;
    positions[offset + 1] = viewportHeight - (point.y + normalY * halfWidth);
    positions[offset + 2] = 5;
    positions[offset + 3] = point.x - normalX * halfWidth;
    positions[offset + 4] = viewportHeight - (point.y - normalY * halfWidth);
    positions[offset + 5] = 5;
  }

  layer.positionAttribute.needsUpdate = true;
  layer.geometry.setDrawRange(0, (screenPoints.length - 1) * 6);
  layer.mesh.visible = true;
  layer.material.opacity = opacity * layer.opacity;
}

function setLightningBolt(
  bolt: LightningBolt,
  points: ScreenPoint[],
  opacity: number,
  viewportHeight: number,
): void {
  setBoltLayer(bolt.glow, points, opacity, viewportHeight);
  setBoltLayer(bolt.core, points, opacity, viewportHeight);
}

function buildLightningPath(
  start: ScreenPoint,
  end: ScreenPoint,
  reveal: number,
  seed: number,
  lane: number,
  epoch: number,
  segmentCount = 16,
): ScreenPoint[] {
  const visibleProgress = clamp01(reveal);
  if (visibleProgress <= 0) return [];
  const tangent = linearTangent(start, end);
  const visibleSegments = Math.max(1, Math.ceil(segmentCount * visibleProgress));
  const points: ScreenPoint[] = [];

  for (let index = 0; index <= visibleSegments; index += 1) {
    const progress = index === visibleSegments
      ? visibleProgress
      : Math.min(visibleProgress, index / segmentCount);
    const base = linearPoint(start, end, progress);
    const endLock = Math.sin(Math.PI * progress);
    const coarseJitter = (seededNoise(index + epoch * 19.1, seed + 2.7) - 0.5) * 48;
    const fineJitter = Math.sin(index * 2.8 + seed * 8.4 + epoch * 1.7) * 10;
    const offset = (coarseJitter + fineJitter + lane) * endLock;
    points.push({
      x: base.x - tangent.y * offset,
      y: base.y + tangent.x * offset,
    });
  }

  return points;
}

function buildOrganicBranchPath(
  source: ScreenPoint,
  target: ScreenPoint,
  branch: LightningBranch,
  reveal: number,
  epoch: number,
): ScreenPoint[] {
  // Hold one irregular topology for a few flicker frames so the forks read as lightning
  // instead of a fixed alternating fan or rapidly moving noise.
  const topologyEpoch = Math.floor(epoch / 3);
  if (seededNoise(branch.index + topologyEpoch * 7.3, branch.seed + 71.4) < 0.24) return [];

  const startFraction = 0.14 + seededNoise(branch.index + topologyEpoch * 5.1, branch.seed + 13.8) * 0.7;
  if (reveal <= startFraction) return [];

  const parentPath = buildLightningPath(
    source,
    target,
    startFraction,
    branch.parentSeed,
    branch.parentLane,
    epoch,
  );
  const start = parentPath[parentPath.length - 1];
  if (!start) return [];

  const routeTangent = linearTangent(source, target);
  const direction = seededNoise(branch.index + topologyEpoch * 11.7, branch.seed + 24.6) > 0.5 ? 1 : -1;
  const forward = 20 + seededNoise(branch.index + topologyEpoch * 13.1, branch.seed + 38.2) * 58;
  const sideways = direction * (42 + seededNoise(branch.index + topologyEpoch * 17.9, branch.seed + 49.5) * 74);
  const end = {
    x: start.x + routeTangent.x * forward - routeTangent.y * sideways,
    y: start.y + routeTangent.y * forward + routeTangent.x * sideways,
  };
  const branchProgress = clamp01((reveal - startFraction) / (0.12 + forward / 520));

  return buildLightningPath(
    start,
    end,
    branchProgress,
    branch.seed + topologyEpoch * 0.37,
    0,
    epoch,
    6,
  );
}

function disposeLightningBolt(scene: THREE.Scene, bolt: LightningBolt): void {
  for (const layer of [bolt.core, bolt.glow]) {
    scene.remove(layer.mesh);
    layer.geometry.dispose();
    layer.material.dispose();
  }
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

    cardElement.style.left = `${origin.left}px`;
    cardElement.style.top = `${origin.top}px`;
    cardElement.style.width = `${origin.width}px`;
    cardElement.style.height = `${origin.height}px`;
    vignetteElement.style.setProperty("--final-banquet-target-x", `${target.x}px`);
    vignetteElement.style.setProperty("--final-banquet-target-y", `${target.y}px`);

    gsap.set(cardElement, { opacity: 1, scale: 1, rotation: 0, filter: "none", transformOrigin: "50% 50%" });
    gsap.set(vignetteElement, { opacity: 0 });

    const scene = new THREE.Scene();
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const camera = new THREE.OrthographicCamera(0, width, height, 0, -100, 100);
    camera.position.z = 10;

    scene.add(new THREE.AmbientLight(0xffffff, 0.42));
    const bloodLight = new THREE.PointLight(0xff264d, 3.8, Math.max(window.innerWidth, window.innerHeight));
    bloodLight.position.set(card.x, window.innerHeight - card.y, 38);
    scene.add(bloodLight);
    const lightningLight = new THREE.PointLight(0xa333ff, 0, Math.max(window.innerWidth, window.innerHeight));
    lightningLight.position.set(target.x, window.innerHeight - target.y, 42);
    scene.add(lightningLight);

    const bloodGeometry = new THREE.SphereGeometry(1, 14, 12);
    const bloodMaterial = new THREE.MeshPhongMaterial({
      color: 0x8f001d,
      emissive: 0x2d0009,
      specular: 0xff8ca1,
      shininess: 150,
      transparent: true,
      opacity: 0.96,
    });
    const bloodDrops: BloodDrop[] = [];
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

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const mainBolts = [
      createLightningBolt(scene, 1.7, -7),
      createLightningBolt(scene, 4.3, 5),
      ...(reducedMotion ? [] : [createLightningBolt(scene, 8.9, 1)]),
    ];
    const branches: LightningBranch[] = Array.from(
      { length: reducedMotion ? 3 : 7 },
      (_, index) => {
        const parent = mainBolts[index % mainBolts.length];
        return {
          ...createLightningBolt(scene, 12.4 + index * 2.3, 0, 0.55),
          index,
          parentSeed: parent.seed,
          parentLane: parent.lane,
        };
      },
    );

    const sparkGeometry = new THREE.PlaneGeometry(1, 1);
    const sparks: ElectricSpark[] = [];
    const sparkCount = reducedMotion ? 12 : 28;
    for (let index = 0; index < sparkCount; index += 1) {
      const material = new THREE.MeshBasicMaterial({
        color: index % 4 === 0 ? 0xf3ddff : 0xa333ff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(sparkGeometry, material);
      mesh.visible = false;
      mesh.renderOrder = 8;
      scene.add(mesh);
      sparks.push({
        mesh,
        material,
        delay: seededNoise(index, 18.2) * 0.06,
        duration: 0.2 + seededNoise(index, 20.7) * 0.18,
        angle: (index / sparkCount) * Math.PI * 2 + (seededNoise(index, 21.8) - 0.5) * 0.48,
        distance: 38 + seededNoise(index, 24.1) * 92,
        length: 18 + seededNoise(index, 27.5) * 34,
        thickness: 1.8 + seededNoise(index, 29.4) * 3.4,
      });
    }

    const ringGeometry = new THREE.RingGeometry(0.76, 1, 64);
    const impactRings = [0, 1].map((index) => {
      const material = new THREE.MeshBasicMaterial({
        color: index === 0 ? 0xd997ff : 0x7620ff,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.Mesh(ringGeometry, material);
      mesh.visible = false;
      mesh.position.set(target.x, window.innerHeight - target.y, 6);
      mesh.renderOrder = 6;
      scene.add(mesh);
      return { mesh, material, delay: index * 0.045 };
    });

    const orbGeometry = new THREE.CircleGeometry(1, 48);
    const orbMaterial = new THREE.MeshBasicMaterial({
      color: 0xb44cff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    const chargeOrb = new THREE.Mesh(orbGeometry, orbMaterial);
    chargeOrb.position.set(card.x, window.innerHeight - card.y, 4);
    chargeOrb.visible = false;
    scene.add(chargeOrb);

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
        const progress = clamp01(localTime / drop.duration);
        const point = quadraticPoint(life, bloodControl, card, progress);
        const tangent = quadraticTangent(life, bloodControl, card, progress);
        const envelope = Math.sin(Math.PI * progress);
        const ripple = Math.sin(progress * Math.PI * 3.4 + drop.phase) * 6 * envelope;
        const lateral = drop.lateralBias * envelope + ripple;
        const visibleScale = Math.pow(Math.sin(Math.PI * progress), 0.46);
        const stretch = 1 + Math.min(1.15, 0.48 + (1 - progress) * 0.42);

        drop.mesh.visible = true;
        drop.mesh.position.set(
          point.x - tangent.y * lateral,
          window.innerHeight - (point.y + tangent.x * lateral),
          2,
        );
        drop.mesh.rotation.z = -Math.atan2(tangent.y, tangent.x);
        drop.mesh.scale.set(
          drop.size * visibleScale * stretch,
          drop.size * visibleScale * 0.72,
          drop.size * visibleScale * 0.82,
        );
      }

      const chargeProgress = clamp01((elapsed - 0.36) / (LIGHTNING_LAUNCH_SECONDS - 0.36));
      const chargePulse = 0.72 + Math.sin(elapsed * 38) * 0.18;
      chargeOrb.visible = chargeProgress > 0 && elapsed < LIGHTNING_IMPACT_SECONDS + 0.06;
      chargeOrb.scale.setScalar(18 + chargeProgress * 42);
      orbMaterial.opacity = chargeProgress * chargePulse * 0.34;

      const lightningTime = elapsed - LIGHTNING_LAUNCH_SECONDS;
      const reveal = clamp01(lightningTime / LIGHTNING_TRAVEL_SECONDS);
      const afterImpact = Math.max(0, elapsed - LIGHTNING_IMPACT_SECONDS);
      const sustain = lightningTime < 0
        ? 0
        : afterImpact <= 0
          ? 1
          : clamp01(1 - afterImpact / LIGHTNING_AFTERGLOW_SECONDS);
      const epoch = Math.floor(Math.max(0, lightningTime) / 0.038);
      const globalFlicker = 0.78 + seededNoise(epoch, 41.3) * 0.22;

      for (const bolt of mainBolts) {
        const points = buildLightningPath(card, target, reveal, bolt.seed, bolt.lane, epoch);
        const boltFlicker = 0.8 + seededNoise(epoch, bolt.seed + 53.1) * 0.2;
        setLightningBolt(bolt, points, sustain * globalFlicker * boltFlicker, window.innerHeight);
      }
      for (const branch of branches) {
        const points = buildOrganicBranchPath(card, target, branch, reveal, epoch);
        const branchFlicker = 0.58 + seededNoise(epoch, branch.seed + 62.7) * 0.42;
        setLightningBolt(branch, points, sustain * globalFlicker * branchFlicker * 0.78, window.innerHeight);
      }

      lightningLight.intensity = lightningTime < 0
        ? 0
        : afterImpact <= 0
          ? reveal * 3.2 * globalFlicker
          : afterImpact < 0.18
            ? Math.max(0, (1 - afterImpact / 0.18) * 8.4 * globalFlicker)
            : 0;

      for (const spark of sparks) {
        const localTime = elapsed - LIGHTNING_IMPACT_SECONDS - spark.delay;
        if (localTime < 0 || localTime > spark.duration) {
          spark.mesh.visible = false;
          spark.material.opacity = 0;
          continue;
        }
        const progress = clamp01(localTime / spark.duration);
        const distance = easeOutCubic(progress) * spark.distance;
        const opacity = Math.pow(1 - progress, 0.8);
        const screenX = target.x + Math.cos(spark.angle) * distance;
        const screenY = target.y + Math.sin(spark.angle) * distance;
        spark.mesh.visible = true;
        spark.mesh.position.set(screenX, window.innerHeight - screenY, 8);
        spark.mesh.rotation.z = -spark.angle;
        spark.mesh.scale.set(spark.length * (1 - progress * 0.38), spark.thickness, 1);
        spark.material.opacity = opacity * 0.92;
      }

      for (const ring of impactRings) {
        const localTime = elapsed - LIGHTNING_IMPACT_SECONDS - ring.delay;
        if (localTime < 0 || localTime > 0.3) {
          ring.mesh.visible = false;
          ring.material.opacity = 0;
          continue;
        }
        const progress = clamp01(localTime / 0.3);
        ring.mesh.visible = true;
        ring.mesh.scale.setScalar(18 + easeOutCubic(progress) * 88);
        ring.material.opacity = Math.pow(1 - progress, 1.25) * 0.78;
      }

      renderSharedVfxFrame(threeCanvas, {
        scene,
        camera,
        width,
        height,
        pixelRatio,
        // El renderer anterior usaba el valor lineal predeterminado de Three.js.
        outputEncoding: THREE.LinearEncoding,
      });
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
      .call(() => beginStrike(active.id), [], LIGHTNING_LAUNCH_SECONDS - 0.02)
      .call(() => playSfx("activateEffect", { rate: 1.18 }), [], LIGHTNING_LAUNCH_SECONDS)
      .to(cardElement, {
        scale: 1.075,
        filter: "brightness(1.48) saturate(1.2) drop-shadow(0 0 34px rgba(164, 55, 255, 0.96))",
        duration: 0.12,
        ease: "power3.out",
      }, LIGHTNING_LAUNCH_SECONDS - 0.02)
      .to(cardElement, { x: -4, duration: 0.026, yoyo: true, repeat: 7, ease: "none" }, LIGHTNING_LAUNCH_SECONDS + 0.04)
      .call(() => {
        beginImpact(active.id);
        playSfx("attack", { rate: 1.12 });
      }, [], LIGHTNING_IMPACT_SECONDS)
      .to(cardElement, {
        x: 0,
        scale: 1,
        filter: "none",
        duration: 0.28,
        ease: "power2.out",
      }, LIGHTNING_IMPACT_SECONDS + 0.07)
      .to(cardElement, {
        scale: 0.2,
        opacity: 0,
        rotation: -2,
        filter: "brightness(1.45) saturate(0.18) blur(13px)",
        duration: 0.24,
        ease: "back.in(1.25)",
      }, 1.3)
      .to(vignetteElement, { opacity: 0, duration: 0.35, ease: "power1.out" }, 1.22)
      .call(() => complete(active.id), [], 1.64);

    return () => {
      timeline.kill();
      window.cancelAnimationFrame(animationFrame);
      for (const drop of bloodDrops) scene.remove(drop.mesh);
      for (const bolt of mainBolts) disposeLightningBolt(scene, bolt);
      for (const branch of branches) disposeLightningBolt(scene, branch);
      for (const spark of sparks) {
        scene.remove(spark.mesh);
        spark.material.dispose();
      }
      for (const ring of impactRings) {
        scene.remove(ring.mesh);
        ring.material.dispose();
      }
      scene.remove(chargeOrb);
      bloodGeometry.dispose();
      bloodMaterial.dispose();
      sparkGeometry.dispose();
      ringGeometry.dispose();
      orbGeometry.dispose();
      orbMaterial.dispose();
      // El renderer es compartido y sobrevive al efecto; sólo se liberan sus recursos propios.
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
              suppressStabilizing
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

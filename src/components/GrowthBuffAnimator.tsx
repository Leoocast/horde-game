import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { BuffAnimationVariant } from "../store/buffAnimation";

type GrowthBuffVariant = Exclude<BuffAnimationVariant, "default">;
export type NatureRootPattern = "growth" | "shield";

export type NatureRootAnimatorProps = {
  eventId: number;
  variant: GrowthBuffVariant;
  pattern: NatureRootPattern;
};

type GrowthConfig = {
  duration: number;
  rootCount: number;
  leafCount: number;
  rootWidth: number;
  leafScale: number;
  opacity: number;
  colors: {
    rootBase: number;
    rootTip: number;
    glow: number;
    leaves: number[];
  };
};

type RootSpec = {
  points: THREE.Vector3[];
  delay: number;
  growDuration: number;
  widthScale: number;
};

type RootStrand = {
  curve: THREE.CatmullRomCurve3;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  glow: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  material: THREE.MeshBasicMaterial;
  glowMaterial: THREE.MeshBasicMaterial;
  indexCount: number;
  segments: number;
  delay: number;
  growDuration: number;
};

type LeafParticle = {
  group: THREE.Group;
  blade: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  vein: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  delay: number;
  life: number;
  position: THREE.Vector3;
  rotation: number;
  size: number;
  phase: number;
};

type RisingLeafParticle = {
  group: THREE.Group;
  blade: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>;
  vein: THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>;
  delay: number;
  life: number;
  startX: number;
  startY: number;
  rise: number;
  drift: number;
  rotation: number;
  turn: number;
  size: number;
};

const GROWTH_CONFIGS: Record<GrowthBuffVariant, GrowthConfig> = {
  "growth-preview": {
    duration: 0.72,
    rootCount: 5,
    leafCount: 6,
    rootWidth: 1.8,
    leafScale: 0.72,
    opacity: 0.46,
    colors: {
      rootBase: 0x5a4727,
      rootTip: 0x79ad40,
      glow: 0x8bda48,
      leaves: [0x73b347, 0xa3d869],
    },
  },
  "growth-soft": {
    duration: 0.94,
    rootCount: 8,
    leafCount: 12,
    rootWidth: 2.5,
    leafScale: 0.9,
    opacity: 0.8,
    colors: {
      rootBase: 0x624b28,
      rootTip: 0x7fb740,
      glow: 0x91dd4a,
      leaves: [0x68a83d, 0x91ca55, 0xc1e66f],
    },
  },
  "growth-strong": {
    duration: 1.08,
    rootCount: 12,
    leafCount: 24,
    rootWidth: 3.3,
    leafScale: 1.08,
    opacity: 1,
    colors: {
      rootBase: 0x60451f,
      rootTip: 0x8fc448,
      glow: 0xa6eb58,
      leaves: [0x5e9d36, 0x7fbd43, 0xa7d85c, 0xd5eb78],
    },
  },
  "growth-feral": {
    duration: 0.86,
    rootCount: 11,
    leafCount: 19,
    rootWidth: 3.1,
    leafScale: 1.02,
    opacity: 0.96,
    colors: {
      rootBase: 0x4e3b1d,
      rootTip: 0x70ae36,
      glow: 0x82d93e,
      leaves: [0x4e9130, 0x70b63a, 0x9bd34b, 0xc7df61],
    },
  },
};

function seededNoise(index: number, salt: number): number {
  const value = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeInOutCubic(value: number): number {
  return value < 0.5
    ? 4 * value * value * value
    : 1 - Math.pow(-2 * value + 2, 3) / 2;
}

function createLeafGeometry(): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.6);
  shape.bezierCurveTo(-0.56, -0.36, -0.7, 0.18, 0, 0.72);
  shape.bezierCurveTo(0.7, 0.18, 0.56, -0.36, 0, -0.6);
  return new THREE.ShapeGeometry(shape, 6);
}

function createVeinGeometry(): THREE.BufferGeometry {
  return new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, -0.43, 0.02),
    new THREE.Vector3(0, 0.52, 0.02),
  ]);
}

function createGlowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgba(221, 255, 145, 0.94)");
    gradient.addColorStop(0.22, "rgba(142, 218, 76, 0.62)");
    gradient.addColorStop(0.58, "rgba(70, 135, 43, 0.2)");
    gradient.addColorStop(1, "rgba(38, 80, 30, 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/** Builds a tapered ribbon instead of a WebGL line, keeping roots thick and organic at every
 *  refresh rate and browser. Each curve segment owns six indices, so drawRange can reveal it
 *  progressively from the base to its growing tip. */
function createRootGeometry(
  curve: THREE.CatmullRomCurve3,
  segments: number,
  width: number,
  rootBase: number,
  rootTip: number,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const startColor = new THREE.Color(rootBase);
  const endColor = new THREE.Color(rootTip);

  for (let index = 0; index <= segments; index += 1) {
    const progress = index / segments;
    const point = curve.getPoint(progress);
    const tangent = curve.getTangent(progress).normalize();
    const normalX = -tangent.y;
    const normalY = tangent.x;
    const taper = 1 - progress * 0.72;
    const halfWidth = Math.max(0.32, width * taper) / 2;
    const tone = new THREE.Color().lerpColors(startColor, endColor, 0.16 + progress * 0.84);

    positions.push(
      point.x + normalX * halfWidth,
      point.y + normalY * halfWidth,
      point.z,
      point.x - normalX * halfWidth,
      point.y - normalY * halfWidth,
      point.z,
    );
    colors.push(tone.r, tone.g, tone.b, tone.r, tone.g, tone.b);

    if (index < segments) {
      const left = index * 2;
      const right = left + 1;
      const nextLeft = left + 2;
      const nextRight = left + 3;
      indices.push(left, right, nextLeft, right, nextRight, nextLeft);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.setDrawRange(0, 0);
  return geometry;
}

/** Preserved natural-shield silhouette: roots close around the perimeter and meet over the card. */
function shieldRootPathSpecs(width: number, height: number, config: GrowthConfig): RootSpec[] {
  const centerX = width * 0.5;
  const groundY = height * 0.145;
  const left = width * 0.18;
  const right = width * 0.82;
  const rootDuration = config.duration * 0.58;
  const point = (x: number, y: number, z = 1) => new THREE.Vector3(width * x, height * y, z);

  return [
    {
      points: [
        new THREE.Vector3(centerX - width * 0.035, groundY, 1),
        point(0.39, 0.2),
        point(0.28, 0.31),
        point(0.2, 0.47),
        new THREE.Vector3(left + width * 0.018, height * 0.65, 1),
        point(0.22, 0.79),
      ],
      delay: 0,
      growDuration: rootDuration,
      widthScale: 1.18,
    },
    {
      points: [
        new THREE.Vector3(centerX + width * 0.035, groundY, 1),
        point(0.61, 0.2),
        point(0.72, 0.31),
        point(0.8, 0.47),
        new THREE.Vector3(right - width * 0.018, height * 0.65, 1),
        point(0.78, 0.79),
      ],
      delay: 0.018,
      growDuration: rootDuration,
      widthScale: 1.18,
    },
    {
      points: [point(0.41, 0.2), point(0.31, 0.18), point(0.21, 0.19), point(0.1, 0.16)],
      delay: 0.035,
      growDuration: rootDuration * 0.58,
      widthScale: 0.74,
    },
    {
      points: [point(0.59, 0.2), point(0.69, 0.18), point(0.79, 0.19), point(0.9, 0.16)],
      delay: 0.05,
      growDuration: rootDuration * 0.58,
      widthScale: 0.74,
    },
    {
      points: [point(0.27, 0.34), point(0.33, 0.43), point(0.42, 0.52), point(0.48, 0.64)],
      delay: 0.16,
      growDuration: rootDuration * 0.64,
      widthScale: 0.68,
    },
    {
      points: [point(0.73, 0.34), point(0.67, 0.43), point(0.58, 0.52), point(0.52, 0.64)],
      delay: 0.18,
      growDuration: rootDuration * 0.64,
      widthScale: 0.68,
    },
    {
      points: [point(0.2, 0.59), point(0.13, 0.64), point(0.11, 0.72)],
      delay: 0.28,
      growDuration: rootDuration * 0.42,
      widthScale: 0.5,
    },
    {
      points: [point(0.8, 0.59), point(0.87, 0.64), point(0.89, 0.72)],
      delay: 0.29,
      growDuration: rootDuration * 0.42,
      widthScale: 0.5,
    },
    {
      points: [point(0.22, 0.77), point(0.34, 0.82), point(0.49, 0.81)],
      delay: 0.34,
      growDuration: rootDuration * 0.5,
      widthScale: 0.6,
    },
    {
      points: [point(0.78, 0.77), point(0.66, 0.82), point(0.51, 0.81)],
      delay: 0.35,
      growDuration: rootDuration * 0.5,
      widthScale: 0.6,
    },
  ].slice(0, config.rootCount);
}

/** Growth silhouette: several roots erupt through the card and fan outward as they rise. Unlike
 *  the shield path, no strand follows or closes the perimeter. */
function growthRootPathSpecs(width: number, height: number, config: GrowthConfig): RootSpec[] {
  const rootDuration = config.duration * 0.6;
  const point = (x: number, y: number, z = 1) => new THREE.Vector3(width * x, height * y, z);

  return [
    {
      points: [point(0.5, 0.145), point(0.41, 0.13), point(0.3, 0.15), point(0.18, 0.135)],
      delay: 0,
      growDuration: rootDuration * 0.46,
      widthScale: 0.84,
    },
    {
      points: [point(0.5, 0.145), point(0.59, 0.13), point(0.7, 0.15), point(0.82, 0.135)],
      delay: 0.015,
      growDuration: rootDuration * 0.46,
      widthScale: 0.84,
    },
    {
      points: [point(0.49, 0.14), point(0.46, 0.3), point(0.53, 0.48), point(0.48, 0.68), point(0.52, 0.91)],
      delay: 0,
      growDuration: rootDuration,
      widthScale: 1.34,
    },
    {
      points: [point(0.36, 0.15), point(0.35, 0.29), point(0.34, 0.48), point(0.27, 0.68), point(0.17, 0.86)],
      delay: 0.025,
      growDuration: rootDuration * 0.94,
      widthScale: 1.06,
    },
    {
      points: [point(0.64, 0.15), point(0.65, 0.29), point(0.66, 0.48), point(0.73, 0.68), point(0.83, 0.86)],
      delay: 0.04,
      growDuration: rootDuration * 0.94,
      widthScale: 1.06,
    },
    {
      points: [point(0.22, 0.15), point(0.27, 0.28), point(0.25, 0.46), point(0.2, 0.62), point(0.1, 0.75)],
      delay: 0.075,
      growDuration: rootDuration * 0.8,
      widthScale: 0.8,
    },
    {
      points: [point(0.78, 0.15), point(0.73, 0.28), point(0.75, 0.46), point(0.8, 0.62), point(0.9, 0.75)],
      delay: 0.09,
      growDuration: rootDuration * 0.8,
      widthScale: 0.8,
    },
    {
      points: [point(0.46, 0.34), point(0.39, 0.47), point(0.32, 0.57), point(0.22, 0.63)],
      delay: 0.19,
      growDuration: rootDuration * 0.52,
      widthScale: 0.66,
    },
    {
      points: [point(0.54, 0.39), point(0.61, 0.51), point(0.69, 0.61), point(0.8, 0.68)],
      delay: 0.21,
      growDuration: rootDuration * 0.52,
      widthScale: 0.66,
    },
    {
      points: [point(0.34, 0.48), point(0.28, 0.62), point(0.24, 0.76), point(0.26, 0.9)],
      delay: 0.25,
      growDuration: rootDuration * 0.57,
      widthScale: 0.6,
    },
    {
      points: [point(0.66, 0.48), point(0.72, 0.62), point(0.76, 0.76), point(0.74, 0.9)],
      delay: 0.27,
      growDuration: rootDuration * 0.57,
      widthScale: 0.6,
    },
    {
      points: [point(0.5, 0.55), point(0.57, 0.67), point(0.62, 0.78), point(0.61, 0.93)],
      delay: 0.3,
      growDuration: rootDuration * 0.54,
      widthScale: 0.56,
    },
  ].slice(0, config.rootCount);
}

export function NatureRootAnimator({
  eventId,
  variant,
  pattern,
}: NatureRootAnimatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const config = GROWTH_CONFIGS[variant];
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -100, 100);
    camera.position.z = 10;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas,
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
      });
    } catch {
      canvas.classList.add("growth-buff-three-unavailable");
      return;
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputEncoding = THREE.sRGBEncoding;

    let width = 1;
    let height = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      camera.left = 0;
      camera.right = width;
      camera.top = height;
      camera.bottom = 0;
      camera.updateProjectionMatrix();
      renderer.setSize(Math.round(width), Math.round(height), false);
    };
    resize();
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(resize);
    resizeObserver?.observe(canvas);

    const salt = (eventId % 997) * 0.013 + variant.length;
    const roots: RootStrand[] = [];
    const rootSpecs =
      pattern === "shield"
        ? shieldRootPathSpecs(width, height, config)
        : growthRootPathSpecs(width, height, config);
    const rootSegments = reducedMotion ? 18 : 48;

    for (const spec of rootSpecs) {
      const curve = new THREE.CatmullRomCurve3(spec.points, false, "centripetal", 0.36);
      const rootGeometry = createRootGeometry(
        curve,
        rootSegments,
        config.rootWidth * spec.widthScale,
        config.colors.rootBase,
        config.colors.rootTip,
      );
      const glowGeometry = createRootGeometry(
        curve,
        rootSegments,
        config.rootWidth * spec.widthScale * 2.35,
        config.colors.glow,
        config.colors.glow,
      );
      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const glowMaterial = new THREE.MeshBasicMaterial({
        color: config.colors.glow,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const glow = new THREE.Mesh(glowGeometry, glowMaterial);
      const mesh = new THREE.Mesh(rootGeometry, material);
      glow.position.z = 0.5;
      mesh.position.z = 1;
      scene.add(glow, mesh);
      roots.push({
        curve,
        mesh,
        glow,
        material,
        glowMaterial,
        indexCount: rootSegments * 6,
        segments: rootSegments,
        delay: spec.delay,
        growDuration: spec.growDuration,
      });
    }

    const leafGeometry = createLeafGeometry();
    const veinGeometry = createVeinGeometry();
    const leaves: LeafParticle[] = [];
    const risingLeaves: RisingLeafParticle[] = [];
    const leafCount = reducedMotion ? Math.min(5, config.leafCount) : config.leafCount;

    for (let index = 0; index < leafCount; index += 1) {
      const rootIndex =
        pattern === "shield"
          ? (index * 5 + 1) % roots.length
          : (index * 7 + 2) % roots.length;
      const root = roots[rootIndex];
      const anchor = 0.28 + seededNoise(index, salt + 2.7) * 0.68;
      const position = root.curve.getPoint(anchor);
      const tangent = root.curve.getTangent(anchor).normalize();
      const side = seededNoise(index, salt + 4.1) > 0.5 ? 1 : -1;
      const normal = new THREE.Vector3(-tangent.y, tangent.x, 0);
      position.addScaledVector(normal, side * (1.6 + seededNoise(index, salt + 5.8) * 2.8));

      const tone = config.colors.leaves[index % config.colors.leaves.length];
      const bladeMaterial = new THREE.MeshBasicMaterial({
        color: tone,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const veinMaterial = new THREE.LineBasicMaterial({
        color: index % 5 === 4 ? 0xe5db8a : 0xd2ef9a,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      const blade = new THREE.Mesh(leafGeometry, bladeMaterial);
      const vein = new THREE.Line(veinGeometry, veinMaterial);
      const group = new THREE.Group();
      group.visible = false;
      group.add(blade, vein);
      group.position.z = 3 + seededNoise(index, salt + 8.2);
      scene.add(group);

      const delay =
        root.delay +
        root.growDuration * anchor * 0.82 +
        seededNoise(index, salt + 9.3) * 0.055;
      leaves.push({
        group,
        blade,
        vein,
        delay,
        life: Math.max(0.3, config.duration - delay - 0.025),
        position,
        rotation:
          Math.atan2(tangent.y, tangent.x) -
          Math.PI / 2 +
          side * (0.62 + seededNoise(index, salt + 10.8) * 0.46),
        size: (8.5 + seededNoise(index, salt + 12.4) * 8.5) * config.leafScale,
        phase: seededNoise(index, salt + 13.7) * Math.PI * 2,
      });
    }

    const risingLeafCount =
      pattern === "growth"
        ? reducedMotion
          ? Math.min(3, Math.ceil(config.leafCount * 0.42))
          : Math.ceil(config.leafCount * 0.42)
        : 0;
    for (let index = 0; index < risingLeafCount; index += 1) {
      const tone = config.colors.leaves[(index + 1) % config.colors.leaves.length];
      const bladeMaterial = new THREE.MeshBasicMaterial({
        color: tone,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthTest: false,
        depthWrite: false,
      });
      const veinMaterial = new THREE.LineBasicMaterial({
        color: index % 4 === 3 ? 0xe5db8a : 0xd2ef9a,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      });
      const blade = new THREE.Mesh(leafGeometry, bladeMaterial);
      const vein = new THREE.Line(veinGeometry, veinMaterial);
      const group = new THREE.Group();
      group.visible = false;
      group.add(blade, vein);
      group.position.z = 4 + seededNoise(index, salt + 20.3);
      scene.add(group);

      risingLeaves.push({
        group,
        blade,
        vein,
        delay: 0.1 + seededNoise(index, salt + 21.4) * 0.2,
        life: config.duration * (0.58 + seededNoise(index, salt + 22.7) * 0.16),
        startX: width * (0.2 + seededNoise(index, salt + 23.9) * 0.6),
        startY: height * (0.14 + seededNoise(index, salt + 24.6) * 0.12),
        rise: height * (0.48 + seededNoise(index, salt + 25.8) * 0.24),
        drift: width * (seededNoise(index, salt + 26.5) - 0.5) * 0.075,
        rotation: (seededNoise(index, salt + 27.7) - 0.5) * 0.9,
        turn: (seededNoise(index, salt + 28.4) - 0.5) * 0.52,
        size: (7.5 + seededNoise(index, salt + 29.6) * 7.5) * config.leafScale,
      });
    }

    const glowTexture = createGlowTexture();
    const groundGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: config.colors.glow,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const groundGlow = new THREE.Sprite(groundGlowMaterial);
    groundGlow.position.z = 0;
    scene.add(groundGlow);

    let elapsed = 0;
    let lastFrame = performance.now();
    let animationFrame = 0;
    const duration = reducedMotion ? Math.min(0.24, config.duration) : config.duration;

    const tick = (now: number) => {
      const deltaSeconds = Math.min(now - lastFrame, 48) / 1000;
      lastFrame = now;
      elapsed += deltaSeconds;

      const masterProgress = clamp01(elapsed / duration);
      const fadeOut = clamp01((1 - masterProgress) / 0.22);
      const centerX = width / 2;
      const groundY = height * 0.145;

      groundGlow.position.set(centerX, groundY, 0);
      groundGlow.scale.set(width * (0.68 + masterProgress * 0.08), height * 0.2, 1);
      groundGlowMaterial.opacity =
        Math.min(1, masterProgress / 0.14) *
        fadeOut *
        config.opacity *
        0.32;

      for (const root of roots) {
        const localDuration = reducedMotion ? Math.min(0.16, root.growDuration) : root.growDuration;
        const progress = clamp01((elapsed - root.delay) / localDuration);
        const grown = easeInOutCubic(progress);
        const visibleSegments = Math.min(
          root.segments,
          Math.max(0, Math.ceil(root.segments * grown)),
        );
        const drawCount = visibleSegments * 6;
        root.mesh.geometry.setDrawRange(0, drawCount);
        root.glow.geometry.setDrawRange(0, drawCount);
        root.mesh.visible = elapsed >= root.delay && fadeOut > 0;
        root.glow.visible = root.mesh.visible;

        const tipPulse = 0.78 + Math.sin(elapsed * 12 + root.delay * 17) * 0.12;
        root.material.opacity = config.opacity * fadeOut * Math.min(1, progress / 0.08);
        root.glowMaterial.opacity =
          config.opacity *
          fadeOut *
          Math.sin(Math.PI * Math.min(1, progress)) *
          0.22 *
          tipPulse;
      }

      for (const leaf of leaves) {
        const localLife = reducedMotion ? Math.min(0.16, leaf.life) : leaf.life;
        const progress = clamp01((elapsed - leaf.delay) / localLife);
        const visible = elapsed >= leaf.delay && progress < 1;
        leaf.group.visible = visible;
        if (!visible) {
          leaf.blade.material.opacity = 0;
          leaf.vein.material.opacity = 0;
          continue;
        }

        const unfurl = easeOutCubic(clamp01(progress / 0.28));
        const leafFade = clamp01((1 - progress) / 0.34);
        const alpha = Math.min(1, progress / 0.1) * leafFade * config.opacity;
        const wither = progress > 0.68 ? 1 - (progress - 0.68) * 0.42 : 1;
        const sway = Math.sin(elapsed * 8.4 + leaf.phase) * 0.08;

        leaf.group.position.set(
          leaf.position.x + Math.sin(elapsed * 5.2 + leaf.phase) * 1.2,
          leaf.position.y + Math.cos(elapsed * 4.6 + leaf.phase) * 0.8,
          leaf.group.position.z,
        );
        leaf.group.rotation.z = leaf.rotation + sway;
        leaf.blade.rotation.y = Math.sin(elapsed * 7.2 + leaf.phase) * 0.28;
        leaf.blade.rotation.x = Math.cos(elapsed * 6.4 + leaf.phase) * 0.18;
        leaf.group.scale.set(
          leaf.size * 0.64 * unfurl * wither,
          leaf.size * unfurl * wither,
          1,
        );
        leaf.blade.material.opacity = alpha * 0.94;
        leaf.vein.material.opacity = alpha * 0.72;
      }

      for (const leaf of risingLeaves) {
        const localLife = reducedMotion ? Math.min(0.17, leaf.life) : leaf.life;
        const progress = clamp01((elapsed - leaf.delay) / localLife);
        const visible = elapsed >= leaf.delay && progress < 1;
        leaf.group.visible = visible;
        if (!visible) {
          leaf.blade.material.opacity = 0;
          leaf.vein.material.opacity = 0;
          continue;
        }

        const travel = easeOutCubic(progress);
        const fadeIn = clamp01(progress / 0.14);
        const fadeAway = clamp01((1 - progress) / 0.3);
        const alpha = Math.min(fadeIn, fadeAway) * config.opacity;
        const unfold = easeOutCubic(clamp01(progress / 0.2));
        const shrink = progress > 0.76 ? 1 - (progress - 0.76) * 0.72 : 1;

        leaf.group.position.set(
          leaf.startX + leaf.drift * travel,
          leaf.startY + leaf.rise * travel,
          leaf.group.position.z,
        );
        leaf.group.rotation.z = leaf.rotation + leaf.turn * progress;
        leaf.blade.rotation.y = Math.sin(progress * Math.PI) * 0.22;
        leaf.group.scale.set(
          leaf.size * 0.64 * unfold * shrink,
          leaf.size * unfold * shrink,
          1,
        );
        leaf.blade.material.opacity = alpha * 0.92;
        leaf.vein.material.opacity = alpha * 0.68;
      }

      renderer.render(scene, camera);
      if (elapsed <= duration + 0.08) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      for (const root of roots) {
        scene.remove(root.mesh, root.glow);
        root.mesh.geometry.dispose();
        root.glow.geometry.dispose();
        root.material.dispose();
        root.glowMaterial.dispose();
      }
      for (const leaf of leaves) {
        scene.remove(leaf.group);
        leaf.blade.material.dispose();
        leaf.vein.material.dispose();
      }
      for (const leaf of risingLeaves) {
        scene.remove(leaf.group);
        leaf.blade.material.dispose();
        leaf.vein.material.dispose();
      }
      scene.remove(groundGlow);
      groundGlowMaterial.dispose();
      leafGeometry.dispose();
      veinGeometry.dispose();
      glowTexture.dispose();
      renderer.dispose();
    };
  }, [eventId, pattern, variant]);

  return (
    <span
      className={`growth-three-effect growth-three-${variant} growth-three-pattern-${pattern}`}
      aria-hidden="true"
    >
      <canvas ref={canvasRef} className="growth-three-canvas" />
      <span className="growth-three-fallback">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function GrowthBuffAnimator({
  eventId,
  variant,
}: Omit<NatureRootAnimatorProps, "pattern">) {
  return <NatureRootAnimator eventId={eventId} variant={variant} pattern="growth" />;
}

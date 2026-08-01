import { useLayoutEffect, useRef } from "react";
import * as THREE from "three";

export type BuffSurgePalette = "holy" | "nature";

type BuffSurgeAnimatorProps = {
  eventId: number;
  palette: BuffSurgePalette;
  seedKey: string;
};

type SurgePalette = {
  core: number;
  mid: number;
  edge: number;
  dark: number;
};

type SurgeColumn = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  x: number;
  delay: number;
  speed: number;
  length: number;
  width: number;
};

type SurgeMote = {
  sprite: THREE.Sprite;
  material: THREE.SpriteMaterial;
  angle: number;
  radius: number;
  delay: number;
  rise: number;
  spin: number;
  size: number;
};

const SURGE_PALETTES: Record<BuffSurgePalette, SurgePalette> = {
  holy: {
    core: 0xfffdf0,
    mid: 0xffe08a,
    edge: 0xd8a129,
    dark: 0x3a2a06,
  },
  nature: {
    core: 0xeaffc0,
    mid: 0x7fdc4a,
    edge: 0x2f8a34,
    dark: 0x0d240f,
  },
};

const SURGE_DURATION = 1.08;
const PULSE_AT = 0.36;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function makeRng(seed: number): () => number {
  let state = (seed || 1) >>> 0;
  return () => {
    state ^= state << 13;
    state >>>= 0;
    state ^= state >> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 4294967296;
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutQuint(value: number): number {
  return 1 - Math.pow(1 - value, 5);
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function rgba(color: number, alpha: number): string {
  const red = (color >> 16) & 255;
  const green = (color >> 8) & 255;
  const blue = color & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function finishTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createStreakTexture(palette: SurgePalette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (context) {
    const lengthGradient = context.createLinearGradient(0, 0, 128, 0);
    lengthGradient.addColorStop(0, rgba(palette.edge, 0));
    lengthGradient.addColorStop(0.45, rgba(palette.mid, 0.55));
    lengthGradient.addColorStop(0.86, rgba(palette.core, 0.95));
    lengthGradient.addColorStop(1, rgba(palette.core, 0));
    context.fillStyle = lengthGradient;
    context.fillRect(0, 0, 128, 32);

    context.globalCompositeOperation = "destination-in";
    const widthGradient = context.createLinearGradient(0, 0, 0, 32);
    widthGradient.addColorStop(0, "rgba(255, 255, 255, 0)");
    widthGradient.addColorStop(0.5, "rgba(255, 255, 255, 1)");
    widthGradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    context.fillStyle = widthGradient;
    context.fillRect(0, 0, 128, 32);
  }
  return finishTexture(canvas);
}

function createEmberTexture(palette: SurgePalette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
    gradient.addColorStop(0, rgba(palette.core, 1));
    gradient.addColorStop(0.08, rgba(palette.core, 0.95));
    gradient.addColorStop(0.3, rgba(palette.mid, 0.5));
    gradient.addColorStop(1, rgba(palette.edge, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 96, 96);
  }
  return finishTexture(canvas);
}

function createRingTexture(palette: SurgePalette): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (context) {
    const gradient = context.createRadialGradient(128, 128, 82, 128, 128, 126);
    gradient.addColorStop(0, rgba(palette.mid, 0));
    gradient.addColorStop(0.7, rgba(palette.mid, 0.24));
    gradient.addColorStop(0.9, rgba(palette.core, 0.82));
    gradient.addColorStop(1, rgba(palette.core, 0));
    context.fillStyle = gradient;
    context.fillRect(0, 0, 256, 256);
  }
  return finishTexture(canvas);
}

function createSprite(
  texture: THREE.Texture,
  opacity = 0,
): { sprite: THREE.Sprite; material: THREE.SpriteMaterial } {
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sprite = new THREE.Sprite(material);
  return { sprite, material };
}

/** Local adaptation of the VFX Lab's `might-surge`, pared back to rising light columns and one
 * compact pulse contained well inside an oversized canvas. Motes, base glow and chevrons stay out. */
export function BuffSurgeAnimator({
  eventId,
  palette: paletteName,
  seedKey,
}: BuffSurgeAnimatorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const palette = SURGE_PALETTES[paletteName];
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
      canvas.classList.add("buff-surge-three-unavailable");
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

    const streakTexture = createStreakTexture(palette);
    const emberTexture = createEmberTexture(palette);
    const ringTexture = createRingTexture(palette);
    const rng = makeRng(hashString(`${eventId}:${seedKey}:${paletteName}`));
    const cardWidth = width * 0.5;
    const cardHeight = height * 0.488;
    const centerX = width * 0.5;
    const centerY = height * 0.512;
    const cardBottom = centerY - cardHeight * 0.5;
    const intensity = paletteName === "nature" ? 0.94 : 1;

    const columns: SurgeColumn[] = [];
    const columnCount = reducedMotion ? 5 : 9;
    for (let index = 0; index < columnCount; index += 1) {
      const { sprite, material } = createSprite(streakTexture);
      material.rotation = Math.PI / 2;
      material.color.set(rng() > 0.7 ? palette.core : palette.mid);
      sprite.position.z = 2;
      scene.add(sprite);
      const lane = (index + 0.12 + rng() * 0.76) / columnCount - 0.5;
      columns.push({
        sprite,
        material,
        x: centerX + lane * cardWidth * 1.04,
        delay: rng() * 0.3,
        speed: 0.9 + rng() * 0.7,
        length: (40 + rng() * 70) * intensity,
        width: (3 + rng() * 7) * intensity,
      });
    }

    const motes: SurgeMote[] = [];
    const moteCount = reducedMotion ? 8 : 24;
    for (let index = 0; index < moteCount; index += 1) {
      const { sprite, material } = createSprite(emberTexture);
      material.color.set(rng() > 0.5 ? palette.core : palette.mid);
      sprite.position.z = 4;
      scene.add(sprite);
      motes.push({
        sprite,
        material,
        angle: rng() * Math.PI * 2,
        radius: cardWidth * (0.36 + rng() * 0.22),
        delay: rng() * 0.34,
        rise: cardHeight * (0.7 + rng() * 0.5),
        spin: (rng() - 0.5) * 3.4,
        size: (5 + rng() * 8) * intensity,
      });
    }

    const pulse = createSprite(ringTexture);
    pulse.sprite.position.set(centerX, centerY, 3);
    pulse.material.color.set(palette.core);
    scene.add(pulse.sprite);

    let elapsed = 0;
    let lastFrame = performance.now();
    let animationFrame = 0;
    const duration = reducedMotion ? 0.24 : SURGE_DURATION;

    const tick = (now: number) => {
      elapsed += Math.min(now - lastFrame, 48) / 1000;
      lastFrame = now;

      const fade = clamp01((duration - elapsed) / (duration * 0.22));

      for (const column of columns) {
        const local = clamp01(
          ((elapsed - column.delay) * column.speed) /
          (reducedMotion ? 0.2 : 0.82),
        );
        const y = cardBottom - cardHeight * 0.54 + local * cardHeight * 1.84;
        column.sprite.position.set(column.x, y, 2);
        column.sprite.scale.set(column.length, column.width, 1);
        column.material.opacity =
          local > 0 ? Math.sin(local * Math.PI) * 0.88 * fade * intensity : 0;
      }

      for (const mote of motes) {
        const moteProgress = clamp01(
          (elapsed - mote.delay) / (reducedMotion ? 0.18 : 0.7),
        );
        const angle = mote.angle + mote.spin * moteProgress;
        mote.sprite.position.set(
          centerX + Math.cos(angle) * mote.radius * (1 - moteProgress * 0.35),
          cardBottom + mote.rise * easeOutCubic(moteProgress),
          4,
        );
        const moteSize = mote.size * (0.5 + moteProgress * 0.7);
        mote.sprite.scale.set(moteSize, moteSize, 1);
        mote.material.opacity =
          moteProgress > 0
            ? Math.sin(moteProgress * Math.PI) * 0.95 * fade * intensity
            : 0;
      }

      if (elapsed >= PULSE_AT) {
        const pulseProgress = clamp01(
          (elapsed - PULSE_AT) / (reducedMotion ? 0.13 : 0.42),
        );
        const pulseSize =
          cardWidth *
          (0.48 + easeOutQuint(pulseProgress) * 0.78) *
          intensity;
        pulse.sprite.scale.set(pulseSize, pulseSize, 1);
        pulse.material.opacity = (1 - pulseProgress) * 0.72 * intensity;
      } else {
        pulse.material.opacity = 0;
      }

      renderer.render(scene, camera);
      if (elapsed <= duration + 0.06) {
        animationFrame = window.requestAnimationFrame(tick);
      }
    };
    animationFrame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      for (const column of columns) {
        scene.remove(column.sprite);
        column.material.dispose();
      }
      for (const mote of motes) {
        scene.remove(mote.sprite);
        mote.material.dispose();
      }
      scene.remove(pulse.sprite);
      pulse.material.dispose();
      streakTexture.dispose();
      emberTexture.dispose();
      ringTexture.dispose();
      renderer.dispose();
    };
  }, [eventId, paletteName, seedKey]);

  return (
    <span className={`buff-surge-effect buff-surge-${paletteName}`} aria-hidden="true">
      <canvas ref={canvasRef} className="buff-surge-canvas" />
      <span className="buff-surge-fallback">
        <i />
        <i />
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

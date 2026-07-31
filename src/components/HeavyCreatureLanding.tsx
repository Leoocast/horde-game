import { useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";

type Props = {
  cardId: string;
  eventId: number;
  onComplete: (cardId: string, eventId: number) => void;
};

type SmokePuff = {
  sprite: THREE.Sprite;
  directionX: number;
  directionY: number;
  reachX: number;
  reachY: number;
  size: number;
  spin: number;
  delay: number;
};

type VeilPuff = {
  sprite: THREE.Sprite;
  x: number;
  y: number;
  rise: number;
  size: number;
  spin: number;
  delay: number;
};

type DebrisPiece = {
  sprite: THREE.Sprite;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  size: number;
  age: number;
  life: number;
  delay: number;
  spin: number;
};

type ImpactStreak = {
  sprite: THREE.Sprite;
  originX: number;
  originY: number;
  directionX: number;
  directionY: number;
  length: number;
  delay: number;
};

const EFFECT_DURATION = 1.28;

export function HeavyCreatureLanding({ cardId, eventId, onComplete }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const duration = reducedMotion ? 0.72 : EFFECT_DURATION;
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
      const fallbackTimer = window.setTimeout(
        () => onCompleteRef.current(cardId, eventId),
        duration * 1000,
      );
      return () => window.clearTimeout(fallbackTimer);
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
      camera.right = width;
      camera.top = height;
      camera.updateProjectionMatrix();
      renderer.setSize(Math.round(width), Math.round(height), false);
    };
    resize();

    const random = seededRandom(eventId * 7919 + cardId.length * 101);
    const smokeTextures = Array.from({ length: 4 }, (_, index) => createSmokeTexture(index + eventId));
    const ringTexture = createRingTexture();
    const burstTexture = createBurstTexture();
    const debrisTexture = createDebrisTexture(eventId);
    const streakTexture = createStreakTexture();
    const ownedTextures = [...smokeTextures, ringTexture, burstTexture, debrisTexture, streakTexture];
    const ownedMaterials: THREE.Material[] = [];
    const ownedObjects: THREE.Object3D[] = [];

    const makeSprite = (
      texture: THREE.Texture,
      color: number,
      opacity = 0,
      blending: THREE.Blending = THREE.NormalBlending,
    ) => {
      const material = new THREE.SpriteMaterial({
        map: texture,
        color,
        opacity,
        transparent: true,
        depthWrite: false,
        blending,
      });
      const sprite = new THREE.Sprite(material);
      sprite.renderOrder = 2;
      scene.add(sprite);
      ownedMaterials.push(material);
      ownedObjects.push(sprite);
      return sprite;
    };

    const canvasRect = canvas.getBoundingClientRect();
    const cardRect = canvas.parentElement?.parentElement?.getBoundingClientRect();
    const cardWidth = cardRect?.width ?? width / 3.2;
    const cardHeight = cardRect?.height ?? height / 2.65;
    const centerX = cardRect
      ? cardRect.left + cardRect.width * 0.5 - canvasRect.left
      : width * 0.5;
    const cardCenterY = cardRect
      ? cardRect.top + cardRect.height * 0.5 - canvasRect.top
      : height * 0.47;
    const centerY = cardCenterY - cardHeight * 0.56;
    const groundY = centerY + cardHeight * 0.47;
    const cardFootprintDiameter = Math.hypot(cardWidth, cardHeight) * 1.04;

    const smokeRingCount = reducedMotion ? 14 : 24;
    const smokeRing: SmokePuff[] = Array.from({ length: smokeRingCount }, (_, index) => {
      const angle = (index / smokeRingCount) * Math.PI * 2 + (random() - 0.5) * 0.2;
      const sprite = makeSprite(
        smokeTextures[index % smokeTextures.length],
        index % 3 === 0 ? 0x797568 : index % 3 === 1 ? 0x918879 : 0x6d7068,
      );
      return {
        sprite,
        directionX: Math.cos(angle),
        directionY: Math.sin(angle),
        reachX: cardWidth * (0.72 + random() * 0.28),
        reachY: cardHeight * (0.54 + random() * 0.22),
        size: cardWidth * (0.24 + random() * 0.18),
        spin: (random() - 0.5) * 2.1,
        delay: random() * 0.08,
      };
    });

    const veil: VeilPuff[] = Array.from({ length: reducedMotion ? 4 : 8 }, (_, index) => ({
      sprite: makeSprite(
        smokeTextures[(index + 1) % smokeTextures.length],
        index % 2 === 0 ? 0x6b675c : 0x858075,
      ),
      x: centerX + (random() - 0.5) * cardWidth * 0.86,
      y: centerY + (random() - 0.22) * cardHeight * 0.52,
      rise: cardHeight * (0.16 + random() * 0.2),
      size: cardWidth * (0.3 + random() * 0.22),
      spin: (random() - 0.5) * 1.25,
      delay: 0.02 + random() * 0.12,
    }));

    const shock = makeSprite(ringTexture, 0xa58c61);
    shock.renderOrder = 1;
    const groundBloom = makeSprite(burstTexture, 0xbda16b, 0, THREE.AdditiveBlending);
    groundBloom.renderOrder = 1;

    const debris: DebrisPiece[] = Array.from({ length: reducedMotion ? 9 : 17 }, (_, index) => {
      const side = random() > 0.5 ? 1 : -1;
      const sprite = makeSprite(debrisTexture, index % 3 === 0 ? 0x9d7b4e : 0x60492e);
      const speed = cardWidth * (0.72 + random() * 1.15);
      return {
        sprite,
        x: centerX + (random() - 0.5) * cardWidth * 0.22,
        y: groundY,
        velocityX: side * speed * (0.35 + random() * 0.55),
        velocityY: -speed * (0.66 + random() * 0.52),
        size: 4 + random() * 8,
        age: 0,
        life: 0.52 + random() * 0.32,
        delay: random() * 0.06,
        spin: (random() - 0.5) * 7,
      };
    });

    const streakCount = reducedMotion ? 8 : 14;
    const streaks: ImpactStreak[] = Array.from({ length: streakCount }, (_, index) => {
      const angle = (index / streakCount) * Math.PI * 2 + (random() - 0.5) * 0.12;
      const directionX = Math.cos(angle);
      const directionY = Math.sin(angle);
      const edgeDistance = Math.min(
        Math.abs(directionX) > 0.001 ? cardWidth * 0.52 / Math.abs(directionX) : Number.POSITIVE_INFINITY,
        Math.abs(directionY) > 0.001 ? cardHeight * 0.51 / Math.abs(directionY) : Number.POSITIVE_INFINITY,
      );
      return {
        sprite: makeSprite(streakTexture, index % 2 === 0 ? 0x8a7049 : 0xb09966),
        originX: centerX + directionX * edgeDistance,
        originY: centerY + directionY * edgeDistance,
        directionX,
        directionY,
        length: cardWidth * (0.13 + random() * 0.12),
        delay: random() * 0.055,
      };
    });

    let frame = 0;
    let completed = false;
    let lastTime = performance.now();
    const startedAt = lastTime;

    const animate = (now: number) => {
      const elapsed = Math.min((now - startedAt) / 1000, duration);
      const delta = Math.min((now - lastTime) / 1000, 1 / 30);
      lastTime = now;
      const timeScale = EFFECT_DURATION / duration;
      const effectTime = elapsed * timeScale;

      const shockT = clamp01(effectTime / 0.48);
      const shockOut = easeOutQuint(shockT);
      shock.position.set(centerX, centerY, 0);
      const shockDiameter = cardFootprintDiameter * (0.22 + shockOut * 0.78);
      shock.scale.set(shockDiameter, shockDiameter, 1);
      (shock.material as THREE.SpriteMaterial).opacity = Math.pow(1 - shockT, 0.72) * 0.7;

      const bloomT = clamp01(effectTime / 0.22);
      groundBloom.position.set(centerX, groundY - cardHeight * 0.01, 0);
      groundBloom.scale.set(cardWidth * (0.28 + bloomT * 0.72), cardWidth * (0.08 + bloomT * 0.16), 1);
      (groundBloom.material as THREE.SpriteMaterial).opacity = Math.pow(1 - bloomT, 2) * 0.38;

      for (const puff of smokeRing) {
        const t = clamp01((effectTime - puff.delay) / 0.96);
        if (t <= 0) continue;
        const out = easeOutQuint(t);
        puff.sprite.position.set(
          centerX + puff.directionX * puff.reachX * out,
          centerY + puff.directionY * puff.reachY * out - cardHeight * 0.06 * t * t,
          0,
        );
        const scale = puff.size * (0.32 + out * 1.32);
        puff.sprite.scale.set(scale, scale, 1);
        puff.sprite.material.rotation += puff.spin * delta;
        (puff.sprite.material as THREE.SpriteMaterial).opacity =
          Math.sin(Math.min(1, t * 1.12) * Math.PI) * 0.48;
      }

      for (const puff of veil) {
        const t = clamp01((effectTime - puff.delay) / 0.98);
        if (t <= 0) continue;
        puff.sprite.position.set(puff.x, puff.y - puff.rise * easeOutCubic(t), 0);
        const scale = puff.size * (0.42 + t * 0.82);
        puff.sprite.scale.set(scale, scale, 1);
        puff.sprite.material.rotation += puff.spin * delta;
        (puff.sprite.material as THREE.SpriteMaterial).opacity = Math.sin(t * Math.PI) * 0.34;
      }

      for (const streak of streaks) {
        const t = clamp01((effectTime - streak.delay) / 0.46);
        const length = streak.length * easeOutQuint(t);
        streak.sprite.position.set(
          streak.originX + streak.directionX * length * 0.5,
          streak.originY + streak.directionY * length * 0.5,
          0,
        );
        streak.sprite.scale.set(Math.max(0.01, length), 2.2, 1);
        streak.sprite.material.rotation = Math.atan2(streak.directionY, streak.directionX);
        (streak.sprite.material as THREE.SpriteMaterial).opacity =
          t <= 0 ? 0 : Math.sin(t * Math.PI) * 0.72;
      }

      for (const piece of debris) {
        if (effectTime < piece.delay) continue;
        piece.age += delta * timeScale;
        if (piece.age >= piece.life) {
          (piece.sprite.material as THREE.SpriteMaterial).opacity = 0;
          continue;
        }
        piece.velocityY += cardHeight * 5.2 * delta * timeScale;
        piece.velocityX *= Math.max(0, 1 - 1.2 * delta * timeScale);
        piece.x += piece.velocityX * delta * timeScale;
        piece.y += piece.velocityY * delta * timeScale;
        piece.sprite.position.set(piece.x, piece.y, 0);
        piece.sprite.scale.set(piece.size, piece.size * 0.72, 1);
        piece.sprite.material.rotation += piece.spin * delta * timeScale;
        (piece.sprite.material as THREE.SpriteMaterial).opacity =
          Math.pow(1 - piece.age / piece.life, 1.2) * 0.88;
      }

      renderer.render(scene, camera);
      if (elapsed < duration) {
        frame = window.requestAnimationFrame(animate);
      } else if (!completed) {
        completed = true;
        onCompleteRef.current(cardId, eventId);
      }
    };

    frame = window.requestAnimationFrame(animate);
    return () => {
      window.cancelAnimationFrame(frame);
      for (const object of ownedObjects) scene.remove(object);
      for (const material of ownedMaterials) material.dispose();
      for (const texture of ownedTextures) texture.dispose();
      renderer.dispose();
    };
  }, [cardId, eventId]);

  return (
    <span className="heavy-creature-landing-vfx" aria-hidden="true">
      <canvas ref={canvasRef} />
    </span>
  );
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function easeOutCubic(value: number): number {
  return 1 - Math.pow(1 - value, 3);
}

function easeOutQuint(value: number): number {
  return 1 - Math.pow(1 - value, 5);
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function canvasTexture(size: number, draw: (context: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (context) draw(context);
  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSmokeTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(128, (context) => {
    const random = seededRandom(seed * 3571 + 17);
    for (let index = 0; index < 16; index += 1) {
      const angle = random() * Math.PI * 2;
      const distance = random() * 23;
      const x = 64 + Math.cos(angle) * distance;
      const y = 64 + Math.sin(angle) * distance;
      const radius = 20 + random() * 29;
      const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
      gradient.addColorStop(0, `rgb(255 255 255 / ${0.12 + random() * 0.13})`);
      gradient.addColorStop(0.42, `rgb(255 255 255 / ${0.08 + random() * 0.08})`);
      gradient.addColorStop(1, "rgb(255 255 255 / 0)");
      context.fillStyle = gradient;
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  });
}

function createRingTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 30, 64, 64, 64);
    gradient.addColorStop(0, "rgb(255 255 255 / 0)");
    gradient.addColorStop(0.42, "rgb(255 255 255 / 0)");
    gradient.addColorStop(0.56, "rgb(255 255 255 / 0.82)");
    gradient.addColorStop(0.7, "rgb(255 255 255 / 0.18)");
    gradient.addColorStop(1, "rgb(255 255 255 / 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

function createBurstTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (context) => {
    const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
    gradient.addColorStop(0, "rgb(255 255 255 / 0.9)");
    gradient.addColorStop(0.24, "rgb(255 255 255 / 0.42)");
    gradient.addColorStop(1, "rgb(255 255 255 / 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 128, 128);
  });
}

function createDebrisTexture(seed: number): THREE.CanvasTexture {
  return canvasTexture(64, (context) => {
    const random = seededRandom(seed * 1033 + 29);
    context.fillStyle = "#fff";
    context.beginPath();
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2;
      const radius = 18 + random() * 11;
      const x = 32 + Math.cos(angle) * radius;
      const y = 32 + Math.sin(angle) * radius;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
  });
}

function createStreakTexture(): THREE.CanvasTexture {
  return canvasTexture(128, (context) => {
    const gradient = context.createLinearGradient(0, 64, 128, 64);
    gradient.addColorStop(0, "rgb(255 255 255 / 0.92)");
    gradient.addColorStop(0.62, "rgb(255 255 255 / 0.6)");
    gradient.addColorStop(1, "rgb(255 255 255 / 0)");
    context.fillStyle = gradient;
    context.fillRect(0, 59, 128, 10);
  });
}

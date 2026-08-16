import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useAudioStore } from "../store/useAudioStore";
import { futureVisualSignature } from "../utils/futureIdentity";
import {
  buildDefeatShatterPlan,
  type DefeatShatterPlan,
  type DefeatShatterPoint,
  type DefeatShatterShard,
} from "./defeatShatterGeometry";
import { renderSharedVfxFrame } from "./sharedVfxRenderer";

type Props = {
  seed: string;
  onSequenceStart: () => void;
};

type RenderedShard = {
  group: THREE.Group;
  plan: DefeatShatterShard;
};

type ShatterScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  shards: RenderedShard[];
  edgeMaterials: THREE.LineBasicMaterial[];
  impactLight: THREE.PointLight;
  dispose: () => void;
};

const SHATTER_HOLD_MS = 2300;
const BODY_TONES = [0x8d7537, 0xb19852, 0x66562f] as const;
const SCREEN_TINTS = [0xc5d1d0, 0xd2d3c6, 0xa9bec1] as const;
const EDGE_TONES = [0xe2c66f, 0xbba05a, 0xf0dc91] as const;

function easeOutCubic(value: number): number {
  return 1 - (1 - value) ** 3;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function shardShape(shard: DefeatShatterShard): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(shard.points[0].x - shard.center.x, shard.points[0].y - shard.center.y);
  shape.lineTo(shard.points[1].x - shard.center.x, shard.points[1].y - shard.center.y);
  shape.lineTo(shard.points[2].x - shard.center.x, shard.points[2].y - shard.center.y);
  shape.closePath();
  return shape;
}

function signedArea(points: [DefeatShatterPoint, DefeatShatterPoint, DefeatShatterPoint]): number {
  return (
    (points[1].x - points[0].x) * (points[2].y - points[0].y)
    - (points[1].y - points[0].y) * (points[2].x - points[0].x)
  );
}

/** La cara conserva UV global: al separar las piezas cada una se lleva su trozo real del tablero. */
function mappedFaceGeometry(
  shard: DefeatShatterShard,
  plan: DefeatShatterPlan,
): THREE.BufferGeometry {
  const order = signedArea(shard.points) > 0 ? [0, 1, 2] : [0, 2, 1];
  const positions: number[] = [];
  const uvs: number[] = [];
  for (const index of order) {
    const point = shard.points[index];
    positions.push(
      point.x - shard.center.x,
      point.y - shard.center.y,
      shard.depth / 2 + 0.006,
    );
    uvs.push(
      (point.x + plan.halfWidth) / (plan.halfWidth * 2),
      (point.y + plan.halfHeight) / (plan.halfHeight * 2),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

async function captureBattlefield(width: number, height: number): Promise<HTMLCanvasElement | undefined> {
  const gameScreen = document.querySelector<HTMLElement>(".game-screen");
  if (!gameScreen) return undefined;
  try {
    const { toCanvas } = await import("html-to-image");
    return await toCanvas(gameScreen, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      skipAutoScale: true,
      cacheBust: false,
      preferredFontFormat: "woff2",
      backgroundColor: "#07100f",
      filter: (node) => !node.classList?.contains("game-result-overlay"),
    });
  } catch {
    return undefined;
  }
}

function createShatterScene(
  width: number,
  height: number,
  signature: number,
  snapshot?: HTMLCanvasElement,
): ShatterScene {
  const aspect = width / Math.max(1, height);
  const plan = buildDefeatShatterPlan(aspect, signature);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(51.9, aspect, 0.1, 30);
  camera.position.set(0, 0, 8);
  camera.lookAt(0, 0, 0);

  scene.add(new THREE.AmbientLight(0x8fa5a6, 0.82));
  const coldRim = new THREE.DirectionalLight(0x91b3b8, 1.55);
  coldRim.position.set(-5, 4, 7);
  scene.add(coldRim);
  const goldRim = new THREE.DirectionalLight(0xe0bc63, 1.9);
  goldRim.position.set(5, -2, 6);
  scene.add(goldRim);
  const impactLight = new THREE.PointLight(0xffdc88, 7.2, 22);
  impactLight.position.set(plan.impact.x, plan.impact.y, 4.2);
  scene.add(impactLight);

  const screenTexture = snapshot ? new THREE.CanvasTexture(snapshot) : undefined;
  if (screenTexture) {
    screenTexture.encoding = THREE.sRGBEncoding;
    screenTexture.minFilter = THREE.LinearFilter;
    screenTexture.magFilter = THREE.LinearFilter;
    screenTexture.generateMipmaps = false;
    screenTexture.needsUpdate = true;
  }

  const glassBodyMaterials = SCREEN_TINTS.map((color) => new THREE.MeshPhongMaterial({
    color,
    emissive: 0x050b0c,
    specular: 0xe8f3ef,
    shininess: 142,
    transparent: true,
    opacity: 0.12,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const goldSideMaterials = BODY_TONES.map((color) => new THREE.MeshPhongMaterial({
    color,
    emissive: 0x171308,
    specular: 0xffe7a0,
    shininess: 154,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    side: THREE.DoubleSide,
  }));
  const screenMaterials = SCREEN_TINTS.map((color) => new THREE.MeshBasicMaterial({
    color: screenTexture ? 0xffffff : color,
    map: screenTexture,
    transparent: true,
    opacity: screenTexture ? 0.54 : 0.3,
    depthWrite: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }));
  const sheenMaterials = SCREEN_TINTS.map((color) => new THREE.MeshPhongMaterial({
    color,
    emissive: 0x071011,
    specular: 0xf1d681,
    shininess: 168,
    transparent: true,
    opacity: screenTexture ? 0.34 : 0.46,
    depthWrite: false,
    side: THREE.FrontSide,
    blending: THREE.AdditiveBlending,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    polygonOffsetUnits: -4,
  }));
  const backMaterials = SCREEN_TINTS.map((color) => new THREE.MeshPhongMaterial({
    color,
    emissive: 0x071011,
    specular: 0xd7bf71,
    shininess: 136,
    transparent: true,
    opacity: 0.38,
    depthWrite: false,
    side: THREE.BackSide,
  }));
  const edgeMaterials = EDGE_TONES.map((color) => new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthTest: true,
    depthWrite: false,
  }));
  const geometries: THREE.BufferGeometry[] = [];
  const shards = plan.shards.map((shard) => {
    const bodyGeometry = new THREE.ExtrudeGeometry(shardShape(shard), {
      depth: shard.depth,
      bevelEnabled: true,
      bevelSegments: 1,
      bevelSize: 0.014,
      bevelThickness: 0.018,
      steps: 1,
    });
    bodyGeometry.translate(0, 0, -shard.depth / 2);
    const faceGeometry = mappedFaceGeometry(shard, plan);
    const edgeGeometry = new THREE.EdgesGeometry(bodyGeometry, 12);
    geometries.push(bodyGeometry, faceGeometry, edgeGeometry);

    const body = new THREE.Mesh(bodyGeometry, [
      glassBodyMaterials[shard.tone],
      goldSideMaterials[shard.tone],
    ]);
    body.renderOrder = 0;
    const screen = new THREE.Mesh(faceGeometry, screenMaterials[shard.tone]);
    screen.renderOrder = 2;
    const sheen = new THREE.Mesh(faceGeometry, sheenMaterials[shard.tone]);
    sheen.renderOrder = 3;
    const back = new THREE.Mesh(faceGeometry, backMaterials[shard.tone]);
    back.position.z = -shard.depth - 0.012;
    back.renderOrder = 1;
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterials[shard.tone]);
    edges.renderOrder = 4;
    const group = new THREE.Group();
    group.position.set(shard.center.x, shard.center.y, 0);
    group.add(body, back, screen, sheen, edges);
    scene.add(group);
    return { group, plan: shard };
  });

  return {
    scene,
    camera,
    shards,
    edgeMaterials,
    impactLight,
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
      for (const material of glassBodyMaterials) material.dispose();
      for (const material of goldSideMaterials) material.dispose();
      for (const material of screenMaterials) material.dispose();
      for (const material of sheenMaterials) material.dispose();
      for (const material of backMaterials) material.dispose();
      for (const material of edgeMaterials) material.dispose();
      screenTexture?.dispose();
      scene.clear();
    },
  };
}

function updateShatterScene(rendered: ShatterScene, elapsedMs: number): void {
  const crack = clamp01(elapsedMs / 145);
  const settled = clamp01((elapsedMs - 720) / 920);
  const edgeOpacity = crack * (0.96 - settled * 0.2);
  for (const material of rendered.edgeMaterials) material.opacity = edgeOpacity;
  rendered.impactLight.intensity = 1.1 + Math.max(0, 1 - elapsedMs / 620) * 7.4;

  for (const shard of rendered.shards) {
    const progress = clamp01((elapsedMs - shard.plan.delayMs) / shard.plan.durationMs);
    const travel = easeOutCubic(progress);
    const gravity = progress * progress * shard.plan.drop;
    shard.group.position.set(
      shard.plan.center.x + shard.plan.travel.x * travel,
      shard.plan.center.y + shard.plan.travel.y * travel - gravity,
      shard.plan.travel.z * travel,
    );
    shard.group.rotation.set(
      shard.plan.spin.x * travel,
      shard.plan.spin.y * travel,
      shard.plan.spin.z * travel,
    );

    if (shard.plan.retained) {
      const settleScale = 1 + Math.sin(progress * Math.PI) * (1 - progress) * 0.065;
      shard.group.scale.setScalar(settleScale);
      shard.group.visible = true;
    } else {
      const exit = clamp01((progress - 0.76) / 0.24);
      shard.group.scale.setScalar(1 - exit * 0.86);
      shard.group.visible = progress < 0.995;
    }
  }
}

export function DefeatShatterAnimator({ seed, onSequenceStart }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const playSfx = useAudioStore((state) => state.playSfx);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setFallback(true);
      onSequenceStart();
      return;
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    let rendered: ShatterScene | undefined;
    let animationFrame = 0;
    let impactTimer = 0;
    let cancelled = false;

    const begin = async () => {
      const snapshot = await captureBattlefield(width, height);
      if (cancelled) return;
      rendered = createShatterScene(width, height, futureVisualSignature(seed), snapshot);
      let firstFrame = true;
      const startedAt = performance.now();
      onSequenceStart();
      impactTimer = window.setTimeout(() => playSfx("stoneCrash", { rate: 0.62 }), 120);

      const draw = (now: number) => {
        if (cancelled || !rendered) return;
        const elapsedMs = Math.min(SHATTER_HOLD_MS, now - startedAt);
        updateShatterScene(rendered, elapsedMs);
        const drew = renderSharedVfxFrame(canvas, {
          scene: rendered.scene,
          camera: rendered.camera,
          width,
          height,
          pixelRatio,
        });
        if (!drew) {
          setFallback(true);
          return;
        }
        if (firstFrame) {
          firstFrame = false;
          canvas.classList.add("is-ready");
        }
        if (elapsedMs < SHATTER_HOLD_MS) animationFrame = window.requestAnimationFrame(draw);
      };

      animationFrame = window.requestAnimationFrame(draw);
    };

    void begin();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(impactTimer);
      rendered?.dispose();
    };
  }, [onSequenceStart, playSfx, seed]);

  return (
    <div className={`defeat-shatter ${fallback ? "is-fallback" : ""}`} aria-hidden="true">
      <div className="defeat-shatter-impact" />
      <svg className="defeat-shatter-fractures" viewBox="0 0 100 100" preserveAspectRatio="none">
        <g>
          <path pathLength="1" d="M50 49 L40 35 L30 23 L20 0" />
          <path pathLength="1" d="M40 35 L23 39 L0 34" />
          <path pathLength="1" d="M30 23 L34 0" />
          <path pathLength="1" d="M50 49 L57 31 L64 18 L67 0" />
          <path pathLength="1" d="M57 31 L77 23 L100 22" />
          <path pathLength="1" d="M50 49 L68 48 L82 42 L100 45" />
          <path pathLength="1" d="M68 48 L78 63 L100 69" />
          <path pathLength="1" d="M50 49 L62 67 L68 82 L72 100" />
          <path pathLength="1" d="M62 67 L49 79 L47 100" />
          <path pathLength="1" d="M50 49 L35 67 L25 81 L18 100" />
          <path pathLength="1" d="M35 67 L16 65 L0 73" />
          <path pathLength="1" d="M50 49 L30 51 L15 47 L0 50" />
        </g>
      </svg>
      <canvas ref={canvasRef} className="defeat-shatter-canvas" />
      <div className="defeat-shatter-vignette" />
    </div>
  );
}

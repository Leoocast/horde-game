import * as THREE from "three";
import {
  BURN_FIREBALL_FRAGMENT_SHADER,
  BURN_FIREBALL_VERTEX_SHADER,
  BURN_MAX_ROUTES,
} from "./burnFireball";
import { warmSharedVfxFrame } from "./sharedVfxRenderer";

type WarmupFrame = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  outputEncoding?: THREE.TextureEncoding;
};

let retainedFrames: WarmupFrame[] | undefined;
let warmupPromise: Promise<void> | undefined;

function makeTexture(): THREE.DataTexture {
  const texture = new THREE.DataTexture(
    new Uint8Array([
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]),
    2,
    2,
    THREE.RGBAFormat,
  );
  texture.needsUpdate = true;
  return texture;
}

function createBuiltinMaterialFrame(): WarmupFrame {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(0, 64, 64, 0, -100, 100);
  camera.position.z = 10;
  scene.add(new THREE.AmbientLight(0xffffff, 0.35));
  const pointLight = new THREE.PointLight(0x8c0014, 4, 1200);
  pointLight.position.set(0, 0, 40);
  scene.add(pointLight);
  const directionalLight = new THREE.DirectionalLight(0x9e1026, 1.6);
  directionalLight.position.set(30, 60, 50);
  scene.add(directionalLight);

  const phong = new THREE.Mesh(
    new THREE.SphereGeometry(3, 8, 8),
    new THREE.MeshPhongMaterial({
      color: 0x42000c,
      emissive: 0x1d0005,
      specular: 0x8a001a,
      shininess: 80,
      transparent: true,
      opacity: 0.98,
    }),
  );
  phong.position.set(8, 8, 0);
  scene.add(phong);

  const coloredGeometry = new THREE.PlaneGeometry(5, 5);
  const vertexCount = coloredGeometry.getAttribute("position").count;
  coloredGeometry.setAttribute(
    "color",
    new THREE.Float32BufferAttribute(new Array(vertexCount * 3).fill(1), 3),
  );
  const coloredMesh = new THREE.Mesh(
    coloredGeometry,
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
    }),
  );
  coloredMesh.position.set(18, 8, 0);
  scene.add(coloredMesh);

  const additiveMesh = new THREE.Mesh(
    new THREE.CircleGeometry(3, 8),
    new THREE.MeshBasicMaterial({
      color: 0xb44cff,
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  additiveMesh.position.set(28, 8, 0);
  scene.add(additiveMesh);

  const texture = makeTexture();
  const additiveSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  additiveSprite.position.set(38, 8, 0);
  additiveSprite.scale.set(6, 6, 1);
  scene.add(additiveSprite);

  const normalSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  }));
  normalSprite.position.set(48, 8, 0);
  normalSprite.scale.set(6, 6, 1);
  scene.add(normalSprite);

  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(54, 5, 0),
    new THREE.Vector3(62, 11, 0),
  ]);
  scene.add(new THREE.Line(lineGeometry, new THREE.LineBasicMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })));

  return { scene, camera };
}

function createBurnFrame(): WarmupFrame {
  const emptyVectors = () => Array.from({ length: BURN_MAX_ROUTES }, () => new THREE.Vector2());
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(64, 64) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uCount: { value: 0 },
      uStart: { value: emptyVectors() },
      uEnd: { value: emptyVectors() },
      uDelay: { value: new Array(BURN_MAX_ROUTES).fill(0) },
      uImpactCount: { value: 0 },
      uImpactPos: { value: emptyVectors() },
      uImpactDelay: { value: new Array(BURN_MAX_ROUTES).fill(0) },
      uScale: { value: 1 },
      uCurve: { value: 0 },
      uCore: { value: new THREE.Vector3(1, 1, 1) },
      uHot: { value: new THREE.Vector3(1, 0.76, 0.28) },
      uMid: { value: new THREE.Vector3(0.97, 0.33, 0.05) },
      uDeep: { value: new THREE.Vector3(0.56, 0.08, 0.02) },
      uSmoke: { value: new THREE.Vector3(0.1, 0.05, 0.04) },
      uInk: { value: 0.16 },
    },
    vertexShader: BURN_FIREBALL_VERTEX_SHADER,
    fragmentShader: BURN_FIREBALL_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.Camera(), outputEncoding: THREE.LinearEncoding };
}

function createWarmupFrames(): WarmupFrame[] {
  return [createBuiltinMaterialFrame(), createBurnFrame()];
}

/** Traslada al loading la creación del contexto, el framebuffer y los shaders usados en juego. */
export function prewarmGameVfx(): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      retainedFrames ??= createWarmupFrames();
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
      for (const frame of retainedFrames) {
        warmSharedVfxFrame({ ...frame, width, height, pixelRatio });
      }
      resolve();
    });
  });
  return warmupPromise;
}

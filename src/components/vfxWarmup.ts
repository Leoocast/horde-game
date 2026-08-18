import * as THREE from "three";
import {
  BURN_FIREBALL_FRAGMENT_SHADER,
  BURN_FIREBALL_VERTEX_SHADER,
  BURN_MAX_ROUTES,
} from "./burnFireball";
import {
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_NODES,
} from "./chronicleSigilGeometry";
import {
  CHRONICLE_SIGIL_FRAGMENT_SHADER,
  CHRONICLE_SIGIL_VERTEX_SHADER,
} from "./chronicleSigilShader";
import {
  DESTINY_CONSTELLATION_EDGES,
  DESTINY_CONSTELLATION_NODES,
} from "./destinyConstellationGeometry";
import {
  DESTINY_CONSTELLATION_FRAGMENT_SHADER,
  DESTINY_CONSTELLATION_VERTEX_SHADER,
} from "./destinyConstellationShader";
import {
  DESTINY_VORTEX_FRAGMENT_SHADER,
  DESTINY_VORTEX_VERTEX_SHADER,
} from "./destinyVortexShader";
import { createDefeatGlassMaterial, createDefeatShockMaterial } from "./defeatGlassShader";
import { buildDefeatShatterPlan } from "./defeatShatterGeometry";
import { boundedVfxPixelRatio, warmSharedVfxFrame } from "./sharedVfxRenderer";

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

/** El agujero negro de las Semillas del Destino sólo aparece al reescribir, así que compilarlo
 * durante la carga evita que ese primer fotograma pague la compilación en pantalla. */
function createDestinyVortexFrame(): WarmupFrame {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(64, 64) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uSpin: { value: 0 },
      uSeed: { value: 0.37 },
      uCollapse: { value: 0 },
      uBurst: { value: 0 },
      uCenter: { value: new THREE.Vector2(32, 32) },
      uRadius: { value: 8 },
      uDisk: { value: new THREE.Vector3(1, 0.78, 0.34) },
      uRim: { value: new THREE.Vector3(0.34, 0.82, 0.78) },
      uCore: { value: new THREE.Vector3(1, 0.96, 0.86) },
    },
    vertexShader: DESTINY_VORTEX_VERTEX_SHADER,
    fragmentShader: DESTINY_VORTEX_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.Camera(), outputEncoding: THREE.LinearEncoding };
}

/**
 * El signo del Futuro es el primer efecto visible de la sesión: se traza mientras el encuentro
 * todavía se está abriendo. Compilarlo en ese momento cuesta un tirón justo en la entrada al
 * tablero, así que se paga durante la carga como el resto.
 */
function createChronicleSigilFrame(): WarmupFrame {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(64, 64) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2(32, 32) },
      uUnit: { value: 8 },
      uDialR: { value: 18 },
      uScale: { value: 1 },
      uPresence: { value: 0 },
      uMotes: { value: 0 },
      uCharge: { value: 0 },
      uSeat: { value: 0 },
      uSweep: { value: 0 },
      uSweepPresence: { value: 0 },
      uNode: { value: Array.from({ length: CHRONICLE_SIGIL_NODES }, () => new THREE.Vector4()) },
      uEdge: { value: Array.from({ length: CHRONICLE_SIGIL_EDGES }, () => new THREE.Vector4()) },
      uEdgeT: { value: new Array<number>(CHRONICLE_SIGIL_EDGES).fill(0) },
    },
    vertexShader: CHRONICLE_SIGIL_VERTEX_SHADER,
    fragmentShader: CHRONICLE_SIGIL_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.Camera(), outputEncoding: THREE.LinearEncoding };
}

/**
 * La constelación de la Victoria se monta en cuanto la Hueste se queda sin amenazas, y su primer
 * fotograma ya lleva motas en vuelo. Compilarla entonces cuesta un tirón justo en la entrada del
 * desenlace, así que se paga durante la carga como el resto.
 */
function createDestinyConstellationFrame(): WarmupFrame {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(64, 64) },
      uPixelRatio: { value: 1 },
      uTime: { value: 0 },
      uT: { value: 0 },
      uCenter: { value: new THREE.Vector2(32, 32) },
      uUnit: { value: 8 },
      uBloom: { value: 0 },
      uSeed: { value: 0.37 },
      uNode: { value: Array.from({ length: DESTINY_CONSTELLATION_NODES }, () => new THREE.Vector4()) },
      uEdge: { value: Array.from({ length: DESTINY_CONSTELLATION_EDGES }, () => new THREE.Vector4()) },
      uEdgeT: { value: new Array<number>(DESTINY_CONSTELLATION_EDGES).fill(0) },
    },
    vertexShader: DESTINY_CONSTELLATION_VERTEX_SHADER,
    fragmentShader: DESTINY_CONSTELLATION_FRAGMENT_SHADER,
    transparent: true,
    premultipliedAlpha: true,
    depthTest: false,
    depthWrite: false,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  return { scene, camera: new THREE.Camera(), outputEncoding: THREE.LinearEncoding };
}

/**
 * El vidrio de la derrota se monta justo cuando la Vida llega a 0. Compilar entonces sus dos
 * programas cuesta un tirón en el peor momento posible, así que se paga durante la carga con el
 * mismo plan real: los atributos por trozo forman parte del programa.
 */
function createDefeatGlassFrame(): WarmupFrame {
  const plan = buildDefeatShatterPlan(16 / 9, 0.31);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(plan.positions, 3));
  geometry.setAttribute("aCentroid", new THREE.BufferAttribute(plan.centroids, 3));
  geometry.setAttribute("aUv", new THREE.BufferAttribute(plan.uvs, 2));
  geometry.setAttribute("aNrm", new THREE.BufferAttribute(plan.normals, 3));
  geometry.setAttribute("aAxis", new THREE.BufferAttribute(plan.axes, 3));
  geometry.setAttribute("aMotion", new THREE.BufferAttribute(plan.motions, 4));
  geometry.setAttribute("aDyn", new THREE.BufferAttribute(plan.dynamics, 3));
  geometry.setAttribute("aInfo", new THREE.BufferAttribute(plan.infos, 4));

  const scene = new THREE.Scene();
  const glass = new THREE.Mesh(
    geometry,
    createDefeatGlassMaterial(makeTexture(), plan.impact, plan.impactUv, 16 / 9, plan.halfHeight * 2),
  );
  glass.frustumCulled = false;
  scene.add(glass);

  const shock = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    createDefeatShockMaterial(64, 64, { x: 0, y: 0 }),
  );
  shock.frustumCulled = false;
  scene.add(shock);

  const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.02, 400);
  camera.position.set(0, 0, plan.halfHeight / Math.tan(THREE.MathUtils.degToRad(21)));
  camera.lookAt(0, 0, 0);
  return { scene, camera, outputEncoding: THREE.LinearEncoding };
}

function createWarmupFrames(): WarmupFrame[] {
  return [
    createBuiltinMaterialFrame(),
    createBurnFrame(),
    createChronicleSigilFrame(),
    createDestinyConstellationFrame(),
    createDestinyVortexFrame(),
    createDefeatGlassFrame(),
  ];
}

/** Traslada al loading la creación del contexto, el framebuffer y los shaders usados en juego. */
export function prewarmGameVfx(): Promise<void> {
  if (warmupPromise) return warmupPromise;
  warmupPromise = new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      retainedFrames ??= createWarmupFrames();
      const width = Math.max(1, window.innerWidth);
      const height = Math.max(1, window.innerHeight);
      const pixelRatio = boundedVfxPixelRatio(width, height, window.devicePixelRatio || 1);
      for (const frame of retainedFrames) {
        warmSharedVfxFrame({ ...frame, width, height, pixelRatio });
      }
      resolve();
    });
  });
  return warmupPromise;
}

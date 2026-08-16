import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { captureDesktopViewport } from "../platform/desktopBridge";
import { useAudioStore } from "../store/useAudioStore";
import { futureVisualSignature } from "../utils/futureIdentity";
import { buildDefeatShatterPlan } from "./defeatShatterGeometry";
import {
  createDefeatAbyssMaterial,
  createDefeatGlassMaterial,
  createDefeatShockMaterial,
  type DefeatAbyssMaterial,
  type DefeatGlassMaterial,
  type DefeatShockMaterial,
} from "./defeatGlassShader";
import { renderSharedVfxFrame } from "./sharedVfxRenderer";

type Props = {
  seed: string;
  onSequenceStart: () => void;
};

type ShatterScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  material: DefeatGlassMaterial;
  abyssMaterial: DefeatAbyssMaterial;
  shockMaterial: DefeatShockMaterial;
  shockMesh: THREE.Mesh;
  cameraRest: number;
  dispose: () => void;
};

/** El cuarteado recorre la placa, la onda la cruza y con ella sueltan los trozos. */
const FREEZE_MS = 700;
const CRACK_AT_MS = 620;
const CRACK_SPAN_MS = 900;
const SHOCK_AT_MS = 1560;
const SHOCK_SPAN_MS = 940;
const BURST_MS = SHOCK_AT_MS;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => window.requestAnimationFrame(() => resolve()));
}

function settleBefore<T>(task: Promise<T>, timeoutMs: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value?: T) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(), timeoutMs);
    task.then((value) => finish(value)).catch(() => finish());
  });
}

async function dataUrlToCanvas(
  dataUrl: string,
  width: number,
  height: number,
): Promise<HTMLCanvasElement | undefined> {
  const image = new Image();
  image.decoding = "async";
  const loadedTask = new Promise<boolean>((resolve) => {
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
  });
  image.src = dataUrl;
  if (!await settleBefore(loadedTask, 900)) return undefined;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

/** Rechaza lienzos uniformes: nunca sustituimos la pantalla por un color de reserva. */
function snapshotHasVisualDetail(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 2 || canvas.height < 2) return false;
  const bins = new Set<string>();
  let minLuma = 255;
  let maxLuma = 0;
  let opaqueSamples = 0;
  const columns = 11;
  const rows = 7;
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const x = Math.min(canvas.width - 1, Math.round((column / (columns + 1)) * canvas.width));
      const y = Math.min(canvas.height - 1, Math.round((row / (rows + 1)) * canvas.height));
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
      if (alpha > 220) opaqueSamples += 1;
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      bins.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
  }
  return opaqueSamples >= columns * rows * 0.9 && (maxLuma - minLuma > 18 || bins.size >= 8);
}

async function captureBattlefield(width: number, height: number): Promise<HTMLCanvasElement | undefined> {
  const gameScreen = document.querySelector<HTMLElement>(".game-screen");
  if (!gameScreen) return undefined;

  // useEffect corre después del commit; esperar otro paint garantiza que Vida 0 ya esté compuesta.
  await settleBefore(nextPaint(), 80);
  const desktopDataUrl = await settleBefore(captureDesktopViewport(), 900);
  if (desktopDataUrl) {
    const desktopCanvas = await dataUrlToCanvas(desktopDataUrl, width, height);
    if (desktopCanvas && snapshotHasVisualDetail(desktopCanvas)) return desktopCanvas;
  }

  try {
    const { toCanvas } = await import("html-to-image");
    const webCanvas = await settleBefore(toCanvas(gameScreen, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      skipAutoScale: true,
      cacheBust: false,
      skipFonts: true,
      backgroundColor: "#07100f",
      onImageErrorHandler: () => undefined,
      filter: (node) => (
        !node.classList?.contains("game-result-overlay")
        && !(node instanceof HTMLCanvasElement)
        && !(node instanceof HTMLVideoElement)
        && !(node instanceof HTMLIFrameElement)
      ),
    }), 1800);
    return webCanvas && snapshotHasVisualDetail(webCanvas) ? webCanvas : undefined;
  } catch {
    return undefined;
  }
}

function createShatterScene(
  width: number,
  height: number,
  pixelRatio: number,
  signature: number,
  snapshot: HTMLCanvasElement,
): ShatterScene {
  const aspect = width / Math.max(1, height);
  const plan = buildDefeatShatterPlan(aspect, signature);
  const scene = new THREE.Scene();
  const cameraRest = plan.halfHeight / Math.tan(THREE.MathUtils.degToRad(21));
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.02, cameraRest * 40);
  camera.position.set(0, 0, cameraRest);
  camera.lookAt(0, 0, 0);

  const screenTexture = new THREE.CanvasTexture(snapshot);
  screenTexture.minFilter = THREE.LinearFilter;
  screenTexture.magFilter = THREE.LinearFilter;
  screenTexture.generateMipmaps = false;
  screenTexture.wrapS = THREE.ClampToEdgeWrapping;
  screenTexture.wrapT = THREE.ClampToEdgeWrapping;
  // El teselado usa v = 0 en el borde superior: sin esto la captura entra del revés.
  screenTexture.flipY = false;
  screenTexture.needsUpdate = true;

  // Un solo BufferGeometry con los atributos por trozo. La animación entera vive en el
  // vertex shader, así que no hay una malla por fragmento ni transformaciones desde JS.
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(plan.positions, 3));
  geometry.setAttribute('aCentroid', new THREE.BufferAttribute(plan.centroids, 3));
  geometry.setAttribute('aUv', new THREE.BufferAttribute(plan.uvs, 2));
  geometry.setAttribute('aNrm', new THREE.BufferAttribute(plan.normals, 3));
  geometry.setAttribute('aAxis', new THREE.BufferAttribute(plan.axes, 3));
  geometry.setAttribute('aMotion', new THREE.BufferAttribute(plan.motions, 4));
  geometry.setAttribute('aDyn', new THREE.BufferAttribute(plan.dynamics, 3));
  geometry.setAttribute('aInfo', new THREE.BufferAttribute(plan.infos, 4));

  const material = createDefeatGlassMaterial(
    screenTexture,
    plan.impact,
    plan.impactUv,
    aspect,
    plan.halfHeight * 2,
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  scene.add(mesh);

  // El abismo queda detrás del vidrio: opaco, sin z y siempre el primero de la escena.
  // Es lo que aparece a medida que cada trozo se lleva su recorte de la captura.
  const abyssMaterial = createDefeatAbyssMaterial(width * pixelRatio, height * pixelRatio);
  const quadGeometry = new THREE.PlaneGeometry(2, 2);
  const abyssMesh = new THREE.Mesh(quadGeometry, abyssMaterial);
  abyssMesh.frustumCulled = false;
  abyssMesh.renderOrder = -10;
  scene.add(abyssMesh);

  // La onda va dentro de la misma escena, en aditivo y por encima del vidrio.
  const impactP = {
    x: (plan.impactUv.x - 0.5) * aspect,
    y: 0.5 - plan.impactUv.y,
  };
  const shockMaterial = createDefeatShockMaterial(
    width * pixelRatio,
    height * pixelRatio,
    impactP,
  );
  const shockMesh = new THREE.Mesh(quadGeometry, shockMaterial);
  shockMesh.frustumCulled = false;
  shockMesh.renderOrder = 10;
  shockMesh.visible = false;
  scene.add(shockMesh);

  return {
    scene,
    camera,
    material,
    abyssMaterial,
    shockMaterial,
    shockMesh,
    cameraRest,
    dispose: () => {
      geometry.dispose();
      quadGeometry.dispose();
      material.dispose();
      abyssMaterial.dispose();
      shockMaterial.dispose();
      screenTexture.dispose();
      scene.clear();
    },
  };
}

function updateShatterScene(rendered: ShatterScene, elapsedMs: number): void {
  const material = rendered.material;
  material.uniforms.uFreeze.value = clamp01(elapsedMs / FREEZE_MS);
  material.uniforms.uCrack.value = clamp01((elapsedMs - CRACK_AT_MS) / CRACK_SPAN_MS);
  material.uniforms.uT.value = (elapsedMs - BURST_MS) / 1000;
  rendered.abyssMaterial.uniforms.uTime.value = elapsedMs / 1000;

  const shock = (elapsedMs - SHOCK_AT_MS) / SHOCK_SPAN_MS;
  const shockLive = shock >= 0 && shock <= 1;
  material.uniforms.uShock.value = shockLive ? shock : -1;
  rendered.shockMaterial.uniforms.uShock.value = shockLive ? shock : -1;
  rendered.shockMesh.visible = shockLive;

  // Deriva de cámara: sólo tras el estallido, y muy poca. Basta para que los restos
  // suspendidos den paralaje y el vacío se lea como espacio.
  const after = Math.max(0, (elapsedMs - BURST_MS) / 1000);
  const settle = 1 - Math.exp(-after / 1.6);
  rendered.camera.position.set(
    rendered.cameraRest * 0.017 * settle,
    rendered.cameraRest * 0.009 * settle,
    rendered.cameraRest * (1 - 0.058 * settle),
  );
  rendered.camera.lookAt(0, 0, 0);
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
      try {
        const snapshot = await settleBefore(captureBattlefield(width, height), 2600);
        if (cancelled) return;
        if (!snapshot) {
          setFallback(true);
          onSequenceStart();
          return;
        }
        rendered = createShatterScene(width, height, pixelRatio, futureVisualSignature(seed), snapshot);
        let firstFrame = true;
        const startedAt = performance.now();
        onSequenceStart();
        impactTimer = window.setTimeout(() => playSfx("stoneCrash", { rate: 0.62 }), BURST_MS);

        const draw = (now: number) => {
          if (cancelled || !rendered) return;
          updateShatterScene(rendered, now - startedAt);
          const drew = renderSharedVfxFrame(canvas, {
            scene: rendered.scene,
            camera: rendered.camera,
            width,
            height,
            pixelRatio,
            // El vidrio y el abismo se calibraron en lineal: con la conversión sRGB del
            // renderer compartido el abismo se lava y el Fresnel deja de leerse frío.
            outputEncoding: THREE.LinearEncoding,
          });
          if (!drew) {
            setFallback(true);
            return;
          }
          if (firstFrame) {
            firstFrame = false;
            canvas.classList.add("is-ready");
          }
          // El abismo sigue vivo mientras dura la pantalla: los restos suspendidos
          // derivan y las estrellas respiran hasta que el Cronista elige salida.
          animationFrame = window.requestAnimationFrame(draw);
        };

        animationFrame = window.requestAnimationFrame(draw);
      } catch {
        if (cancelled) return;
        setFallback(true);
        onSequenceStart();
      }
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
      <canvas ref={canvasRef} className="defeat-shatter-canvas" />
      {/* Las quebraduras crecen desde el impacto como líneas: los muros del prisma
          quedan casi de canto vistos de frente y no sirven para enseñar la raja. */}
      <svg className="defeat-shatter-fractures" viewBox="0 0 100 56.25" preserveAspectRatio="none">
        <path pathLength="1" d="M52 26 L42 19 L31 11 L20 0" />
        <path pathLength="1" d="M42 19 L25 20 L0 17" />
        <path pathLength="1" d="M31 11 L34 0" />
        <path pathLength="1" d="M52 26 L58 16 L65 8 L68 0" />
        <path pathLength="1" d="M58 16 L77 11 L100 10" />
        <path pathLength="1" d="M52 26 L70 25 L84 22 L100 24" />
        <path pathLength="1" d="M70 25 L81 34 L100 39" />
        <path pathLength="1" d="M52 26 L63 38 L69 47 L72 56.25" />
        <path pathLength="1" d="M63 38 L50 45 L48 56.25" />
        <path pathLength="1" d="M52 26 L36 38 L25 47 L18 56.25" />
        <path pathLength="1" d="M36 38 L17 37 L0 41" />
        <path pathLength="1" d="M52 26 L30 28 L15 25 L0 27" />
      </svg>
      <div className="defeat-shatter-vignette" />
    </div>
  );
}

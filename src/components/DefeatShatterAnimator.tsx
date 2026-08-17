import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { captureDesktopViewport } from "../platform/desktopBridge";
import { useAudioStore } from "../store/useAudioStore";
import { futureVisualSignature } from "../utils/futureIdentity";
import { buildDefeatShatterPlan } from "./defeatShatterGeometry";
import {
  createDefeatGlassMaterial,
  createDefeatShockMaterial,
  type DefeatGlassMaterial,
  type DefeatShockMaterial,
} from "./defeatGlassShader";
import { renderSharedVfxFrame } from "./sharedVfxRenderer";
import { captureTemporalSky } from "./TemporalBackdrop";

type Props = {
  seed: string;
  onSequenceStart: () => void;
};

type ShatterScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  material: DefeatGlassMaterial;
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
/**
 * El reloj arranca con la Vida a 0, no cuando termina la captura: el hielo y las
 * quebraduras entran sobre la pantalla viva mientras se fotografía el tablero. La placa
 * tiene que estar montada antes del golpe; después ya no puede sustituir a la pantalla.
 */
const PLATE_DEADLINE_MS = BURST_MS - 80;
/** Con la placa montada el tablero vivo desaparece y detrás sólo queda el espacio. */
const PLATED_BODY_CLASS = "is-defeat-plated";

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

/**
 * `html-to-image` no puede fotografiar un lienzo WebGL, así que la captura web llega sin
 * cielo. El espacio se pone debajo desde el propio fondo vivo: si la placa entrara con un
 * fondo plano, el cosmos desaparecería de golpe al montarse el vidrio.
 */
function composeOverLiveSky(board: HTMLCanvasElement): HTMLCanvasElement {
  const composed = document.createElement("canvas");
  composed.width = board.width;
  composed.height = board.height;
  const context = composed.getContext("2d");
  if (!context) return board;
  context.fillStyle = "#07110f";
  context.fillRect(0, 0, composed.width, composed.height);
  const sky = captureTemporalSky(composed.width, composed.height);
  if (sky) context.drawImage(sky, 0, 0, composed.width, composed.height);
  context.drawImage(board, 0, 0);
  return composed;
}

async function captureBattlefield(
  width: number,
  height: number,
  overlay: HTMLElement,
): Promise<HTMLCanvasElement | undefined> {
  const gameScreen = document.querySelector<HTMLElement>(".game-screen");
  if (!gameScreen) return undefined;

  // useEffect corre después del commit; esperar otro paint garantiza que Vida 0 ya esté compuesta.
  await settleBefore(nextPaint(), 80);
  // `capturePage` fotografía la ventana entera: el hielo y las quebraduras que ya están
  // corriendo entrarían dentro de la propia placa. Se apagan mientras dura el disparo.
  overlay.style.visibility = "hidden";
  const desktopDataUrl = await settleBefore(captureDesktopViewport(), 900);
  overlay.style.visibility = "";
  if (desktopDataUrl) {
    const desktopCanvas = await dataUrlToCanvas(desktopDataUrl, width, height);
    if (desktopCanvas && snapshotHasVisualDetail(desktopCanvas)) return desktopCanvas;
  }

  // Se fotografía `body`, no `.game-screen`: la Reserva, los tooltips y el registro cuelgan
  // del cuerpo por portal, y capturando sólo el tablero desaparecerían al montarse la placa.
  // Su fondo se apaga mientras dura el clonado; el cielo opaco lo tapa, así que no se ve.
  const screenBackground = gameScreen.style.backgroundColor;
  gameScreen.style.backgroundColor = "transparent";
  try {
    const { toCanvas } = await import("html-to-image");
    const webCanvas = await settleBefore(toCanvas(document.body, {
      width,
      height,
      canvasWidth: width,
      canvasHeight: height,
      pixelRatio: 1,
      skipAutoScale: true,
      cacheBust: false,
      skipFonts: true,
      // Sin relleno propio y con el fondo del cuerpo neutralizado en el clon: el cielo lo
      // aporta el lienzo vivo justo debajo, no un gris plano.
      style: { backgroundColor: "transparent" },
      onImageErrorHandler: () => undefined,
      filter: (node) => (
        !node.classList?.contains("game-result-overlay")
        && !(node instanceof HTMLCanvasElement)
        && !(node instanceof HTMLVideoElement)
        && !(node instanceof HTMLIFrameElement)
      ),
    }), 1300);
    if (!webCanvas) return undefined;
    const composed = composeOverLiveSky(webCanvas);
    return snapshotHasVisualDetail(composed) ? composed : undefined;
  } catch {
    return undefined;
  } finally {
    gameScreen.style.backgroundColor = screenBackground;
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

  // Detrás del vidrio no se dibuja nada: el lienzo queda transparente y lo que aparece a
  // medida que cada trozo se lleva su recorte es el espacio vivo del propio juego.
  const quadGeometry = new THREE.PlaneGeometry(2, 2);

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
    shockMaterial,
    shockMesh,
    cameraRest,
    dispose: () => {
      geometry.dispose();
      quadGeometry.dispose();
      material.dispose();
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
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const [plated, setPlated] = useState(false);
  const playSfx = useAudioStore((state) => state.playSfx);

  useEffect(() => {
    const canvas = canvasRef.current;
    const root = rootRef.current;
    if (!canvas || !root) return;

    // El tablero vivo desaparece en cuanto hay algo que lo sustituya: la placa de vidrio,
    // o el respaldo. Detrás sólo queda el espacio, que es fondo permanente del juego.
    const coverBoard = () => document.body.classList.add(PLATED_BODY_CLASS);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setFallback(true);
      coverBoard();
      onSequenceStart();
      return () => document.body.classList.remove(PLATED_BODY_CLASS);
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    let rendered: ShatterScene | undefined;
    let animationFrame = 0;
    let cancelled = false;

    // La secuencia empieza con la Vida a 0. El hielo y las quebraduras corren ya sobre la
    // pantalla viva mientras se toma la captura, así que el golpe no espera a nadie.
    const startedAt = performance.now();
    onSequenceStart();
    const impactTimer = window.setTimeout(() => playSfx("stoneCrash", { rate: 0.62 }), BURST_MS);

    const begin = async () => {
      try {
        const snapshot = await settleBefore(
          captureBattlefield(width, height, root),
          PLATE_DEADLINE_MS,
        );
        if (cancelled) return;
        if (!snapshot) {
          setFallback(true);
          coverBoard();
          return;
        }
        rendered = createShatterScene(width, height, pixelRatio, futureVisualSignature(seed), snapshot);
        let firstFrame = true;

        const draw = (now: number) => {
          if (cancelled || !rendered) return;
          updateShatterScene(rendered, now - startedAt);
          const drew = renderSharedVfxFrame(canvas, {
            scene: rendered.scene,
            camera: rendered.camera,
            width,
            height,
            pixelRatio,
            // El vidrio se calibró en lineal: la conversión sRGB del renderer compartido
            // aclara la captura y el Fresnel deja de leerse frío.
            outputEncoding: THREE.LinearEncoding,
          });
          if (!drew) {
            setFallback(true);
            coverBoard();
            return;
          }
          if (firstFrame) {
            firstFrame = false;
            // La placa entra en el mismo fotograma en que el tablero vivo se retira: son
            // la misma imagen, así que el relevo no se ve.
            canvas.classList.add("is-ready");
            coverBoard();
            setPlated(true);
          }
          // Los restos suspendidos siguen derivando sobre el espacio hasta que el
          // Cronista elige salida.
          animationFrame = window.requestAnimationFrame(draw);
        };

        animationFrame = window.requestAnimationFrame(draw);
      } catch {
        if (cancelled) return;
        setFallback(true);
        coverBoard();
      }
    };

    void begin();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(impactTimer);
      document.body.classList.remove(PLATED_BODY_CLASS);
      rendered?.dispose();
    };
  }, [onSequenceStart, playSfx, seed]);

  return (
    <div
      ref={rootRef}
      className={`defeat-shatter ${fallback ? "is-fallback" : ""} ${plated ? "is-plated" : ""}`}
      aria-hidden="true"
    >
      {/* El tiempo se detiene con la Vida a 0, no cuando llega la captura: el hielo entra
          sobre la pantalla viva y el vidrio lo hereda al montarse la placa. */}
      <div className="defeat-shatter-freeze" />
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

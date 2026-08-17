import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
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

type Props = {
  seed: string;
  onSequenceStart: () => void;
  /** El desenlace puede nombrarse: el golpe ya ocurrió. */
  onBurst: () => void;
};

type ShatterScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  material: DefeatGlassMaterial;
  shockMaterial: DefeatShockMaterial;
  shockMesh: THREE.Mesh;
  cameraRest: number;
  /** Sustituye el vidrio limpio por la captura del tablero. */
  printBoard: (board: HTMLCanvasElement) => void;
  dispose: () => void;
};

/** El cuarteado recorre la placa, la onda la cruza y con ella sueltan los trozos. */
const CRACK_AT_MS = 620;
const CRACK_SPAN_MS = 900;
const EARLIEST_BURST_MS = 1560;
const SHOCK_SPAN_MS = 940;
/**
 * El reloj arranca con la Vida a 0, nunca cuando termina la captura: el vidrio se cuartea
 * de inmediato, con el tablero vivo todavía detrás de una lámina limpia. Lo único que puede
 * esperar es el golpe, porque imprimir el tablero sobre trozos que ya vuelan sería un
 * salto. Fotografiar el DOM cuesta lo que cuesta y el tope evita quedarse mirando una
 * pantalla rajada: pasado ese margen revienta igual, con vidrio limpio.
 */
const LATEST_BURST_MS = 4200;
/** Después del golpe la captura ya no sirve: llegaría a imprimirse sobre trozos sueltos. */
const PLATE_DEADLINE_MS = LATEST_BURST_MS;
/** Con el tablero ya impreso o estallado, lo vivo se retira y detrás sólo queda el espacio. */
const PLATED_BODY_CLASS = "is-defeat-plated";
/** El desenlace se nombra respecto del golpe real, no del arranque de la secuencia. */
const REVEAL_AFTER_BURST_MS = 1340;

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

/**
 * Rechaza lienzos uniformes: nunca sustituimos la pantalla por un color de reserva. La
 * captura llega con alfa a propósito —el espacio tiene que seguir viéndose por donde el
 * tablero no pinta—, así que se exige materia suficiente y variada, no opacidad.
 */
function snapshotHasVisualDetail(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context || canvas.width < 2 || canvas.height < 2) return false;
  const bins = new Set<string>();
  let minLuma = 255;
  let maxLuma = 0;
  let paintedSamples = 0;
  const columns = 11;
  const rows = 7;
  for (let row = 1; row <= rows; row += 1) {
    for (let column = 1; column <= columns; column += 1) {
      const x = Math.min(canvas.width - 1, Math.round((column / (columns + 1)) * canvas.width));
      const y = Math.min(canvas.height - 1, Math.round((row / (rows + 1)) * canvas.height));
      const [red, green, blue, alpha] = context.getImageData(x, y, 1, 1).data;
      if (alpha <= 24) continue;
      paintedSamples += 1;
      const luma = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      minLuma = Math.min(minLuma, luma);
      maxLuma = Math.max(maxLuma, luma);
      bins.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
    }
  }
  return paintedSamples >= 10 && (maxLuma - minLuma > 18 || bins.size >= 8);
}

/**
 * La placa es el tablero, nunca el fondo.
 *
 * `capturePage` fotografía la ventana entera y devuelve píxeles opacos, así que el espacio
 * acabaría dentro del vidrio y saldría volando con los trozos para reaparecer después. Por
 * eso la captura es siempre `html-to-image`, que sí deja alfa: se fotografía `body` —la
 * Reserva y los tooltips cuelgan de ahí por portal—, se descartan los lienzos WebGL y se
 * neutraliza el fondo de la pantalla. Lo que queda es cartas, campo, HUD y el instrumento
 * de grados sobre transparencia, con el espacio intacto detrás.
 */
async function captureBattlefield(width: number, height: number): Promise<HTMLCanvasElement | undefined> {
  const gameScreen = document.querySelector<HTMLElement>(".game-screen");
  if (!gameScreen) return undefined;

  // useEffect corre después del commit; esperar otro paint garantiza que Vida 0 ya esté compuesta.
  await settleBefore(nextPaint(), 80);

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
      style: { backgroundColor: "transparent" },
      onImageErrorHandler: () => undefined,
      filter: (node) => (
        !node.classList?.contains("game-result-overlay")
        && !(node instanceof HTMLCanvasElement)
        && !(node instanceof HTMLVideoElement)
        && !(node instanceof HTMLIFrameElement)
      ),
    }), 3600);
    if (!webCanvas) return undefined;
    return snapshotHasVisualDetail(webCanvas) ? webCanvas : undefined;
  } catch {
    return undefined;
  } finally {
    gameScreen.style.backgroundColor = screenBackground;
  }
}

/** Lámina limpia: un texel transparente, nunca un color que finja el tablero. */
function createClearGlassTexture(): THREE.CanvasTexture {
  const blank = document.createElement("canvas");
  blank.width = 1;
  blank.height = 1;
  return new THREE.CanvasTexture(blank);
}

function createShatterScene(
  width: number,
  height: number,
  pixelRatio: number,
  signature: number,
): ShatterScene {
  const aspect = width / Math.max(1, height);
  const plan = buildDefeatShatterPlan(aspect, signature);
  const scene = new THREE.Scene();
  const cameraRest = plan.halfHeight / Math.tan(THREE.MathUtils.degToRad(21));
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.02, cameraRest * 40);
  camera.position.set(0, 0, cameraRest);
  camera.lookAt(0, 0, 0);

  // El vidrio nace limpio y se imprime cuando la captura llega: así el cuarteado empieza
  // con la Vida a 0 en vez de esperar a que termine de fotografiarse el tablero.
  const screenTexture = createClearGlassTexture();
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
    printBoard: (board: HTMLCanvasElement) => {
      screenTexture.image = board;
      screenTexture.needsUpdate = true;
    },
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

function updateShatterScene(rendered: ShatterScene, elapsedMs: number, burstAtMs: number): void {
  const material = rendered.material;
  material.uniforms.uCrack.value = clamp01((elapsedMs - CRACK_AT_MS) / CRACK_SPAN_MS);
  material.uniforms.uT.value = (elapsedMs - burstAtMs) / 1000;

  const shock = (elapsedMs - burstAtMs) / SHOCK_SPAN_MS;
  const shockLive = shock >= 0 && shock <= 1;
  material.uniforms.uShock.value = shockLive ? shock : -1;
  rendered.shockMaterial.uniforms.uShock.value = shockLive ? shock : -1;
  rendered.shockMesh.visible = shockLive;

  // Deriva de cámara: sólo tras el estallido, y muy poca. Basta para que los restos
  // suspendidos den paralaje y el vacío se lea como espacio.
  const after = Math.max(0, (elapsedMs - burstAtMs) / 1000);
  const settle = 1 - Math.exp(-after / 1.6);
  rendered.camera.position.set(
    rendered.cameraRest * 0.017 * settle,
    rendered.cameraRest * 0.009 * settle,
    rendered.cameraRest * (1 - 0.058 * settle),
  );
  rendered.camera.lookAt(0, 0, 0);
}

export function DefeatShatterAnimator({ seed, onSequenceStart, onBurst }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
  const [plated, setPlated] = useState(false);
  const [bursting, setBursting] = useState(false);
  const playSfx = useAudioStore((state) => state.playSfx);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // El tablero vivo desaparece en cuanto hay algo que lo sustituya: la placa de vidrio,
    // o el respaldo. Detrás sólo queda el espacio, que es fondo permanente del juego.
    const coverBoard = () => document.body.classList.add(PLATED_BODY_CLASS);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) {
      setFallback(true);
      coverBoard();
      onSequenceStart();
      onBurst();
      return () => document.body.classList.remove(PLATED_BODY_CLASS);
    }

    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.35);
    let animationFrame = 0;
    let cancelled = false;
    let burstAtMs: number | undefined;
    let printed = false;

    // La secuencia empieza con la Vida a 0: la escena existe desde el primer fotograma y
    // el vidrio se cuartea limpio, con el tablero vivo todavía visible a través.
    const startedAt = performance.now();
    const rendered = createShatterScene(width, height, pixelRatio, futureVisualSignature(seed));
    onSequenceStart();

    const fireBurst = (elapsedMs: number) => {
      burstAtMs = elapsedMs;
      // El tablero vivo se retira sí o sí en el golpe: a partir de aquí lo que hay detrás
      // del vidrio es el espacio.
      coverBoard();
      // Estado, no clase suelta: cualquier re-render posterior recalcula `className` y
      // borraría una clase escrita a mano sobre el nodo.
      setBursting(true);
      playSfx("stoneCrash", { rate: 0.62 });
      window.setTimeout(() => {
        if (!cancelled) onBurst();
      }, REVEAL_AFTER_BURST_MS);
    };

    let firstFrame = true;
    const draw = (now: number) => {
      if (cancelled) return;
      const elapsed = now - startedAt;
      // El golpe espera a la captura porque imprimir el tablero sobre trozos que ya vuelan
      // sería un salto; el cuarteado, en cambio, no espera a nadie.
      if (burstAtMs === undefined && elapsed >= (printed ? EARLIEST_BURST_MS : LATEST_BURST_MS)) {
        fireBurst(Math.max(EARLIEST_BURST_MS, elapsed));
      }
      // Sin golpe todavía, el reloj del estallido se mantiene lejos en el futuro.
      updateShatterScene(rendered, elapsed, burstAtMs ?? elapsed + 1_000_000);
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
        onBurst();
        return;
      }
      if (firstFrame) {
        firstFrame = false;
        canvas.classList.add("is-ready");
      }
      // Los restos suspendidos siguen derivando sobre el espacio hasta que el Cronista
      // elige salida.
      animationFrame = window.requestAnimationFrame(draw);
    };

    const begin = async () => {
      try {
        const snapshot = await settleBefore(captureBattlefield(width, height), PLATE_DEADLINE_MS);
        if (cancelled || !snapshot) return;
        // Pasado el golpe la captura ya no sirve: el vidrio limpio se queda como está.
        if (burstAtMs !== undefined) return;
        rendered.printBoard(snapshot);
        printed = true;
        // La placa releva a la pantalla viva en el mismo fotograma: es la misma imagen,
        // así que el relevo no se ve.
        coverBoard();
        setPlated(true);
      } catch {
        // Sin captura el vidrio se rompe igual, limpio y sobre el espacio.
      }
    };

    animationFrame = window.requestAnimationFrame(draw);
    void begin();
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      document.body.classList.remove(PLATED_BODY_CLASS);
      rendered.dispose();
    };
  }, [onBurst, onSequenceStart, playSfx, seed]);

  return (
    <div
      className={[
        "defeat-shatter",
        fallback ? "is-fallback" : "",
        plated ? "is-plated" : "",
        bursting ? "is-bursting" : "",
      ].join(" ")}
      aria-hidden="true"
    >
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

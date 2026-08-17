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
import { boundedVfxPixelRatio, renderSharedVfxFrame } from "./sharedVfxRenderer";

type Props = {
  seed: string;
  snapshotImage?: HTMLImageElement;
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
  dispose: () => void;
};

/** El cuarteado recorre la placa, la onda la cruza y con ella sueltan los trozos. */
const CRACK_AT_MS = 0;
const CRACK_SPAN_MS = 900;
/** La maqueta deja apenas un beat de tensión entre completar la grieta y soltar los trozos. */
const BURST_SETTLE_MS = 40;
const BURST_AT_MS = CRACK_AT_MS + CRACK_SPAN_MS + BURST_SETTLE_MS;
const SHOCK_SPAN_MS = 940;
/** Con el tablero ya impreso o estallado, lo vivo se retira y detrás sólo queda el espacio. */
const PLATED_BODY_CLASS = "is-defeat-plated";
/** El desenlace se nombra respecto del golpe real, no del arranque de la secuencia. */
const REVEAL_AFTER_BURST_MS = 1340;
/** El canvas se copia de WebGL a 2D: más de 60 entregas por segundo sólo duplican trabajo. */
const FRAME_INTERVAL_MS = 1000 / 60;

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
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
  snapshotImage?: HTMLImageElement,
): ShatterScene {
  const aspect = width / Math.max(1, height);
  const plan = buildDefeatShatterPlan(aspect, signature);
  const scene = new THREE.Scene();
  const cameraRest = plan.halfHeight / Math.tan(THREE.MathUtils.degToRad(21));
  const camera = new THREE.PerspectiveCamera(42, aspect, 0.02, cameraRest * 40);
  camera.position.set(0, 0, cameraRest);
  camera.lookAt(0, 0, 0);

  // Board decodifica la captura antes de montar este efecto. Sin bridge nativo conservamos
  // la lámina limpia para que la ruta web nunca invente una pantalla negra.
  const screenTexture = createClearGlassTexture();
  if (snapshotImage) screenTexture.image = snapshotImage;
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

export function DefeatShatterAnimator({ seed, snapshotImage, onSequenceStart, onBurst }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fallback, setFallback] = useState(false);
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
    const pixelRatio = boundedVfxPixelRatio(width, height, window.devicePixelRatio || 1);
    let animationFrame = 0;
    let cancelled = false;
    let burstAtMs: number | undefined;
    let coverAfterPaint = false;
    let lastRenderedAt = Number.NEGATIVE_INFINITY;

    // La captura ya está decodificada. La escena se crea antes del reloj visible para poder
    // pagar aquí la primera compilación/subida/copia sin saltarse ningún frame del cuarteado.
    let startedAt = 0;
    const rendered = createShatterScene(
      width,
      height,
      pixelRatio,
      futureVisualSignature(seed),
      snapshotImage,
    );

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

    const renderShatterFrame = () => renderSharedVfxFrame(canvas, {
      scene: rendered.scene,
      camera: rendered.camera,
      width,
      height,
      pixelRatio,
      // El vidrio se calibró en lineal: la conversión sRGB del renderer compartido
      // conserva los colores de la captura y el Fresnel no se vuelve frío.
      outputEncoding: THREE.LinearEncoding,
    });

    // Este render permanece oculto. Fuerza contexto, shaders, textura fullscreen y copia 2D
    // antes de iniciar el reloj que mueve las grietas.
    const preflightDrew = renderShatterFrame();
    if (!preflightDrew) {
      setFallback(true);
      coverBoard();
      onSequenceStart();
      onBurst();
      return () => {
        document.body.classList.remove(PLATED_BODY_CLASS);
        rendered.dispose();
      };
    }

    let firstFrame = true;
    const draw = (now: number) => {
      if (cancelled) return;

      // El frame anterior ya subió, copió y pintó la placa. Recién en este rAF se retira
      // el tablero vivo, para no sumar la invalidación del DOM a la subida de la textura.
      if (coverAfterPaint) {
        coverAfterPaint = false;
        coverBoard();
      }

      // En paneles de 120/144 Hz la copia WebGL→2D no necesita repetirse en cada refresco.
      // El reloj sigue basado en `now`, por lo que saltar una entrega no ralentiza el efecto.
      if (now - lastRenderedAt < FRAME_INTERVAL_MS) {
        animationFrame = window.requestAnimationFrame(draw);
        return;
      }
      const sinceLastRender = now - lastRenderedAt;
      lastRenderedAt = Number.isFinite(sinceLastRender)
        ? now - (sinceLastRender % FRAME_INTERVAL_MS)
        : now;

      const elapsed = now - startedAt;
      if (burstAtMs === undefined && elapsed >= BURST_AT_MS) {
        fireBurst(elapsed);
      }
      // Sin golpe todavía, el reloj del estallido se mantiene lejos en el futuro.
      updateShatterScene(rendered, elapsed, burstAtMs ?? elapsed + 1_000_000);
      const drew = renderShatterFrame();
      if (!drew) {
        setFallback(true);
        coverBoard();
        onBurst();
        return;
      }
      if (firstFrame) {
        firstFrame = false;
        canvas.classList.add("is-ready");
        // Con captura, este frame pinta la placa y el siguiente retira el tablero vivo. En web
        // se conserva el tablero hasta el golpe porque la lámina limpia no puede sustituirlo.
        coverAfterPaint = Boolean(snapshotImage);
      }
      // Los restos suspendidos siguen derivando sobre el espacio hasta que el Cronista
      // elige salida.
      animationFrame = window.requestAnimationFrame(draw);
    };

    animationFrame = window.requestAnimationFrame((now) => {
      if (cancelled) return;
      startedAt = now;
      onSequenceStart();
      draw(now);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(animationFrame);
      document.body.classList.remove(PLATED_BODY_CLASS);
      rendered.dispose();
    };
  }, [onBurst, onSequenceStart, playSfx, seed, snapshotImage]);

  return (
    <div
      className={[
        "defeat-shatter",
        fallback ? "is-fallback" : "",
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

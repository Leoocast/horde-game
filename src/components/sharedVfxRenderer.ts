import * as THREE from "three";

/**
 * Un único contexto WebGL para todos los efectos del juego.
 *
 * El navegador sólo admite del orden de dieciséis contextos vivos por página y descarta el más
 * antiguo al pasarse, dejando ese lienzo roto en pantalla. Los animadores montados por carta abrían
 * uno por criatura, así que el cupo dependía del contenido del tablero. Aquí se abre uno solo: cada
 * efecto dibuja su escena en este lienzo compartido y copia el resultado a su propio lienzo 2D, que
 * no consume cupo.
 *
 * Contexto y diseño completos en `docs/plans/webgl_context_budget.md`.
 */

export type SharedVfxFrame = {
  scene: THREE.Scene;
  camera: THREE.Camera;
  /** Tamaño del destino en píxeles CSS. */
  width: number;
  height: number;
  pixelRatio: number;
  /** Estado global del renderer que debe restaurarse para este efecto. */
  outputEncoding?: THREE.TextureEncoding;
};

export type SharedVfxSurface = {
  /** Tamaño del búfer compartido, en píxeles de dispositivo. */
  width: number;
  height: number;
};

/** Redimensionar reasigna el búfer, así que sólo se hace cuando el efecto no cabe. La superficie
 * crece hasta el efecto más grande visto y no vuelve a encogerse durante la sesión. */
export function grownVfxSurface(
  current: SharedVfxSurface,
  requestedWidth: number,
  requestedHeight: number,
): SharedVfxSurface {
  return {
    width: Math.max(current.width, Math.max(1, Math.ceil(requestedWidth))),
    height: Math.max(current.height, Math.max(1, Math.ceil(requestedHeight))),
  };
}

/** El búfer compartido dibuja desde su esquina inferior izquierda, mientras que `drawImage` lee
 * desde la superior izquierda. Esta es la fila de origen del recorte que hay que copiar. */
export function sharedVfxSourceTop(surfaceHeight: number, frameHeight: number): number {
  return Math.max(0, surfaceHeight - frameHeight);
}

let renderer: THREE.WebGLRenderer | null = null;
let surface: SharedVfxSurface = { width: 1, height: 1 };
let unavailable = false;

function releaseRenderer(): void {
  renderer = null;
  surface = { width: 1, height: 1 };
}

function acquireRenderer(): THREE.WebGLRenderer | null {
  if (renderer) return renderer;
  if (unavailable) return null;
  try {
    // Lienzo propio y no adjunto al documento: nadie más lo toca y nunca se reutiliza uno perdido.
    const canvas = document.createElement("canvas");
    const created = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      // Los shaders transparentes del juego, incluido Burn, entregan color premultiplicado.
      // Mantener el mismo contrato en el contexto evita multiplicar el alfa otra vez al copiar
      // el framebuffer WebGL a los canvas 2D de destino.
      premultipliedAlpha: true,
    });
    created.setClearColor(0x000000, 0);
    created.setPixelRatio(1);
    created.outputEncoding = THREE.sRGBEncoding;
    canvas.addEventListener("webglcontextlost", (event) => {
      // Si el navegador nos quita el contexto, se descarta el renderer entero: el siguiente efecto
      // creará uno nuevo sobre un lienzo nuevo. Reutilizar un lienzo perdido no funciona nunca.
      event.preventDefault();
      releaseRenderer();
    });
    renderer = created;
    surface = { width: 1, height: 1 };
    return renderer;
  } catch {
    unavailable = true;
    return null;
  }
}

function prepareSharedSurface(
  active: THREE.WebGLRenderer,
  width: number,
  height: number,
  pixelRatio: number,
  outputEncoding: THREE.TextureEncoding = THREE.sRGBEncoding,
): { pixelWidth: number; pixelHeight: number } {
  active.setClearColor(0x000000, 0);
  active.setPixelRatio(1);
  active.outputEncoding = outputEncoding;

  const pixelWidth = Math.max(1, Math.round(width * pixelRatio));
  const pixelHeight = Math.max(1, Math.round(height * pixelRatio));
  const grown = grownVfxSurface(surface, pixelWidth, pixelHeight);
  if (grown.width !== surface.width || grown.height !== surface.height) {
    surface = grown;
    active.setSize(surface.width, surface.height, false);
  }

  active.setViewport(0, 0, pixelWidth, pixelHeight);
  active.setScissor(0, 0, pixelWidth, pixelHeight);
  active.setScissorTest(true);
  return { pixelWidth, pixelHeight };
}

/**
 * Compila y ejecuta una escena mientras la pantalla de carga sigue visible. Las escenas de
 * calentamiento se conservan durante la sesión para que Three.js mantenga vivos los programas
 * GPU que después reutilizan los animadores reales.
 */
export function warmSharedVfxFrame(frame: SharedVfxFrame): boolean {
  const active = acquireRenderer();
  if (!active) return false;

  prepareSharedSurface(
    active,
    frame.width,
    frame.height,
    frame.pixelRatio,
    frame.outputEncoding,
  );
  active.clear();
  active.compile(frame.scene, frame.camera);
  active.render(frame.scene, frame.camera);
  // Evita que el driver difiera la compilación hasta el primer efecto visible.
  active.getContext().finish();
  active.setScissorTest(false);
  return true;
}

/** True cuando el navegador no puede dar contexto WebGL: el animador debe mostrar su respaldo. */
export function sharedVfxUnavailable(): boolean {
  return unavailable && !renderer;
}

/**
 * Dibuja un fotograma del efecto y lo copia al lienzo de destino. Devuelve `false` si no hay
 * contexto disponible, para que el animador pueda caer a su presentación de respaldo.
 */
export function renderSharedVfxFrame(
  target: HTMLCanvasElement,
  frame: SharedVfxFrame,
): boolean {
  const active = acquireRenderer();
  if (!active) return false;

  // El renderer es compartido: ningún efecto puede heredar estado global del fotograma anterior.
  const { pixelWidth, pixelHeight } = prepareSharedSurface(
    active,
    frame.width,
    frame.height,
    frame.pixelRatio,
    frame.outputEncoding,
  );

  // El resto de la superficie pertenece a otros efectos: se limpia y se dibuja sólo este recorte.
  active.clear();
  active.render(frame.scene, frame.camera);
  active.setScissorTest(false);

  if (target.width !== pixelWidth) target.width = pixelWidth;
  if (target.height !== pixelHeight) target.height = pixelHeight;
  const context = target.getContext("2d");
  if (!context) return false;
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.drawImage(
    active.domElement,
    0,
    sharedVfxSourceTop(surface.height, pixelHeight),
    pixelWidth,
    pixelHeight,
    0,
    0,
    pixelWidth,
    pixelHeight,
  );
  return true;
}

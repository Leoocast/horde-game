import * as THREE from "three";

/**
 * El vidrio de la derrota.
 *
 * Toda la animación ocurre en el vertex shader a partir de los atributos por trozo que
 * emite `defeatShatterGeometry`: una sola malla y una sola llamada de dibujo. El
 * fragment hace el cristal —refracción, Fresnel, especular y canto biselado— en vez de
 * depender de luces de escena, porque el brillo tiene que depender de la orientación
 * real de cada trozo cuando gira.
 */

export type DefeatGlassMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uBoard: { value: THREE.Texture | null };
    uT: { value: number };
    uCrack: { value: number };
    uFreeze: { value: number };
    uShock: { value: number };
    uImpact: { value: THREE.Vector2 };
    uImpactUv: { value: THREE.Vector2 };
    uAspect: { value: number };
    /** Alto del plano en unidades de mundo: las magnitudes del diseño se dieron sobre 1. */
    uScale: { value: number };
  };
};

const VERTEX = `
attribute vec3 aCentroid;
attribute vec2 aUv;
attribute vec3 aNrm;
attribute vec3 aAxis;
attribute vec4 aMotion;
attribute vec3 aDyn;
attribute vec4 aInfo;

uniform float uT;
uniform float uCrack;
uniform vec2 uImpact;
uniform float uScale;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPos;
varying float vKind;
varying float vSeed;
varying float vFade;
varying float vExpand;

mat3 rotAxis(vec3 a, float angle) {
  float c = cos(angle);
  float s = sin(angle);
  float o = 1.0 - c;
  return mat3(
    c + a.x * a.x * o,        a.y * a.x * o + a.z * s,  a.z * a.x * o - a.y * s,
    a.x * a.y * o - a.z * s,  c + a.y * a.y * o,        a.z * a.y * o + a.x * s,
    a.x * a.z * o + a.y * s,  a.y * a.z * o - a.x * s,  c + a.z * a.z * o
  );
}

void main() {
  vec2 toEdge = aCentroid.xy - uImpact;
  vec3 dir = normalize(vec3(toEdge, 0.0001));

  // El cuarteado recorre la placa en radial. La distancia llega normalizada, así que
  // con uCrack = 1 la grieta sí alcanza las esquinas.
  float wave = clamp(uCrack * 2.0 - aInfo.w, 0.0, 1.0);
  wave = wave * wave * (3.0 - 2.0 * wave);
  vec3 crack = dir * wave * 0.004 * uScale
             + vec3(0.0, 0.0, (aInfo.x - 0.5) * wave * 0.006 * uScale);
  mat3 stress = rotAxis(aAxis, wave * 0.016);

  float t = max(0.0, uT - aMotion.w);
  float kick = 1.0 - exp(-t / aDyn.y);
  vec3 launch = aMotion.xyz;
  // Impulso que decae más deriva constante: una sola función continua, sin costura.
  vec3 offset = launch * kick + launch * 0.2 * t;

  vec3 axis2 = normalize(cross(aAxis, vec3(0.0, 0.0, 1.0)) + vec3(0.001, 0.0, 0.0));
  float angle = aDyn.x * (kick * 0.55 + t * 0.42);
  mat3 spin = rotAxis(aAxis, angle) * rotAxis(axis2, aDyn.z * t);

  float flying = step(0.0001, t);
  // Los prismas vecinos comparten arista, así que sus muros coinciden en el espacio y
  // en escorzo asomarían como un enrejado dorado en z-fighting sobre la placa intacta.
  // Mientras es una lámina continua el espesor es cero y sólo gana grosor al separarse.
  float expand = clamp(max(wave * 0.25, flying), 0.0, 1.0);
  vec3 solid = vec3(position.xy, position.z * expand);
  vec3 local = mix(stress * solid, spin * solid, flying);
  vec3 world = aCentroid + crack + offset + local;
  vec3 nrm = mix(stress * aNrm, spin * aNrm, flying);

  float fade = 1.0;
  if (aInfo.z > 0.5) {
    fade = mix(1.0, 0.78, smoothstep(0.6, 2.6, t));
  } else {
    fade = 1.0 - smoothstep(1.0, 2.4, t);
  }

  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  vViewPos = mv.xyz;
  vNormalView = normalize(normalMatrix * nrm);
  vUv = aUv;
  vKind = aInfo.y;
  vSeed = aInfo.x;
  vFade = fade;
  vExpand = expand;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAGMENT = `
precision highp float;

uniform sampler2D uBoard;
uniform float uFreeze;
uniform float uShock;
uniform vec2 uImpactUv;
uniform float uAspect;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewPos;
varying float vKind;
varying float vSeed;
varying float vFade;
varying float vExpand;

void main() {
  if (vFade < 0.02) discard;
  // Mientras la placa es una lámina continua sólo existe la cara frontal: la trasera
  // quedaría coplanar con ella y se repartirían el z-buffer a parches.
  if (vKind > 0.5 && vExpand < 0.02) discard;

  vec3 V = normalize(-vViewPos);
  // La normal se orienta hacia el observador comparándola con la vista, no con
  // gl_FrontFacing: el enrollado del teselado no es fiable, y una normal que apunta al
  // lado contrario da ndv = 0, o sea Fresnel al máximo y la cara entera plana.
  vec3 N = normalize(vNormalView);
  N *= sign(dot(N, V) + 0.0001);

  vec2 bend = N.xy * 0.045;

  // La onda expansiva empuja la muestra hacia fuera a su paso: el tablero se dobla de
  // verdad bajo el frente en vez de recibir un destello encima.
  vec2 toImpact = (vUv - uImpactUv) * vec2(uAspect, 1.0);
  float shockR = length(toImpact);
  float shockFront = uShock * 1.3;
  float shockBand = exp(-pow((shockR - shockFront) / 0.038, 2.0)) * step(0.0, uShock);
  bend += normalize(toImpact + 0.0001) * shockBand * 0.042;

  vec3 base;
  base.r = texture2D(uBoard, vUv + bend * 1.18).r;
  base.g = texture2D(uBoard, vUv + bend).g;
  base.b = texture2D(uBoard, vUv + bend * 0.82).b;

  // Sello frío del momento de detener.
  float luma = dot(base, vec3(0.299, 0.587, 0.114));
  base = mix(base, mix(vec3(luma), vec3(luma) * vec3(0.82, 0.98, 1.0), 0.6), uFreeze * 0.34);
  base *= mix(1.0, 0.88, uFreeze);

  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - ndv, 3.0);
  vec3 cold = vec3(0.42, 0.62, 0.70);
  vec3 warm = vec3(0.95, 0.74, 0.34);
  vec3 rim = mix(cold, warm, smoothstep(0.42, 0.86, vSeed));

  vec3 keyLight = normalize(vec3(-0.42, 0.68, 0.6));
  vec3 halfVec = normalize(keyLight + V);
  float spec = pow(max(dot(N, halfVec), 0.0), 52.0);
  float sheen = pow(max(dot(N, normalize(vec3(0.6, -0.3, 0.74))), 0.0), 18.0) * 0.22;

  vec3 color = base * (0.84 + 0.28 * ndv);
  color += rim * fresnel * 0.8;
  color += vec3(1.0, 0.97, 0.9) * spec * 0.95;
  color += cold * sheen;

  if (vKind > 1.5) {
    // Canto biselado: dorado propio, no un trozo de tablero estirado.
    color = mix(color * 0.3, warm, 0.62) + spec * 0.7 + fresnel * 0.3;
  } else if (vKind > 0.5) {
    color *= 0.42;
  }

  color += vec3(0.86, 0.94, 1.0) * shockBand * 0.3;

  gl_FragColor = vec4(color, vFade);
}
`;

/**
 * Fondo y onda viven en la misma escena que el vidrio en vez de en pasadas aparte:
 * `renderSharedVfxFrame` dibuja una sola escena con una cámara, y abrir un segundo
 * contexto WebGL sólo para esto no compensa. Este vertex ignora la cámara a propósito,
 * así que ambas capas cubren el cuadro sea cual sea la deriva del encuadre.
 */
const FULLSCREEN_VERTEX = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Frente de fuerza expansiva, aditivo y por encima del vidrio. */
const SHOCK_FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform vec2 uImpactP;
uniform float uShock;

void main() {
  if (uShock < 0.0) discard;
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 d = p - uImpactP;
  float r = length(d);
  float angle = atan(d.y, d.x);

  float front = uShock * 1.3;
  // Un frente delgado, no un disco: si el halo engorda, tapa el vidrio.
  float thickness = mix(0.006, 0.030, uShock);
  float band = exp(-pow((r - front) / thickness, 2.0));
  float trail = exp(-pow((r - front * 0.9) / (thickness * 2.2), 2.0));
  float lip = exp(-pow((r - front * 1.05) / (thickness * 1.3), 2.0));
  float fade = pow(1.0 - uShock, 1.9);

  // Radios irregulares: un anillo perfecto se lee como una animación de CSS.
  float spokes = 0.6 + 0.4 * sin(angle * 34.0 + uShock * 5.0)
               + 0.22 * sin(angle * 11.0 - uShock * 2.0);
  vec3 color = vec3(1.0, 0.95, 0.86) * band * 0.95 * mix(0.7, 1.25, clamp(spokes, 0.0, 1.0));
  color += vec3(0.3, 0.74, 0.88) * trail * 0.22;
  color += vec3(0.95, 0.72, 0.34) * lip * 0.2;

  // Fogonazo del primer instante, centrado en el impacto.
  float flash = exp(-uShock * 14.0) * (1.0 - smoothstep(0.0, 0.3, r));
  color += vec3(1.0, 0.97, 0.92) * flash * 1.2;

  gl_FragColor = vec4(color * fade, 1.0);
}
`;

export type DefeatShockMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uRes: { value: THREE.Vector2 };
    uImpactP: { value: THREE.Vector2 };
    uShock: { value: number };
  };
};

export function createDefeatShockMaterial(
  width: number,
  height: number,
  impactP: { x: number; y: number },
): DefeatShockMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(width, height) },
      uImpactP: { value: new THREE.Vector2(impactP.x, impactP.y) },
      uShock: { value: -1 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: SHOCK_FRAGMENT,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }) as DefeatShockMaterial;
}

/**
 * El abismo que queda detrás del vidrio. Es lo que ve el Cronista cuando los trozos se
 * van: nebulosa fría, estrellas moribundas y un vacío que se traga la luz en el centro.
 * Va como malla opaca dentro de la misma escena, antes que el vidrio, porque
 * `renderSharedVfxFrame` dibuja una sola escena con una cámara. El vertex ignora la
 * cámara a propósito, así que cubre el cuadro sea cual sea la deriva del encuadre.
 */
const ABYSS_FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.54;
  mat2 turn = mat2(0.82, -0.57, 0.57, 0.82);
  for (int i = 0; i < 5; i++) {
    value += amplitude * valueNoise(p);
    p = turn * p * 2.03 + vec2(17.13, 9.71);
    amplitude *= 0.48;
  }
  return value;
}

float starLayer(vec2 p, float scale, float gate) {
  vec2 grid = p * scale;
  vec2 id = floor(grid);
  vec2 cell = fract(grid) - 0.5;
  float seed = hash21(id);
  vec2 shift = (hash22(id + 7.31) - 0.5) * 0.7;
  float d = length(cell - shift);
  float core = (1.0 - smoothstep(0.0, 0.038, d)) * step(gate, seed);
  float halo = (1.0 - smoothstep(0.0, 0.13, d)) * step(0.993, seed) * 0.28;
  float twinkle = 0.93 + 0.07 * sin(uTime * 0.08 + seed * 6.2831);
  return (core + halo) * twinkle;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  vec2 drift = vec2(uTime * 0.0022, -uTime * 0.0014);
  vec2 warp = vec2(fbm(p * 1.42 + drift + 3.7), fbm(p * 1.42 - drift + 11.9)) - 0.5;
  vec2 q = p + warp * 0.17;
  float broad = fbm(q * 1.72 + drift * 0.7);
  float folds = fbm(q * 3.86 - drift * 1.3 + 23.4);
  float edgeBias = smoothstep(0.1, 0.74, length(p - vec2(-0.11, 0.03)));
  float nebula = smoothstep(0.54, 0.88, broad + folds * 0.18) * mix(0.16, 0.82, edgeBias);
  float coldVein = smoothstep(0.68, 0.91, fbm(q * 4.8 + vec2(7.4, 2.1))) * nebula;
  float rustTrace = smoothstep(0.81, 0.96, fbm(q * 6.1 + vec2(31.2, 15.7))) * edgeBias;
  float swallowingCloud = smoothstep(0.3, 0.73, fbm(q * 2.46 + vec2(4.9, 26.1)));

  vec3 color = vec3(0.0008, 0.002, 0.006);
  color += vec3(0.003, 0.012, 0.029) * (0.12 + broad * 0.45);
  color += vec3(0.012, 0.055, 0.076) * nebula * 0.72;
  color += vec3(0.014, 0.12, 0.15) * coldVein * 0.3;
  color += vec3(0.12, 0.025, 0.014) * rustTrace * 0.18;
  color *= mix(0.28, 1.0, swallowingCloud);

  float whiteStars = starLayer(p + warp * 0.035, 72.0, 0.982);
  float blueStars = starLayer(p * 1.017 - warp * 0.025 + 5.3, 141.0, 0.997);
  float dyingStars = starLayer(p - warp * 0.02 + 13.7, 96.0, 0.998);
  color += vec3(0.44, 0.57, 0.64) * whiteStars * 0.48;
  color += vec3(0.11, 0.26, 0.34) * blueStars * 0.4;
  color += vec3(0.4, 0.22, 0.12) * dyingStars * 0.3;

  vec2 timeCenter = p - vec2(0.035, -0.04);
  float radius = length(timeCenter);
  float timeRipple = sin(radius * 78.0 - uTime * 0.08) * exp(-radius * 7.5);
  color += vec3(0.025, 0.085, 0.1) * max(0.0, timeRipple) * 0.025;

  // El vacío del centro se traga la luz: no es un degradado encima, apaga la paleta.
  float abyss = 1.0 - smoothstep(0.09, 0.49, radius + warp.x * 0.13);
  color *= mix(1.0, 0.2, abyss);
  float vignette = 1.0 - smoothstep(0.42, 0.98, length(p * vec2(0.76, 1.0)));
  color *= mix(0.43, 1.0, vignette);

  gl_FragColor = vec4(pow(color, vec3(0.94)), 1.0);
}
`;

export type DefeatAbyssMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uRes: { value: THREE.Vector2 };
    uTime: { value: number };
  };
};

export function createDefeatAbyssMaterial(width: number, height: number): DefeatAbyssMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uRes: { value: new THREE.Vector2(width, height) },
      uTime: { value: 0 },
    },
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: ABYSS_FRAGMENT,
    // Opaco y sin z: es el fondo, y el vidrio decide su propia profundidad encima.
    transparent: false,
    depthTest: false,
    depthWrite: false,
  }) as DefeatAbyssMaterial;
}

export function createDefeatGlassMaterial(
  board: THREE.Texture,
  impact: { x: number; y: number },
  impactUv: { x: number; y: number },
  aspect: number,
  scale: number,
): DefeatGlassMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uBoard: { value: board },
      uT: { value: -1 },
      uCrack: { value: 0 },
      uFreeze: { value: 0 },
      uShock: { value: -1 },
      uImpact: { value: new THREE.Vector2(impact.x, impact.y) },
      uImpactUv: { value: new THREE.Vector2(impactUv.x, impactUv.y) },
      uAspect: { value: aspect },
      uScale: { value: scale },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  }) as DefeatGlassMaterial;
}

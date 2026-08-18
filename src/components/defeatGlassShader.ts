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

  vec4 middle = texture2D(uBoard, vUv + bend);
  vec3 base;
  base.r = texture2D(uBoard, vUv + bend * 1.18).r;
  base.g = middle.g;
  base.b = texture2D(uBoard, vUv + bend * 0.82).b;
  // La captura del tablero llega con alfa: lo que el tablero deja ver es cielo, no un
  // relleno. Mientras la captura no está lista, la lámina entera es vidrio limpio.
  float printed = middle.a;

  // Nada de sello frío antes del golpe: la placa tiene que ser la misma pantalla que
  // sustituye. Cualquier tinte previo se lee como que algo cambió sin motivo.
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

  // El vidrio existe aunque no haya nada impreso encima: se lee por su Fresnel, su
  // especular y sus cantos. Donde la captura sí pintó, la placa es opaca como la pantalla
  // que sustituye; donde no, el espacio del juego sigue viéndose a través.
  float glassEdge = clamp(fresnel * 0.9 + spec * 1.25 + sheen * 2.4 + shockBand * 0.6, 0.0, 1.0);
  if (vKind > 1.5) glassEdge = max(glassEdge, 0.55);

  gl_FragColor = vec4(color, vFade * max(printed, glassEdge));
}
`;

/**
 * La onda vive en la misma escena que el vidrio en vez de en una pasada aparte:
 * `renderSharedVfxFrame` dibuja una sola escena con una cámara, y abrir un segundo
 * contexto WebGL sólo para esto no compensa. Este vertex ignora la cámara a propósito,
 * así que la capa cubre el cuadro sea cual sea la deriva del encuadre.
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

  // Este quad vive sobre un framebuffer transparente. Alfa 1 fuera del frente escribiría una
  // lámina negra de pantalla completa hasta que termine la onda, tapando el cielo del juego.
  vec3 emitted = color * fade;
  float coverage = clamp(max(emitted.r, max(emitted.g, emitted.b)), 0.0, 1.0);
  if (coverage < 0.001) discard;
  gl_FragColor = vec4(emitted, coverage);
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
    premultipliedAlpha: true,
  }) as DefeatShockMaterial;
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

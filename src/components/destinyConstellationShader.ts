import {
  DESTINY_CONSTELLATION_EDGES,
  DESTINY_CONSTELLATION_NODES,
} from "./destinyConstellationGeometry";

/**
 * La constelación de la Victoria: una escena y un plano, como Burn, el vórtice y el signo.
 *
 * Motas de luz entran desde puntos deterministas fuera de los cuatro bordes, cada encuentro fija
 * una punta y el contorno se traza detrás. Todo el brillo vive en el corazón y en las ocho puntas;
 * el contorno y las facetas apenas se leen, igual que en el signo del Futuro.
 *
 * Dos decisiones que no son de gusto:
 *
 * - Las posiciones llegan relativas al centro del instrumento, no en píxeles absolutos: el plan se
 *   deriva del aro del disco de grados y así la figura no se descoloca al redimensionar.
 * - Hay una rodilla fílmica antes de componer. Por encima de 1.0 la suma aditiva se convierte en
 *   pantalla blanca, y a oscuras eso es exactamente lo que hace daño.
 */
export const DESTINY_CONSTELLATION_VERTEX_SHADER = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const DESTINY_CONSTELLATION_FRAGMENT_SHADER = `
precision highp float;

#define NODES ${DESTINY_CONSTELLATION_NODES}
#define EDGES ${DESTINY_CONSTELLATION_EDGES}
#define HEART (NODES - 1)

uniform vec2 uRes;          // viewport en px CSS
uniform float uPixelRatio;
uniform float uTime;        // reloj continuo en segundos, sólo para la respiración
uniform float uT;           // 0..1 de la construcción
uniform vec2 uCenter;       // centro del instrumento en px CSS
uniform float uUnit;        // unidad de la figura: la punta larga mide uUnit * 2.24
uniform float uBloom;       // 0..1 de la floración final
uniform float uSeed;        // firma 0..1: el mismo Futuro reparte igual sus motas
// xy = desplazamiento respecto al centro, z = instante en que queda fijo, w = semilla propia
uniform vec4 uNode[NODES];
// xy/zw = extremos, también relativos al centro
uniform vec4 uEdge[EDGES];
uniform float uEdgeT[EDGES];

float h11(float n) { return fract(sin(n * 78.233) * 43758.5453123); }

float h13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(h13(i), h13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(h13(i + vec3(0.0, 1.0, 0.0)), h13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(h13(i + vec3(0.0, 0.0, 1.0)), h13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(h13(i + vec3(0.0, 1.0, 1.0)), h13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y),
    f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p *= 2.13;
    amp *= 0.5;
  }
  return sum;
}

float segSD(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

void add(inout vec3 col, inout float al, vec3 c, float amt) {
  if (amt <= 0.0015) return;
  col += c * amt;
  al = al + (1.0 - al) * clamp(amt, 0.0, 1.0);
}

const vec3 COLD = vec3(0.42, 0.86, 0.82);
const vec3 WARM = vec3(1.00, 0.82, 0.42);
const vec3 CORE = vec3(1.00, 0.97, 0.88);

void main() {
  vec2 p = vec2(gl_FragCoord.x / uPixelRatio, uRes.y - gl_FragCoord.y / uPixelRatio);
  vec3 col = vec3(0.0);
  float al = 0.0;

  // 1. La luz del desenlace empieza a subir desde abajo, apenas un velo.
  float lift = smoothstep(0.0, 0.5, uT);
  float veil = fbm(vec3(p.x * 0.004, p.y * 0.003 - uTime * 0.14, 4.0 + uSeed * 3.0));
  add(col, al, COLD, smoothstep(0.45, 0.85, veil) * lift * (1.0 - p.y / uRes.y) * 0.16);

  // 2. Motas que entran desde puntos deterministas fuera de los cuatro bordes. Sólo viajan
  //    hacia el corazón y hacia las ocho puntas: los valles se encienden con el contorno.
  for (int i = 0; i < NODES; i++) {
    bool heartNode = i == HEART;
    bool tipNode = !heartNode && mod(float(i), 2.0) < 0.5;
    if (!heartNode && !tipNode) continue;
    vec4 nd = uNode[i];
    vec2 at = uCenter + nd.xy;
    float lock = nd.z;
    for (int j = 0; j < 5; j++) {
      float sd = nd.w + float(j) * 13.7;
      float born = max(0.0, lock - 0.34 - h11(sd) * 0.18);
      float k = (uT - born) / max(lock - born, 0.001);
      if (k <= 0.0 || k >= 1.08) continue;
      float e = clamp(k, 0.0, 1.0);
      float ease = e * e * (3.0 - 2.0 * e);
      float sidePick = floor(h11(sd * 2.1) * 4.0);
      float lane = 0.025 + h11(sd * 4.7) * 0.95;
      float outside = uUnit * (0.65 + h11(sd * 5.3) * 0.65);
      vec2 from = vec2(-outside, lane * uRes.y);
      if (sidePick >= 1.0 && sidePick < 2.0) from = vec2(uRes.x + outside, lane * uRes.y);
      else if (sidePick >= 2.0 && sidePick < 3.0) from = vec2(lane * uRes.x, -outside);
      else if (sidePick >= 3.0) from = vec2(lane * uRes.x, uRes.y + outside);
      vec2 travel = at - from;
      vec2 bend = normalize(vec2(-travel.y, travel.x) + vec2(1e-5));
      vec2 ctrl = mix(from, at, 0.5) + bend * (h11(sd * 3.3) - 0.5) * uUnit * 2.8;
      float iv = 1.0 - ease;
      vec2 pos = iv * iv * from + 2.0 * iv * ease * ctrl + ease * ease * at;
      vec2 delta = p - pos;
      float sz = uUnit * (0.055 + h11(sd * 5.9) * 0.05) * (1.0 - 0.35 * ease);
      vec2 dir = normalize(at - from + vec2(1e-5));
      vec2 nm = vec2(-dir.y, dir.x);
      float along = dot(delta, dir);
      // La estela va detrás y se acorta a medida que la mota frena sobre su punta.
      float ahead = max(along, 0.0) / (sz * 0.92);
      float behind = max(-along, 0.0) / (sz * (2.8 + 5.2 * (1.0 - ease)));
      float across = abs(dot(delta, nm)) / (sz * 0.96);
      float field = sqrt((ahead + behind) * (ahead + behind) + across * across);
      float glow = exp(-field * 2.35) + exp(-field * 0.92) * 0.20;
      float amt = glow * smoothstep(0.0, 0.12, e) * (1.0 - smoothstep(0.94, 1.06, k));
      add(col, al, mix(COLD, WARM, ease * ease), amt * 1.35);
    }
  }

  // 3. Grabados interiores separados del corazón, los mismos que el signo del Futuro. Antes
  //    cada punta era una cuña con alfa que se ensanchaba hacia el centro: sus ocho áreas se
  //    sumaban ahí y dibujaban una segunda estrella dentro de la rosa, que se comía el
  //    protagonismo del corazón y de las puntas. Estas incisiones no tienen área y no llegan
  //    al corazón. Volver a rellenar el interior es una regresión.
  for (int i = 0; i < NODES; i++) {
    if (i == HEART || mod(float(i), 2.0) > 0.5) continue;
    vec4 nd = uNode[i];
    if (uT < nd.z) continue;
    vec2 axis = nd.xy;
    vec2 innerA = uCenter + axis * 0.24;
    vec2 innerB = uCenter + axis * 0.68;
    float creaseD = segSD(p, innerA, innerB);
    float crease = smoothstep(0.90, 0.18, creaseD);
    float reveal = smoothstep(nd.z, nd.z + 0.13, uT);
    add(col, al, mix(COLD, WARM, 0.38), crease * reveal * 0.14);
  }

  // 4. Contorno tenue, sin halo: la luz pertenece a las puntas y al corazón.
  for (int e = 0; e < EDGES; e++) {
    float t0 = uEdgeT[e];
    if (uT < t0) continue;
    vec4 seg = uEdge[e];
    vec2 a = uCenter + seg.xy;
    vec2 b = uCenter + seg.zw;
    float draw = clamp((uT - t0) / 0.14, 0.0, 1.0);
    vec2 head = mix(a, b, draw);
    float d = segSD(p, a, head);
    float ink = smoothstep(uUnit * 0.03, uUnit * 0.007, d);
    float settle = 0.26 + 0.14 * (1.0 - exp(-(uT - t0) * 12.0));
    add(col, al, mix(COLD, WARM, 0.58), ink * settle);
  }

  // 5. Sólo las ocho puntas y el corazón conservan brillo.
  for (int i = 0; i < NODES; i++) {
    vec4 nd = uNode[i];
    if (uT < nd.z) continue;
    bool heartNode = i == HEART;
    bool tipNode = !heartNode && mod(float(i), 2.0) < 0.5;
    vec2 at = uCenter + nd.xy;
    float age = uT - nd.z;
    float d = length(p - at);
    float pop = exp(-age * 11.0);
    float breathe = 0.86 + 0.14 * sin(uTime * 2.1 + nd.w * 6.0);
    if (heartNode) {
      add(col, al, CORE, exp(-d / (uUnit * 0.10)) * (1.15 + 2.7 * pop) * breathe);
      add(col, al, WARM, exp(-d / (uUnit * 0.38)) * (0.30 + 1.2 * pop));
      vec2 r = p - at;
      float star = exp(-abs(r.x) / (uUnit * 0.78)) * exp(-abs(r.y) / (uUnit * 0.034))
        + exp(-abs(r.y) / (uUnit * 0.78)) * exp(-abs(r.x) / (uUnit * 0.034));
      add(col, al, CORE, star * (0.28 + pop * 0.85));
    } else if (tipNode) {
      // Las cuatro cardinales son más largas y más anchas: son las que apuntan a algo.
      float cardinal = 1.0 - step(0.5, mod(float(i), 4.0));
      float coreSize = mix(0.065, 0.082, cardinal);
      add(col, al, CORE, exp(-d / (uUnit * coreSize)) * (0.78 + 2.4 * pop) * breathe);
      add(col, al, WARM, exp(-d / (uUnit * mix(0.19, 0.24, cardinal))) * (0.18 + 0.92 * pop));
      vec2 radial = normalize(nd.xy + vec2(1e-5));
      vec2 tangent = vec2(-radial.y, radial.x);
      vec2 r = p - at;
      float flare = exp(-abs(dot(r, radial)) / (uUnit * mix(0.40, 0.54, cardinal)))
        * exp(-abs(dot(r, tangent)) / (uUnit * mix(0.036, 0.048, cardinal)));
      float crossFlare = exp(-abs(dot(r, tangent)) / (uUnit * mix(0.20, 0.26, cardinal)))
        * exp(-abs(dot(r, radial)) / (uUnit * 0.025));
      add(col, al, CORE, (flare * 0.46 + crossFlare * 0.24) * (0.74 + pop * 0.8 + uBloom * 0.18));
    } else {
      add(col, al, CORE, exp(-d / (uUnit * 0.047)) * (0.32 + 0.72 * pop) * breathe);
      add(col, al, WARM, exp(-d / (uUnit * 0.13)) * (0.065 + 0.26 * pop));
    }
  }

  // 6. El corazón detona una única onda circular que cruza el plano temporal.
  if (uBloom > 0.0) {
    float b = uBloom;
    float r = length(p - uCenter) / uUnit;
    // pow con base negativa es indefinido en GLSL: la campana se escribe como un cuadrado.
    float crownAt = (b - 0.16) * 4.2;
    float crown = exp(-crownAt * crownAt);
    add(col, al, CORE, exp(-r * r * 0.42) * crown * 0.92);
    add(col, al, WARM, exp(-r * 1.7) * crown * 0.65);
    float wave = 0.35 + 8.2 * pow(b, 0.58);
    float waveLife = smoothstep(0.0, 0.045, b) * (1.0 - smoothstep(0.48, 0.88, b));
    float ringD = abs(r - wave);
    add(col, al, WARM, exp(-ringD * 2.8) * waveLife * 0.52);
    add(col, al, CORE, exp(-ringD * 10.0) * waveLife * 0.66);
  }

  // Rodilla fílmica: por encima de 1 la suma aditiva se convierte en pantalla blanca.
  col = col / (1.0 + col * 0.62);
  gl_FragColor = vec4(min(col, vec3(1.0)), clamp(al, 0.0, 1.0));
}
`;

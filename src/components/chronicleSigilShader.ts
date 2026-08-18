import {
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_NODES,
} from "./chronicleSigilGeometry";

/**
 * El signo del Futuro: una escena y un plano, como Burn, el vórtice y la constelación.
 *
 * Todo el brillo vive en el corazón y en las ocho puntas; el contorno y los grabados interiores
 * apenas se leen, igual que en la constelación de la Victoria. El sello aparece completo,
 * mezcla el verdín y el hierro caliente de los dos bandos y pulsa una sola vez.
 *
 * Dos decisiones que no son de gusto:
 *
 * - No hay un solo blanco puro en la paleta y hay una rodilla filmica antes de componer.
 *   Por encima de 1.0 la suma aditiva se convierte en pantalla blanca, y a oscuras eso es
 *   exactamente lo que hace daño. Medido sobre la obertura entera, ningún fotograma tiene
 *   área quemada apreciable.
 * - No hay cobertura de ningún tipo: ni destello, ni abertura, ni fundido. El signo pulsa,
 *   se cierra sobre su aro y se apaga. Reintroducir un flash es una regresión.
 */
export const CHRONICLE_SIGIL_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const CHRONICLE_SIGIL_FRAGMENT_SHADER = `
precision highp float;

#define NODES ${CHRONICLE_SIGIL_NODES}
#define EDGES ${CHRONICLE_SIGIL_EDGES}

uniform vec2 uRes;
uniform float uPixelRatio;
uniform float uTime;
uniform float uT;
uniform vec2 uCenter;
uniform float uUnit;
uniform float uDialR;
uniform float uScale;
uniform float uPresence;
uniform float uCharge;
uniform float uSeat;
uniform float uSweep;
uniform float uSweepPresence;
// xy = desplazamiento respecto al centro, z = reservado en cero, w = semilla propia
uniform vec4 uNode[NODES];
// xy/zw = extremos, también relativos al centro
uniform vec4 uEdge[EDGES];

varying vec2 vUv;

float h11(float n) { return fract(sin(n * 78.233) * 43758.5453123); }

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

const vec3 VERD = vec3(0.29, 0.66, 0.46);
const vec3 EMBER = vec3(0.78, 0.35, 0.19);
const vec3 GOLD = vec3(0.86, 0.68, 0.34);
const vec3 CORE = vec3(0.98, 0.90, 0.72);

void main() {
  vec2 p = vec2(gl_FragCoord.x / uPixelRatio, uRes.y - gl_FragCoord.y / uPixelRatio);
  vec2 q = p - uCenter;
  float r = length(q);
  vec3 col = vec3(0.0);
  float al = 0.0;
  float pres = uPresence;

  // 1. Grabados interiores separados del corazón. Antes cada punta era un triángulo con
  //    alfa; sus ocho áreas se sumaban en el centro y dibujaban una segunda estrella.
  //    Estas incisiones no tienen área, no llegan al corazón y nacen ya completas.
  for (int i = 0; i < NODES; i++) {
    if (i == NODES - 1 || mod(float(i), 2.0) > 0.5) continue;
    vec4 nd = uNode[i];
    vec2 axis = nd.xy * uScale;
    vec2 innerA = uCenter + axis * 0.24;
    vec2 innerB = uCenter + axis * 0.68;
    float creaseD = segSD(p, innerA, innerB);
    float crease = smoothstep(0.90, 0.18, creaseD);
    vec3 tone = mix(mix(VERD, EMBER, step(0.0, nd.x)), GOLD, 0.62);
    add(col, al, tone, crease * pres * (0.026 + uCharge * 0.016));
  }

  // 2. Contorno completo y tenue, sin halo: la luz pertenece a las puntas y al corazón.
  for (int e = 0; e < EDGES; e++) {
    vec4 seg = uEdge[e];
    vec2 a = uCenter + seg.xy * uScale;
    vec2 b = uCenter + seg.zw * uScale;
    float d = segSD(p, a, b);
    float hw = max(0.75, uUnit * 0.0085);
    float ink = smoothstep(hw, 0.22, d);
    float settle = 0.15 + uCharge * 0.08;
    add(col, al, mix(GOLD, CORE, 0.28), ink * settle * pres);
  }

  // 3. Sólo las ocho puntas y el corazón conservan brillo.
  for (int i = 0; i < NODES; i++) {
    vec4 nd = uNode[i];
    bool centerNode = i == NODES - 1;
    bool tipNode = !centerNode && mod(float(i), 2.0) < 0.5;
    vec2 at = uCenter + nd.xy * uScale;
    float d = length(p - at);
    float pop = uCharge;
    float breathe = 0.94 + 0.06 * sin(uTime * 1.7 + nd.w * 6.0);
    float charge = 1.0 + uCharge * 0.25;
    if (centerNode) {
      // Un punto de origen, no otra rosa dentro de la rosa.
      add(col, al, CORE, exp(-d / (uUnit * 0.055)) * (0.30 + 1.05 * pop) * breathe * charge * pres);
      add(col, al, GOLD, exp(-d / (uUnit * 0.18)) * (0.055 + 0.22 * pop + uCharge * 0.04) * pres);
    } else if (tipNode) {
      float cardinal = 1.0 - step(0.5, mod(float(i), 4.0));
      float coreSize = mix(0.060, 0.075, cardinal);
      vec3 faction = nd.x < 0.0 ? VERD : EMBER;
      // El asiento: la punta se clava en su marca y devuelve un golpe breve.
      float seatPop = exp(-max(uSeat - 0.55 - h11(nd.w) * 0.18, 0.0) * 9.0)
        * step(0.55 + h11(nd.w) * 0.18, uSeat);
      add(col, al, CORE, exp(-d / (uUnit * coreSize)) * (0.28 + 0.90 * pop + 0.48 * seatPop) * breathe * charge * pres);
      add(col, al, mix(GOLD, faction, 0.40), exp(-d / (uUnit * mix(0.14, 0.17, cardinal))) * (0.065 + 0.25 * pop + 0.16 * seatPop) * charge * pres);
      vec2 radial = normalize(nd.xy + vec2(1e-5));
      vec2 tangent = vec2(-radial.y, radial.x);
      vec2 rr = p - at;
      float flare = exp(-abs(dot(rr, radial)) / (uUnit * mix(0.34, 0.46, cardinal)))
        * exp(-abs(dot(rr, tangent)) / (uUnit * mix(0.032, 0.042, cardinal)));
      add(col, al, mix(CORE, GOLD, 0.30), flare * (0.08 + pop * 0.12 + uCharge * 0.06 + seatPop * 0.16) * pres);
    } else {
      add(col, al, CORE, exp(-d / (uUnit * 0.038)) * (0.12 + 0.30 * pop) * breathe * pres);
      add(col, al, GOLD, exp(-d / (uUnit * 0.10)) * (0.026 + 0.09 * pop) * pres);
    }
  }

  // 4. La entrega: una luz recorre el aro desde el Norte en sentido horario y deja
  //    encendido el radio exacto del instrumento, donde el retículo ya está esperando.
  if (uSweep > 0.001) {
    float ang = atan(q.y, q.x) + 1.57079633;
    float turn = fract(ang / 6.28318531);
    float ringD = abs(r - uDialR);
    // Un trazo de un píxel CSS, como el aro del retículo. El halo es apenas una guía.
    float body = smoothstep(1.10, 0.18, ringD);
    float halo = exp(-ringD / 1.8);
    float drawn = step(turn, uSweep);
    float lead = exp(-max(uSweep - turn, 0.0) * 7.0);
    // El aro tiene la sutileza del instrumento del Campo. La cabeza apenas lo conduce;
    // no debe convertirse en una línea brillante que tape la rosa.
    float ringPresence = pres * uSweepPresence;
    add(col, al, GOLD, (body * (0.055 + lead * 0.08) + halo * 0.018) * drawn * ringPresence);
    add(col, al, CORE, body * drawn * lead * 0.025 * ringPresence);
  }

  // Rodilla filmica: por encima de 1 la suma aditiva se convierte en pantalla blanca.
  col = col / (1.0 + col * 0.62);
  gl_FragColor = vec4(min(col, vec3(1.0)), clamp(al, 0.0, 1.0));
}
`;

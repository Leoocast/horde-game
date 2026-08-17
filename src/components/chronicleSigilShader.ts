import {
  CHRONICLE_SIGIL_EDGES,
  CHRONICLE_SIGIL_NODES,
} from "./chronicleSigilGeometry";

/**
 * El signo del Futuro: una escena y un plano, como Burn, el vórtice y la constelación.
 *
 * Todo el brillo vive en el corazón y en las ocho puntas; el contorno queda tenue y las
 * facetas apenas se leen, igual que en la constelación de la Victoria. Las motas llegan con
 * el color del bando que acaba de chocar en el encuentro —verdín a la izquierda, hierro
 * caliente a la derecha— y sólo se vuelven oro al quedar fijas.
 *
 * Dos decisiones que no son de gusto:
 *
 * - No hay un solo blanco puro en la paleta y hay una rodilla filmica antes de componer.
 *   Por encima de 1.0 la suma aditiva se convierte en pantalla blanca, y a oscuras eso es
 *   exactamente lo que hace daño. Medido sobre la obertura entera, ningún fotograma tiene
 *   área quemada apreciable.
 * - No hay cobertura de ningún tipo: ni destello, ni abertura, ni fundido. El signo se
 *   dibuja, se cierra sobre su aro y se apaga. Reintroducir un flash es una regresión.
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
uniform float uMotes;
uniform float uCharge;
uniform float uSeat;
uniform float uSweep;
uniform float uSweepPresence;
// xy = desplazamiento respecto al centro, z = instante en que queda fijo, w = semilla propia
uniform vec4 uNode[NODES];
// xy/zw = extremos, también relativos al centro
uniform vec4 uEdge[EDGES];
uniform float uEdgeT[EDGES];

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
  float unit = uUnit * uScale;
  float pres = uPresence;

  // 1. Motas que entran desde los cuatro bordes y se fijan en las puntas.
  if (uMotes > 0.001) {
    for (int i = 0; i < NODES; i++) {
      vec4 nd = uNode[i];
      if (i != NODES - 1 && mod(float(i), 2.0) > 0.5) continue;
      vec2 target = uCenter + nd.xy * uScale;
      vec3 origin = nd.x < 0.0 ? VERD : EMBER;
      if (i == NODES - 1) origin = mix(VERD, EMBER, 0.5);
      float lock = nd.z;
      for (int j = 0; j < 5; j++) {
        float sd = nd.w + float(j) * 13.7;
        float born = max(0.0, lock - 0.40 - h11(sd) * 0.20);
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
        vec2 travel = target - from;
        vec2 bend = normalize(vec2(-travel.y, travel.x) + vec2(1e-5));
        vec2 ctrl = mix(from, target, 0.5) + bend * (h11(sd * 3.3) - 0.5) * uUnit * 2.8;
        float iv = 1.0 - ease;
        vec2 pos = iv * iv * from + 2.0 * iv * ease * ctrl + ease * ease * target;
        vec2 delta = p - pos;
        float sz = uUnit * (0.055 + h11(sd * 5.9) * 0.05) * (1.0 - 0.35 * ease);
        vec2 dir = normalize(target - from + vec2(1e-5));
        vec2 nm = vec2(-dir.y, dir.x);
        float along = dot(delta, dir);
        float ahead = max(along, 0.0) / (sz * 0.92);
        float behind = max(-along, 0.0) / (sz * (2.8 + 5.2 * (1.0 - ease)));
        float across = abs(dot(delta, nm)) / (sz * 0.96);
        float field = sqrt((ahead + behind) * (ahead + behind) + across * across);
        float glow = exp(-field * 2.35) + exp(-field * 0.92) * 0.20;
        float amt = glow * smoothstep(0.0, 0.12, e) * (1.0 - smoothstep(0.94, 1.06, k));
        add(col, al, mix(origin, GOLD, ease * ease), amt * 0.95 * uMotes);
      }
    }
  }

  // 2. Facetas apenas visibles: dan cuerpo sin convertir el signo en una red de líneas.
  for (int i = 0; i < NODES; i++) {
    if (i == NODES - 1 || mod(float(i), 2.0) > 0.5) continue;
    vec4 nd = uNode[i];
    if (uT < nd.z) continue;
    vec2 axis = nd.xy * uScale;
    float reach = length(axis);
    vec2 dir = axis / max(reach, 0.001);
    vec2 side = vec2(-dir.y, dir.x);
    float along = dot(q, dir);
    float across = abs(dot(q, side));
    float along01 = clamp(along / max(reach, 0.001), 0.0, 1.0);
    float halfWidth = unit * mix(0.54, 0.07, pow(along01, 0.72));
    float facet = smoothstep(halfWidth + 1.4, halfWidth - 1.4, across)
      * smoothstep(-1.5, 2.0, along)
      * smoothstep(-1.5, 2.0, reach - along);
    float reveal = smoothstep(nd.z, nd.z + 0.13, uT);
    vec3 tone = mix(mix(VERD, EMBER, step(0.0, nd.x)), GOLD, 0.62);
    add(col, al, tone, facet * reveal * pres * (0.032 + uCharge * 0.040));
  }

  // 3. Contorno tenue, sin halo: la luz pertenece a las puntas y al corazón.
  for (int e = 0; e < EDGES; e++) {
    float t0 = uEdgeT[e];
    if (uT < t0) continue;
    vec4 seg = uEdge[e];
    vec2 a = uCenter + seg.xy * uScale;
    vec2 b = uCenter + seg.zw * uScale;
    float draw = clamp((uT - t0) / 0.14, 0.0, 1.0);
    float d = segSD(p, a, mix(a, b, draw));
    float hw = uUnit * 0.030;
    float ink = smoothstep(hw, hw * 0.24, d);
    float settle = 0.22 + 0.12 * (1.0 - exp(-(uT - t0) * 12.0)) + uCharge * 0.22;
    add(col, al, mix(GOLD, CORE, 0.28), ink * settle * pres);
  }

  // 4. Sólo las ocho puntas y el corazón conservan brillo.
  for (int i = 0; i < NODES; i++) {
    vec4 nd = uNode[i];
    if (uT < nd.z) continue;
    bool centerNode = i == NODES - 1;
    bool tipNode = !centerNode && mod(float(i), 2.0) < 0.5;
    float age = uT - nd.z;
    vec2 at = uCenter + nd.xy * uScale;
    float d = length(p - at);
    float pop = exp(-age * 11.0);
    float breathe = 0.86 + 0.14 * sin(uTime * 2.1 + nd.w * 6.0);
    float charge = 1.0 + uCharge * 0.55;
    if (centerNode) {
      add(col, al, CORE, exp(-d / (uUnit * 0.10)) * (0.62 + 1.7 * pop) * breathe * charge * pres);
      add(col, al, GOLD, exp(-d / (uUnit * 0.34)) * (0.16 + 0.7 * pop) * charge * pres);
      vec2 rr = p - at;
      float star = exp(-abs(rr.x) / (uUnit * 0.40)) * exp(-abs(rr.y) / (uUnit * 0.030))
        + exp(-abs(rr.y) / (uUnit * 0.40)) * exp(-abs(rr.x) / (uUnit * 0.030));
      add(col, al, CORE, star * (0.16 + pop * 0.46 + uCharge * 0.22) * pres);
    } else if (tipNode) {
      float cardinal = 1.0 - step(0.5, mod(float(i), 4.0));
      float coreSize = mix(0.060, 0.075, cardinal);
      vec3 faction = nd.x < 0.0 ? VERD : EMBER;
      // El asiento: la punta se clava en su marca y devuelve un golpe breve.
      float seatPop = exp(-max(uSeat - 0.55 - h11(nd.w) * 0.18, 0.0) * 9.0)
        * step(0.55 + h11(nd.w) * 0.18, uSeat);
      add(col, al, CORE, exp(-d / (uUnit * coreSize)) * (0.46 + 1.5 * pop + 1.1 * seatPop) * breathe * charge * pres);
      add(col, al, mix(GOLD, faction, 0.40), exp(-d / (uUnit * mix(0.17, 0.21, cardinal))) * (0.13 + 0.60 * pop + 0.5 * seatPop) * charge * pres);
      vec2 radial = normalize(nd.xy + vec2(1e-5));
      vec2 tangent = vec2(-radial.y, radial.x);
      vec2 rr = p - at;
      float flare = exp(-abs(dot(rr, radial)) / (uUnit * mix(0.34, 0.46, cardinal)))
        * exp(-abs(dot(rr, tangent)) / (uUnit * mix(0.032, 0.042, cardinal)));
      float cross = exp(-abs(dot(rr, tangent)) / (uUnit * mix(0.16, 0.21, cardinal)))
        * exp(-abs(dot(rr, radial)) / (uUnit * 0.022));
      add(col, al, mix(CORE, GOLD, 0.30), (flare * 0.34 + cross * 0.16) * (0.52 + pop * 0.55 + uCharge * 0.30 + seatPop * 0.7) * pres);
    } else {
      add(col, al, CORE, exp(-d / (uUnit * 0.044)) * (0.22 + 0.52 * pop) * breathe * pres);
      add(col, al, GOLD, exp(-d / (uUnit * 0.12)) * (0.045 + 0.19 * pop) * pres);
    }
  }

  // 5. La entrega: una luz recorre el aro desde el Norte en sentido horario y deja
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

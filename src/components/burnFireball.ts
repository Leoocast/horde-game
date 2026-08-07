import type { BurnMaterialVariant } from "../store/combatAnimation";
import { BURN_DURATION_MS, BURN_FLIGHT_START_MS, BURN_IMPACT_AT_MS } from "./burnPresentation";

/** Rutas simultáneas que admite una pasada del shader. Las descargas mayores se reparten en
 * varias pasadas dentro del mismo canvas y del mismo contexto WebGL. */
export const BURN_MAX_ROUTES = 6;

export type BurnMaterialColors = {
  /** Corazón blanco del cuerpo. */
  core: [number, number, number];
  hot: [number, number, number];
  mid: [number, number, number];
  deep: [number, number, number];
  /** Borde frío y humo del impacto. */
  smoke: [number, number, number];
  /** 0 = llama luminosa que suma luz; 1 = materia densa que tapa el fondo. */
  ink: number;
};

/** Cada bando aporta sólo su rampa de color y su densidad: la forma, la estela y el impacto
 * son el mismo efecto para todos, así que no hay una variante copiada por deck. */
const BURN_MATERIALS: Record<BurnMaterialVariant, BurnMaterialColors> = {
  fire: {
    core: [1.0, 0.97, 0.86],
    hot: [1.0, 0.76, 0.28],
    mid: [0.97, 0.33, 0.05],
    deep: [0.56, 0.08, 0.02],
    smoke: [0.1, 0.05, 0.04],
    ink: 0.16,
  },
  // Nerezh: brea casi opaca con iridiscencia lila; es la misma llama con densidad alta.
  oil: {
    core: [0.94, 0.91, 0.96],
    hot: [0.64, 0.55, 0.71],
    mid: [0.25, 0.19, 0.3],
    deep: [0.07, 0.04, 0.09],
    smoke: [0.02, 0.02, 0.03],
    ink: 0.92,
  },
  emerald: {
    core: [0.95, 1.0, 0.85],
    hot: [0.71, 1.0, 0.42],
    mid: [0.18, 0.83, 0.37],
    deep: [0.04, 0.37, 0.16],
    smoke: [0.02, 0.09, 0.05],
    ink: 0.14,
  },
  golden: {
    core: [1.0, 0.99, 0.94],
    hot: [1.0, 0.94, 0.48],
    mid: [1.0, 0.77, 0.11],
    deep: [0.73, 0.38, 0.0],
    smoke: [0.14, 0.07, 0.03],
    ink: 0.1,
  },
};

export function burnMaterialColors(variant: BurnMaterialVariant | undefined): BurnMaterialColors {
  return BURN_MATERIALS[variant ?? "fire"] ?? BURN_MATERIALS.fire;
}

export type BurnImpactRoute = {
  /** Ruta de la que se toma el punto de impacto. */
  routeIndex: number;
  delayMs: number;
};

export type BurnRenderBatch = {
  /** Índices globales de las rutas que dibuja esta pasada. */
  routeIndexes: number[];
  /** Impactos con routeIndex convertido al índice local de la pasada. */
  impacts: BurnImpactRoute[];
};

/** Una descarga repetida contra el mismo objetivo aterriza como un único impacto agregado, igual
 * que en el reloj del store. Cuando el efecto declara objetivos explícitos, cada ruta conserva su
 * propio impacto y su propio número de daño. */
export function burnImpactRoutes(
  routeCount: number,
  hasExplicitTargets: boolean,
  projectileGapMs: number,
): BurnImpactRoute[] {
  const routes = Math.max(0, Math.floor(routeCount));
  if (routes === 0) return [];
  const gap = Math.max(0, projectileGapMs);
  if (hasExplicitTargets) {
    return Array.from({ length: routes }, (_, routeIndex) => ({
      routeIndex,
      delayMs: routeIndex * gap,
    }));
  }
  return [{ routeIndex: routes - 1, delayMs: (routes - 1) * gap }];
}

/** Divide una descarga grande sin descartar rutas. Cada batch cabe en los arrays fijos del GLSL,
 * pero todas las pasadas comparten renderer, canvas y reloj. */
export function burnRenderBatches(
  routeCount: number,
  impacts: readonly BurnImpactRoute[],
  routesPerBatch: number = BURN_MAX_ROUTES,
): BurnRenderBatch[] {
  const count = Math.max(0, Math.floor(routeCount));
  const batchSize = Math.max(1, Math.floor(routesPerBatch));
  const batches: BurnRenderBatch[] = [];
  for (let start = 0; start < count; start += batchSize) {
    const end = Math.min(count, start + batchSize);
    batches.push({
      routeIndexes: Array.from({ length: end - start }, (_, index) => start + index),
      impacts: impacts
        .filter((impact) => impact.routeIndex >= start && impact.routeIndex < end)
        .map((impact) => ({
          routeIndex: impact.routeIndex - start,
          delayMs: impact.delayMs,
        })),
    });
  }
  return batches;
}

const CHARGE_END = BURN_FLIGHT_START_MS / BURN_DURATION_MS;
const IMPACT_AT = BURN_IMPACT_AT_MS / BURN_DURATION_MS;

export const BURN_FIREBALL_VERTEX_SHADER = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/* El cuerpo no es una esfera: la silueta sale de ruido fractal advectado hacia atrás y se estira
   según la trayectoria. La estela no viaja pegada al proyectil: se emite en instantes fijos y cada
   bocanada queda anclada donde nació, se abre, sube, se enfría y se apaga ahí. */
export const BURN_FIREBALL_FRAGMENT_SHADER = `
precision highp float;

#define MAX_ROUTES ${BURN_MAX_ROUTES}

uniform vec2 uRes;             // tamaño del lienzo en px CSS
uniform float uPixelRatio;
uniform float uTime;           // reloj continuo en segundos, para el parpadeo de la llama
uniform float uT;              // 0..1 sobre la duración maestra del Burn
uniform float uCount;
uniform vec2 uStart[MAX_ROUTES];
uniform vec2 uEnd[MAX_ROUTES];
uniform float uDelay[MAX_ROUTES];
uniform float uImpactCount;
uniform vec2 uImpactPos[MAX_ROUTES];
uniform float uImpactDelay[MAX_ROUTES];
uniform float uScale;
uniform float uCurve;
uniform vec3 uCore;
uniform vec3 uHot;
uniform vec3 uMid;
uniform vec3 uDeep;
uniform vec3 uSmoke;
uniform float uInk;

const float CHARGE_END = ${CHARGE_END.toFixed(6)};
const float IMPACT_AT = ${IMPACT_AT.toFixed(6)};
// Cadencia y vida de la estela depositada, en unidades del vuelo (1.0 = trayecto completo).
const float PUFF_STEP = 0.032;
const float PUFF_LIFE = 0.62;
const float SPARK_STEP = 0.042;
const float SPARK_LIFE = 0.64;

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), f.x),
        mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}

float fbm(vec3 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * vnoise(p);
    p.xy = rot(0.73) * p.xy * 2.03;
    p.z *= 1.91;
    amp *= 0.5;
  }
  return sum;
}

float fbm3(vec3 p) {
  float sum = 0.0;
  float amp = 0.55;
  for (int i = 0; i < 3; i++) {
    sum += amp * vnoise(p);
    p *= 2.11;
    amp *= 0.5;
  }
  return sum;
}

// Rampa de temperatura: humo -> rojo profundo -> cuerpo -> corazón blanco.
vec3 heat(float h) {
  vec3 c = mix(uSmoke, uDeep, smoothstep(0.0, 0.14, h));
  c = mix(c, uMid, smoothstep(0.16, 0.48, h));
  c = mix(c, uHot, smoothstep(0.44, 0.76, h));
  c = mix(c, uCore, smoothstep(0.76, 0.97, h));
  return c;
}

// Composición premultiplicada. cover es cuánta silueta ocupa el fragmento y h su temperatura;
// van separados para que el blanco quede sólo en el corazón y el cuerpo recorra la rampa.
void addFire(inout vec3 col, inout float alpha, float cover, float h) {
  if (cover <= 0.002) return;
  h = clamp(h, 0.0, 1.0);
  vec3 c = heat(h);
  float lum = pow(clamp(cover, 0.0, 1.0), 0.85);
  float cvr = clamp(lum * mix(0.22, 0.98, uInk), 0.0, 1.0);
  col = col * (1.0 - cvr) + c * cvr;
  alpha = alpha * (1.0 - cvr) + cvr;
  // la llama es sobre todo emisiva: el cuerpo brilla, no sólo el núcleo
  col += c * lum * mix(1.25, 0.22, uInk) * (0.35 + 0.9 * h);
}

float easeInFlight(float x) { return x * x * (3.0 - 2.0 * x) * 0.35 + x * 0.65; }

vec2 pathPoint(vec2 s, vec2 e, float k) {
  vec2 d = e - s;
  float dlen = length(d);
  vec2 perp = dlen > 0.001 ? vec2(-d.y, d.x) / dlen : vec2(0.0);
  return mix(s, e, k) + perp * sin(3.14159 * k) * 26.0 * uScale * uCurve;
}

// Cuerpo del proyectil: gota estirada por la trayectoria con el borde erosionado.
float projectileDensity(vec2 p, vec2 P, vec2 dir, float R, float seed, out float heatv) {
  vec2 rel = p - P;
  vec2 n = vec2(dot(rel, dir), dot(rel, vec2(-dir.y, dir.x))) / R;
  float back = max(-n.x, 0.0);
  float cool = 0.46 + 0.58 * exp(-1.7 * back);
  // cabeza compacta: el largo lo pone la estela depositada, no un rabo pegado al cuerpo
  float stretched = n.x > 0.0 ? n.x / 0.85 : n.x / 2.2;
  float r = length(vec2(stretched, n.y * (1.0 + 0.26 * back)));
  float turb = fbm(vec3(n.x * 1.7 + uTime * 7.0, n.y * 2.2, uTime * 2.6 + seed * 11.0)) - 0.5;
  float shred = 0.30 + 1.30 * smoothstep(0.0, 1.0, back);
  float raw = 1.0 - r - turb * shred * 1.6;
  // el calor cae desde el centro geométrico: blanco sólo en el corazón
  heatv = pow(clamp(1.0 - r * 0.9, 0.0, 1.0), 2.0) * cool * 1.15;
  return smoothstep(0.0, 0.40, raw);
}

// Carga en la mano antes del lanzamiento.
float chargeDensity(vec2 p, vec2 S, float R, float k, float seed, out float heatv) {
  vec2 n = (p - S) / (R * (0.25 + 0.85 * k));
  float rr = length(n);
  float ang = atan(n.y, n.x);
  float wob = fbm3(vec3(cos(ang) * 1.8, sin(ang) * 1.8, uTime * 4.2 + seed)) - 0.5;
  float edge = max(1.0 + wob * 0.85, 0.05);
  float inside = 1.0 - rr / edge;
  heatv = clamp(inside * 1.2, 0.0, 1.0) * (0.5 + 0.5 * k);
  return smoothstep(0.0, 0.55, inside) * smoothstep(0.0, 0.25, k);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / uPixelRatio, uRes.y - gl_FragCoord.y / uPixelRatio);
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float R = 24.0 * uScale;

  for (int i = 0; i < MAX_ROUTES; i++) {
    if (float(i) >= uCount) break;
    float tp = uT - uDelay[i];
    if (tp <= 0.0) continue;

    vec2 S = uStart[i];
    vec2 E = uEnd[i];
    vec2 travel = E - S;
    float len = max(length(travel), 0.001);
    vec2 dir = travel / len;
    vec2 perp = vec2(-dir.y, dir.x);
    float seed = float(i) * 31.7;

    // Descarte grueso: fuera del corredor de la ruta no hay nada que dibujar.
    vec2 rel = p - S;
    float along = dot(rel, dir);
    float side = abs(dot(rel, perp));
    if (along < -R * 4.0 || along > len + R * 4.0 || side > R * 5.5) continue;

    if (tp < CHARGE_END + 0.02) {
      float ck = clamp(tp / CHARGE_END, 0.0, 1.0);
      float ch;
      float d = chargeDensity(p, S, R * 1.1, ck, seed, ch);
      addFire(col, alpha, d * (1.0 - smoothstep(0.85, 1.0, ck) * 0.35), ch);
    }

    if (tp < CHARGE_END) continue;

    float fclock = (tp - CHARGE_END) / (IMPACT_AT - CHARGE_END);

    // Estela depositada: ventana deslizante sobre las últimas emisiones, para que la emisión no
    // se agote a media trayectoria y el proyectil nunca se despegue de su cola.
    float lastPuff = floor(min(fclock, 1.0) / PUFF_STEP);
    for (int j = 0; j < 20; j++) {
      float idx = lastPuff - float(j);
      if (idx < 0.0) continue;
      float te = idx * PUFF_STEP;
      float u = (fclock - te) / PUFF_LIFE;
      if (u >= 1.0) continue;
      vec2 Q = pathPoint(S, E, easeInFlight(te));
      // el azar va atado al índice de emisión: cada bocanada conserva su forma al envejecer
      float rnd = hash13(vec3(idx, seed, 1.0));
      float rnd2 = hash13(vec3(idx, seed, 5.0));
      Q += perp * (rnd - 0.5) * R * 1.1 * u + vec2(0.0, -R * 0.5 * u * u);
      float radius = R * (0.55 + 0.8 * u) * (0.75 + rnd2 * 0.4);
      vec2 delta = p - Q;
      if (dot(delta, delta) > radius * radius * 3.6) continue;
      vec2 m = delta / radius;
      float nz = fbm3(vec3(m * 1.5 + vec2(uTime * 1.4, 0.0), uTime * 2.0 + idx)) - 0.5;
      float inside = 1.0 - (length(vec2(m.x * 0.88, m.y)) + nz * 0.85);
      float cov = smoothstep(0.0, 0.5, inside) * (1.0 - smoothstep(0.3, 1.0, u));
      // algo menos caliente que la cabeza, para que el proyectil siga mandando
      addFire(col, alpha, cov, pow(clamp(inside, 0.0, 1.0), 1.4) * (0.84 - 0.55 * u));
    }

    // Chispas sueltas, ancladas también al punto donde saltaron.
    float lastSpark = floor(min(fclock, 1.0) / SPARK_STEP);
    for (int j = 0; j < 14; j++) {
      float idx = lastSpark - float(j);
      if (idx < 0.0) continue;
      float te = idx * SPARK_STEP;
      float u = (fclock - te) / SPARK_LIFE;
      if (u >= 1.0) continue;
      float rnd = hash13(vec3(idx, seed + 3.0, 7.0));
      float rnd2 = hash13(vec3(idx, seed + 9.0, 2.0));
      vec2 Q = pathPoint(S, E, easeInFlight(te))
             + perp * (rnd - 0.5) * R * (0.5 + 3.2 * u)
             - dir * rnd2 * R * 0.8
             - vec2(0.0, R * 0.7 * u * u);
      float sz = (1.5 + rnd2 * 3.2) * uScale * (1.0 - u * 0.75);
      vec2 delta = p - Q;
      if (dot(delta, delta) > sz * sz * 64.0) continue;
      float g = sz / (length(delta) + max(sz, 0.001) * 0.9);
      float e = pow(clamp(g, 0.0, 1.0), 3.0) * (1.0 - smoothstep(0.55, 1.0, u));
      addFire(col, alpha, e, (0.72 + 0.28 * e) * (1.0 - 0.35 * u));
    }

    // Cuerpo del proyectil: sólo mientras vuela.
    if (fclock <= 1.0) {
      vec2 P = pathPoint(S, E, easeInFlight(fclock));
      vec2 delta = p - P;
      if (dot(delta, delta) < R * R * 16.0) {
        float heatv;
        float d = projectileDensity(p, P, dir, R, seed, heatv);
        d *= 1.0 - smoothstep(0.97, 1.0, fclock) * 0.35;   // aplastado por el impacto inminente
        addFire(col, alpha, d, heatv);
      }
    }
  }

  // Impactos: el estallido no es un disco. El contorno se deforma con dos frecuencias angulares,
  // el interior se rompe con ruido, salen lenguas despedidas y la masa sube mientras se apaga.
  for (int k = 0; k < MAX_ROUTES; k++) {
    if (float(k) >= uImpactCount) break;
    float tk = uT - uImpactDelay[k];
    if (tk < IMPACT_AT) continue;
    float ti = clamp((tk - IMPACT_AT) / (1.0 - IMPACT_AT), 0.0, 1.0);
    vec2 C = uImpactPos[k];
    vec2 toImpact = p - C;
    if (dot(toImpact, toImpact) > R * R * 100.0) continue;

    vec2 qn = toImpact / R;
    qn.y += 2.3 * ti * ti;                       // flotabilidad
    float ang = atan(qn.y, qn.x);
    float warp = fbm(vec3(qn * 1.25, uTime * 2.2 + 4.0)) - 0.5;
    float rr = length(qn) * (1.0 + warp * 0.5);

    // humo denso primero: queda por debajo del fuego
    float srad = 1.2 + 4.6 * pow(ti, 0.45);
    float swob = fbm3(vec3(cos(ang) * 2.2, sin(ang) * 2.2, 3.0 + uTime * 1.2)) - 0.5;
    float sdens = smoothstep(srad * (1.0 + swob * 0.6), srad * 0.2, rr)
                * smoothstep(0.05, 0.35, ti) * (1.0 - smoothstep(0.45, 1.0, ti));
    float scover = sdens * 0.55;
    col = col * (1.0 - scover) + uSmoke * scover;
    alpha = alpha * (1.0 - scover) + scover;

    float rad = 0.8 + 4.2 * pow(ti, 0.5);
    float a1 = fbm3(vec3(cos(ang) * 2.0, sin(ang) * 2.0, uTime * 2.4)) - 0.5;
    float a2 = fbm3(vec3(cos(ang) * 5.5, sin(ang) * 5.5, 7.0 + uTime * 3.8)) - 0.5;
    float edge = max(rad * (1.0 + a1 * 0.9 + a2 * 0.45), 0.05);
    float inside = 1.0 - rr / edge;
    float body = smoothstep(0.0, 0.5, inside);
    float breakup = fbm(vec3(qn * 1.7, uTime * 3.2 + 9.0));
    body *= smoothstep(0.28, 0.62, breakup + (1.0 - ti) * 0.4);
    body *= 1.0 - smoothstep(0.15, 0.85, ti);
    addFire(col, alpha, clamp(body, 0.0, 1.0), clamp(inside * 1.1, 0.0, 1.0) * (1.12 - 0.72 * ti));

    // lenguas despedidas: rompen la silueta y dan dirección al estallido
    for (int j = 0; j < 7; j++) {
      float fj = float(j);
      float a0 = hash13(vec3(fj, 11.0, 3.0)) * 6.2831;
      float sp = 0.55 + hash13(vec3(fj, 5.0, 2.0)) * 0.9;
      vec2 c = vec2(cos(a0), sin(a0) - 0.4) * 3.4 * sp * pow(ti, 0.62);
      vec2 m = qn - c;
      float lr = length(m) / max(1.15 * (1.0 - 0.4 * ti) * (0.65 + sp * 0.5), 0.05);
      float ln = fbm3(vec3(m * 2.4, uTime * 3.0 + fj)) - 0.5;
      float li = 1.0 - lr - ln * 0.95;
      float lcov = smoothstep(0.0, 0.45, li) * (1.0 - smoothstep(0.3, 1.0, ti));
      addFire(col, alpha, lcov, clamp(li * 1.2, 0.0, 1.0) * (1.0 - 0.5 * ti));
    }

    float ring = 0.5 + 5.4 * pow(ti, 0.42);
    float rw = 0.42 * (1.0 + a1 * 0.85);
    float rd = smoothstep(rw, 0.0, abs(rr - ring * (1.0 + a1 * 0.22)));
    addFire(col, alpha, rd * (1.0 - smoothstep(0.05, 0.5, ti)) * 0.7, 0.72 - 0.3 * ti);

    // núcleo blanco del golpe: breve y estrecho, no un halo
    col += heat(1.0) * exp(-ti * 30.0) * exp(-rr * rr * 1.7) * 1.9;

    for (int j = 0; j < 20; j++) {
      float fj = float(j);
      float a0 = hash13(vec3(fj, 2.0, 4.0)) * 6.2831;
      float sp = 0.5 + hash13(vec3(fj, 7.0, 1.0));
      float sz = (1.4 + hash13(vec3(fj, 3.0, 8.0)) * 3.6) * uScale;
      vec2 pos = C + vec2(cos(a0), sin(a0)) * (R * 5.2 * sp * pow(ti, 0.55))
               + vec2(0.0, -34.0 * uScale * ti * ti * (0.4 + sp));
      vec2 delta = p - pos;
      if (dot(delta, delta) > sz * sz * 64.0) continue;
      float g = sz / (length(delta) + max(sz, 0.001) * 0.85);
      float e = pow(clamp(g, 0.0, 1.0), 3.0) * (1.0 - smoothstep(0.35, 1.0, ti));
      addFire(col, alpha, e, 0.7 + 0.3 * e - 0.25 * ti);
    }
  }

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

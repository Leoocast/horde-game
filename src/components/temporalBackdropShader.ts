/**
 * Fondo espacio/temporal compartido entre pantallas.
 *
 * Nubes que se revuelven —el campo de deformación se advecta con el tiempo, no se
 * desliza en bloque—, tres capas de estrellas con paralaje propio y motas que vagan
 * en curvas y respiran. La maqueta de decisión es `dev/mockups/vfx/temporal-backgrounds.html`.
 *
 * Menú y tablero comparten exactamente la misma presentación: el tablero no atenúa el
 * fondo, porque el oscurecido que necesitan las cartas ya lo aportan los degradados de
 * la propia pantalla. `uClimax` reacciona al mismo umbral que lleva la música a clímax.
 */

export const TEMPORAL_BACKDROP_VERTEX = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

export const TEMPORAL_BACKDROP_FRAGMENT = `
precision highp float;

uniform vec2 uRes;
uniform float uTime;
uniform float uClimax;
uniform float uDestiny;

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

vec2 hash22(vec2 p) {
  float n = hash21(p);
  return vec2(n, hash21(p + n + 19.19));
}

float vnoise(vec2 p) {
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
  float amplitude = 0.55;
  mat2 turn = mat2(0.82, -0.57, 0.57, 0.82);
  for (int i = 0; i < 4; i++) {
    value += amplitude * vnoise(p);
    p = turn * p * 2.05 + vec2(17.13, 9.71);
    amplitude *= 0.49;
  }
  return value;
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

// Centelleo lento a propósito: a alta frecuencia el cielo parpadea y delata el shader.
float starLayer(vec2 p, float scale, float gate, float speed) {
  vec2 grid = p * scale;
  vec2 id = floor(grid);
  vec2 cell = fract(grid) - 0.5;
  float seed = hash21(id);
  if (seed < gate) return 0.0;
  vec2 shift = (hash22(id + 7.31) - 0.5) * 0.7;
  float d = length(cell - shift);
  // Una estrella más pequeña que un píxel no se puede muestrear: aparece y desaparece
  // según dónde caiga el centro del píxel mientras la capa deriva, y eso se ve como
  // parpadeo. El radio se fija en píxeles y se traduce a unidades de celda, así que
  // la estrella siempre cubre un par de píxeles con borde suave.
  float cellPx = max(1.0, uRes.y / scale);
  float radius = max(0.045, 1.35 / cellPx);
  float core = exp(-pow(d / radius, 2.0) * 1.6);
  float halo = exp(-pow(d / (radius * 3.2), 2.0)) * step(0.994, seed) * 0.22;
  return (core + halo) * (0.94 + 0.06 * sin(uTime * speed + seed * 6.2831));
}

float firefly(vec2 rel, vec2 id, float speed, float off) {
  float seed = hash21(id + off);
  if (seed < 0.93) return 0.0;
  float k = 0.5 + seed;
  vec2 wander = 0.30 * vec2(
    sin(uTime * speed * k + seed * 31.0),
    cos(uTime * speed * (k * 0.82) + seed * 17.0)
  );
  vec2 offset = (hash22(id + 5.13) - 0.5) * 0.40 + wander;
  float d = length(rel - offset);
  float core = exp(-d * d * 320.0);
  float halo = exp(-d * d * 30.0) * 0.22;
  float breath = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(uTime * (0.28 + seed * 0.4) + seed * 44.0), 2.2);
  return (core + halo) * breath;
}

// El resplandor de una mota es más ancho que su celda, y la deriva puede sacarla de
// ella. Mirando sólo la celda propia, todo lo que desborda al vecino no se dibuja: el
// halo se corta en recto y se ven cuadrados. Hay que recorrer el vecindario 3x3.
float fireflies(vec2 p, float scale, float speed, float off) {
  vec2 g = p * scale;
  vec2 id = floor(g);
  vec2 cell = fract(g) - 0.5;
  float sum = 0.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 nb = vec2(float(i), float(j));
      sum += firefly(cell - nb, id + nb, speed, off);
    }
  }
  return sum;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);
  p = rot(uTime * 0.0055) * p;

  // El campo de deformación se advecta: las nubes se revuelven, no se deslizan.
  vec2 surgeFlow = vec2(uTime * 0.020, -uTime * 0.014) * (1.0 + uClimax * 0.8);
  // Reescribir altera el mismo campo que acelera al llegar Surge, no mueve el canvas.
  // Su flujo es más enérgico y espejado en X para que el cosmos cruce hacia la izquierda.
  vec2 destinyFlow = vec2(-uTime * 0.042, 0.0);
  vec2 flow = mix(surgeFlow, destinyFlow, uDestiny);
  vec2 warp = vec2(
    fbm(p * 1.32 + vec2(0.0, uTime * 0.022) + 3.7),
    fbm(p * 1.32 + vec2(uTime * 0.018, 0.0) + 11.9)
  ) - 0.5;
  vec2 q = p + warp * 0.36 + flow * 0.4;
  q += 0.12 * (vec2(fbm(q * 2.3 - flow), fbm(q * 2.3 + flow + 6.1)) - 0.5);

  float broad = fbm(q * 1.62);
  float folds = fbm(q * 3.70 + 23.4);
  float edgeBias = smoothstep(0.10, 0.74, length(p - vec2(-0.08, 0.02)));
  float breathe = 0.92 + 0.08 * sin(uTime * 0.10);
  float nebula = smoothstep(0.49, 0.87, broad + folds * 0.23) * mix(0.24, 1.0, edgeBias) * breathe;
  float vein = smoothstep(0.60, 0.90, folds) * nebula;
  float dust = smoothstep(0.70, 0.95, fbm(q * 5.8 + vec2(31.2, 15.7))) * edgeBias;

  vec3 teal = mix(vec3(0.026, 0.20, 0.24), vec3(0.16, 0.09, 0.09), uClimax);
  teal = mix(teal, vec3(0.34, 0.235, 0.075), uDestiny);
  vec3 gold = mix(vec3(0.72, 0.50, 0.18), vec3(0.78, 0.31, 0.14), uClimax);
  gold = mix(gold, vec3(0.92, 0.65, 0.20), uDestiny);
  vec3 color = mix(vec3(0.0024, 0.0062, 0.017), vec3(0.012, 0.009, 0.0025), uDestiny);
  color += mix(vec3(0.006, 0.024, 0.058), vec3(0.070, 0.040, 0.006), uDestiny) * (0.22 + broad * 0.62);
  color += teal * nebula * 0.92;
  color += mix(vec3(0.036, 0.34, 0.36), vec3(0.72, 0.38, 0.075), uDestiny) * vein * 0.38;
  color += gold * dust * mix(0.26, 0.46, uDestiny);

  vec2 near = rot(uTime * 0.012) * p + vec2(uTime * 0.0040, -uTime * 0.0015);
  vec2 mid = rot(uTime * 0.007) * p * 1.02 + 5.3;
  vec2 far = rot(uTime * 0.003) * p + 13.7;
  // Las puertas son por celda, así que la cuenta real depende de la escala. Y el tono
  // se lleva al oro del HUD (#c7aa69 / #ead59b): en azul las estrellas parecían de otro
  // juego que el marco dorado de las cartas.
  color += mix(vec3(0.92, 0.86, 0.68), vec3(1.0, 0.82, 0.36), uDestiny) * starLayer(near, 74.0, 0.9979, 0.055) * 0.40;
  color += mix(vec3(0.78, 0.70, 0.46), vec3(0.95, 0.62, 0.20), uDestiny) * starLayer(mid, 142.0, 0.99945, 0.038) * 0.28;
  color += vec3(1.00, 0.72, 0.34) * starLayer(far, 97.0, 0.99935, 0.026) * 0.28;

  float glow = fireflies(p + warp * 0.05, 9.0, 0.10, 0.0)
             + fireflies(p * 1.7 - warp * 0.04 + 8.2, 15.0, 0.07, 21.3) * 0.7;
  color += mix(vec3(1.0, 0.80, 0.36), vec3(0.55, 0.95, 0.78), 0.35) * glow * 0.95;

  // El tablero ya no atenúa nada: el fondo se ve igual que en el menú. El oscurecido
  // que hacía falta para las cartas lo aporta la propia pantalla con sus degradados.
  float vig = 1.0 - smoothstep(0.40, 1.0, length(p * vec2(0.76, 1.0)));
  color *= mix(0.62, 1.0, vig);

  gl_FragColor = vec4(pow(max(color, 0.0), vec3(0.92)), 1.0);
}
`;

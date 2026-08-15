/**
 * Agujero negro de las Semillas del Destino.
 *
 * Un solo plano a pantalla completa dibuja horizonte, disco de acreción, anillo de fotones,
 * la materia que cae en espiral y la descarga de brasas que libera el nuevo futuro. Todo se
 * resuelve en el fragment shader, así que la transición no monta un sistema de partículas ni un
 * segundo contexto WebGL: dibuja por `renderSharedVfxFrame` como el resto de los efectos.
 *
 * El reloj llega en dos tiempos separados, `uCollapse` y `uBurst`, para que el componente conserve
 * el contrato de la transición: cubrir la escena, reescribir y sólo entonces liberar.
 */

/** Radio del horizonte a escala plena, en fracción del lado menor del viewport. */
export const DESTINY_HORIZON_RATIO = 0.115;

/** Materia en caída y brasas de la liberación. Ambos son bucles del shader, no mallas. */
export const DESTINY_INFALL_COUNT = 28;
export const DESTINY_EMBER_COUNT = 40;

export const DESTINY_VORTEX_VERTEX_SHADER = `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const DESTINY_VORTEX_FRAGMENT_SHADER = `
precision highp float;

#define INFALL ${DESTINY_INFALL_COUNT}
#define EMBERS ${DESTINY_EMBER_COUNT}

uniform vec2 uRes;          // viewport en px CSS
uniform float uPixelRatio;
uniform float uTime;        // reloj continuo en segundos, sólo para el titileo
uniform float uSpin;        // giro acumulado por delta time; acelera al colapsar
uniform float uCollapse;    // 0..1 mientras el vórtice se traga la escena
uniform float uBurst;       // 0..1 mientras libera el nuevo futuro
uniform vec2 uCenter;       // centro del agujero en px CSS
uniform float uRadius;      // radio del horizonte a escala plena, en px CSS
uniform vec3 uDisk;         // ámbar del disco
uniform vec3 uRim;          // teal frío del borde y de las brasas apagándose
uniform vec3 uCore;         // blanco cálido del anillo de fotones

// El disco se ve casi de canto: su plano se aplasta en vertical y el borde exterior se pierde.
const float DISK_SQUASH = 0.30;
const float DISK_IN = 1.34;
const float DISK_OUT = 3.80;
// Imagen lensada del lado opuesto: un arco circular que pasa por encima y por debajo del horizonte.
const float HALO_R = 1.66;
// Más allá de este radio ya no vive nada, ni siquiera la onda de choque.
const float FIELD_LIMIT = 9.2;

float hash11(float n) {
  return fract(sin(n * 78.233) * 43758.5453123);
}

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

// El disco recorre teal frío -> ámbar -> blanco según se acerca al horizonte.
vec3 diskTint(float heat) {
  vec3 c = mix(uRim, uDisk, smoothstep(0.0, 0.58, heat));
  return mix(c, uCore, smoothstep(0.74, 1.0, heat));
}

// Composición premultiplicada: la luz suma color y va cerrando el alfa.
void addLight(inout vec3 col, inout float alpha, vec3 tint, float amount) {
  if (amount <= 0.0015) return;
  col += tint * amount;
  alpha = alpha + (1.0 - alpha) * clamp(amount, 0.0, 1.0);
}

// El horizonte y la sombra no suman luz: tapan lo que ya se dibujó.
void occlude(inout vec3 col, inout float alpha, float cover) {
  cover = clamp(cover, 0.0, 1.0);
  if (cover <= 0.0015) return;
  col *= 1.0 - cover;
  alpha = alpha + (1.0 - alpha) * cover;
}

/* Anillo de materia en el plano aplastado. La velocidad es kepleriana —el interior gira mucho más
   rápido— y el ruido se envuelve por el ángulo para que no aparezca una costura. */
float diskDensity(vec2 q, out float heat, out float ang) {
  vec2 d = vec2(q.x, q.y / DISK_SQUASH);
  float rd = length(d);
  ang = atan(d.y, d.x);
  heat = 0.0;
  if (rd < DISK_IN - 0.35 || rd > DISK_OUT) return 0.0;
  float u = ang + uSpin * 2.4 / pow(max(rd, 0.6), 1.5);
  float n = fbm3(vec3(cos(u) * 2.4, sin(u) * 2.4, rd * 1.35 - uSpin * 0.3));
  float band = smoothstep(DISK_IN - 0.3, DISK_IN + 0.34, rd)
             * (1.0 - smoothstep(DISK_OUT - 1.7, DISK_OUT, rd));
  heat = clamp(1.18 - (rd - DISK_IN) / (DISK_OUT - DISK_IN), 0.0, 1.0);
  return band * smoothstep(0.30, 0.74, n + 0.16);
}

// Arco lensado: mismo material, pero en un anillo circular que sube por encima del horizonte.
float haloDensity(vec2 q, float len) {
  float band = smoothstep(0.34, 0.0, abs(len - HALO_R));
  if (band <= 0.002) return 0.0;
  float a = atan(q.y, q.x);
  float n = fbm3(vec3(cos(a) * 3.0, sin(a) * 3.0, uSpin * 0.85));
  // El arco es fuerte arriba y abajo, donde la luz rodea el horizonte, y se apaga en los costados.
  float vertical = 0.18 + 0.82 * abs(q.y) / max(len, 0.001);
  return band * vertical * smoothstep(0.26, 0.78, n + 0.18);
}

void main() {
  vec2 p = vec2(gl_FragCoord.x / uPixelRatio, uRes.y - gl_FragCoord.y / uPixelRatio);

  float grow = smoothstep(0.0, 0.40, uCollapse);
  float pull = smoothstep(0.30, 1.0, uCollapse);
  // La escala geométrica no puede llegar a cero: es la unidad en la que vive todo el efecto.
  float R = uRadius * mix(0.34, 1.0, grow) * (1.0 + 0.14 * pull);
  vec2 q = (p - uCenter) / R;
  float len = length(q);
  if (len > FIELD_LIMIT) {
    gl_FragColor = vec4(0.0);
    return;
  }

  // El horizonte se hincha un instante al liberar y después se cierra sobre sí mismo.
  float swell = 1.0 + 0.26 * smoothstep(0.0, 0.10, uBurst) * (1.0 - smoothstep(0.10, 0.46, uBurst));
  float hz = swell * (1.0 - smoothstep(0.06, 0.44, uBurst));
  float diskLife = grow * (1.0 - smoothstep(0.0, 0.34, uBurst));
  float alive = grow * (1.0 - smoothstep(0.0, 0.30, uBurst));

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  float heat = 0.0;
  float ang = 0.0;
  float dens = diskDensity(q, heat, ang) * diskLife;
  // Doppler: el lado que viene hacia el espectador quema, el que se aleja casi desaparece.
  float doppler = 0.30 + 1.15 * pow(0.5 + 0.5 * cos(ang), 2.0);
  float body = dens * doppler * (0.42 + 0.62 * heat);
  vec3 tint = diskTint(heat);
  // El plano corta la pantalla por el centro: abajo pasa por delante del horizonte, arriba por detrás.
  float front = smoothstep(-0.05, 0.05, q.y);

  float halo = haloDensity(q, len) * diskLife;
  vec3 haloTint = mix(uDisk, uCore, 0.35);

  // 1. Lado lejano y su arco lensado, que el horizonte todavía puede tapar.
  addLight(col, alpha, tint, body * (1.0 - front));
  addLight(col, alpha, haloTint, halo * (1.0 - front) * 0.9);

  // 2. Pozo de sombra: la luz se apaga al acercarse al horizonte en vez de cortarse en seco.
  occlude(col, alpha, smoothstep(2.6, max(hz, 0.02) * 1.04, len) * 0.72 * grow);

  // 3. Horizonte de sucesos: negro opaco, sin brillo ni textura.
  if (hz > 0.01) {
    occlude(col, alpha, 1.0 - smoothstep(hz * 0.94, hz * 1.03, len));
  }

  // 4. Anillo de fotones pegado al borde, con titileo propio.
  if (hz > 0.01) {
    float ringWidth = 0.05 + 0.05 * (1.0 - grow);
    float ring = smoothstep(ringWidth, 0.0, abs(len - hz * 1.07));
    ring *= 0.72 + 0.46 * (0.5 + 0.5 * sin(uTime * 9.0 + atan(q.y, q.x) * 3.0));
    addLight(col, alpha, mix(uCore, uDisk, 0.32), ring * 1.6 * alive);
    float bloom = exp(-(len - hz) * (len - hz) * 2.6) * smoothstep(hz * 0.9, hz * 1.2, len);
    addLight(col, alpha, uDisk, bloom * 0.22 * alive);
  }

  // 5. Materia arrastrada: entra en espiral y se estira al filo del horizonte.
  for (int i = 0; i < INFALL; i++) {
    float fi = float(i);
    float s1 = hash11(fi * 1.7 + 3.1);
    float s2 = hash11(fi * 2.3 + 11.7);
    float s3 = hash11(fi * 3.9 + 5.3);
    float k = fract(uCollapse * (0.95 + s2 * 1.3) + s1);
    float ease = pow(k, 0.62);
    float rr = mix(7.4, max(hz, 0.06) * 1.06, ease);
    float a0 = s3 * 6.2831 + ease * (3.4 + s2 * 2.6);
    vec2 dir = vec2(cos(a0), sin(a0));
    vec2 pos = vec2(dir.x * rr, dir.y * rr * DISK_SQUASH * (0.75 + s1 * 0.95));
    vec2 delta = q - pos;
    if (dot(delta, delta) > 2.6) continue;
    vec2 tg = normalize(vec2(-pos.y, pos.x) + vec2(1e-5));
    vec2 nm = vec2(-tg.y, tg.x);
    float stretch = 1.0 + 6.5 * ease * ease;
    vec2 m = vec2(dot(delta, tg) / stretch, dot(delta, nm));
    float sz = (0.035 + s2 * 0.05) * (1.0 - 0.35 * ease);
    float g = sz / (length(m) + sz * 0.85);
    float e = pow(clamp(g, 0.0, 1.0), 3.0);
    float fade = smoothstep(0.0, 0.12, k) * (1.0 - smoothstep(0.84, 1.0, k));
    addLight(col, alpha, mix(uRim, uCore, ease), e * fade * 1.4 * alive);
  }

  // 6. Lado cercano: pasa por delante de todo lo anterior, horizonte incluido.
  addLight(col, alpha, tint, body * front);
  addLight(col, alpha, haloTint, halo * front * 0.9);

  // 7. Liberación: destello, onda de choque y brasas que se dispersan y caen.
  if (uBurst > 0.0) {
    float flashCore = exp(-uBurst * 11.0) * exp(-len * len * 0.22);
    col += mix(uCore, uDisk, 0.28) * flashCore * 2.8;
    alpha = alpha + (1.0 - alpha) * clamp(flashCore * 1.7, 0.0, 1.0);

    float waveR = 0.35 + 8.2 * pow(uBurst, 0.52);
    float waveWidth = 0.18 + 1.4 * uBurst;
    float wave = smoothstep(waveWidth, 0.0, abs(len - waveR)) * (1.0 - smoothstep(0.15, 0.95, uBurst));
    addLight(col, alpha, mix(uDisk, uRim, smoothstep(0.0, 0.6, uBurst)), wave * 0.8);

    for (int i = 0; i < EMBERS; i++) {
      float fi = float(i);
      float s1 = hash11(fi * 1.31 + 0.7);
      float s2 = hash11(fi * 2.71 + 4.3);
      float s3 = hash11(fi * 4.17 + 9.1);
      float delay = s3 * 0.16;
      float k = (uBurst - delay) / max(1.0 - delay, 0.001);
      if (k <= 0.0) continue;
      k = clamp(k, 0.0, 1.0);
      float a0 = (fi + s1) / float(EMBERS) * 6.2831 + s2 * 0.8;
      float rr = 0.25 + (2.4 + s2 * 5.0) * pow(k, 0.55);
      vec2 dir = vec2(cos(a0), sin(a0));
      // La dispersión hereda el plano del disco y después la gravedad de la escena las hace caer.
      vec2 pos = vec2(dir.x * rr, dir.y * rr * mix(0.55, 1.0, s1)) + vec2(0.0, 1.4 * k * k * (0.3 + s2));
      vec2 delta = q - pos;
      if (dot(delta, delta) > 6.0) continue;
      vec2 away = normalize(pos + vec2(1e-5));
      vec2 nm = vec2(-away.y, away.x);
      // Salen alargadas por la velocidad y se recogen al frenar.
      float stretch = 1.0 + 7.0 * (1.0 - k);
      vec2 m = vec2(dot(delta, away) / stretch, dot(delta, nm));
      float sz = (0.05 + s1 * 0.07) * (1.0 - 0.4 * k);
      float g = sz / (length(m) + sz * 0.8);
      float e = pow(clamp(g, 0.0, 1.0), 3.0) * (1.0 - smoothstep(0.35, 1.0, k));
      addLight(col, alpha, mix(uCore, mix(uDisk, uRim, k), smoothstep(0.0, 0.5, k)), e * 1.5);
    }
  }

  gl_FragColor = vec4(col, clamp(alpha, 0.0, 1.0));
}
`;

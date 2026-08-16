import * as THREE from "three";

export type DefeatGlassMaterial = THREE.ShaderMaterial & {
  uniforms: {
    uScreen: { value: THREE.Texture };
    uGlass: { value: number };
    uTime: { value: number };
    uCool: { value: THREE.Color };
    uGold: { value: THREE.Color };
  };
};

const VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vUv = uv;
    vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDirection = normalize(-viewPosition.xyz);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D uScreen;
  uniform float uGlass;
  uniform float uTime;
  uniform vec3 uCool;
  uniform vec3 uGold;

  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vViewDirection;

  void main() {
    vec3 captured = texture2D(uScreen, vUv).rgb;
    vec3 normal = normalize(vNormal);
    float facing = clamp(abs(dot(normal, normalize(vViewDirection))), 0.0, 1.0);
    float fresnel = pow(1.0 - facing, 2.35);

    float diagonal = vUv.x * 1.28 + vUv.y * 0.72;
    float movingBand = pow(max(0.0, sin(diagonal * 10.0 - uTime * 3.2)), 18.0);
    float coolBand = pow(max(0.0, sin((vUv.x - vUv.y) * 8.5 + uTime * 2.1)), 22.0);
    vec3 reflection = mix(uCool, uGold, clamp(movingBand * 0.72 + fresnel * 0.36, 0.0, 1.0));

    float capturedLuma = dot(captured, vec3(0.2126, 0.7152, 0.0722));
    vec3 refractedScreen = mix(captured * 0.58, captured, 0.42 + capturedLuma * 0.34);
    vec3 glassColour = refractedScreen
      + reflection * (0.16 + fresnel * 0.58)
      + uCool * coolBand * 0.22
      + uGold * movingBand * 0.28;

    vec3 colour = mix(captured, glassColour, uGlass);
    float glassAlpha = 0.105 + fresnel * 0.24 + movingBand * 0.055 + coolBand * 0.035;
    float alpha = mix(1.0, glassAlpha, uGlass);

    // El renderer compartido usa un framebuffer premultiplicado; entregar RGB premultiplicado
    // conserva la transparencia al copiar el fotograma WebGL al canvas 2D visible.
    gl_FragColor = vec4(colour * alpha, alpha);
  }
`;

export function createDefeatGlassMaterial(
  texture: THREE.Texture,
  cool: number,
  gold: number,
): DefeatGlassMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uScreen: { value: texture },
      uGlass: { value: 0 },
      uTime: { value: 0 },
      uCool: { value: new THREE.Color(cool) },
      uGold: { value: new THREE.Color(gold) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    premultipliedAlpha: true,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  }) as DefeatGlassMaterial;
}

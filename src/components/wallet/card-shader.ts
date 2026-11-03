/**
 * ROUT Card security shader (front face). Branch-free GLSL:
 * - thin-film interference foil (gold -> emerald -> deep blue) on the mask's R channel
 * - procedural guilloche rosette + wave lines, anti-aliased with fwidth
 * - latent kinegram watermark (mask G) visible only near a 45 degree view
 * - emboss: mask B is a height map that bends the normal, so light catches the print
 * - temporal noise keyed to the live server seed and the real clock
 */
import * as THREE from "three";

export const LATENT_COS = 0.7071; // cos(45 deg)
export const LATENT_WIDTH = 0.035;

const vertex = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;
void main() {
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  mat3 m = mat3(modelMatrix);
  vN = normalize(m * vec3(0.0, 0.0, 1.0));
  vT = normalize(m * vec3(1.0, 0.0, 0.0));
  vB = normalize(m * vec3(0.0, 1.0, 0.0));
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const fragment = /* glsl */ `
uniform sampler2D uMap;
uniform sampler2D uMask;
uniform float uTime;
uniform float uFinish;   // 0 metal, 1 glass, 2 holo
uniform vec4 uSeed;      // live server seed for this 30 s window
uniform vec3 uLightPos;
uniform vec2 uTexel;
uniform float uLatentCos;
uniform float uLatentWidth;
varying vec2 vUv;
varying vec3 vWorldPos;
varying vec3 vN;
varying vec3 vT;
varying vec3 vB;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Thin-film interference: one oil-slick layer (n = 1.45) of thickness d nm.
vec3 thinFilm(float cosI, float d) {
  float n = 1.45;
  float sinT2 = (1.0 - cosI * cosI) / (n * n);
  float cosT = sqrt(max(1.0 - sinT2, 0.0));
  vec3 lambda = vec3(640.0, 540.0, 455.0);
  vec3 phase = 12.566371 * n * d * cosT / lambda;
  return 0.5 + 0.5 * cos(phase);
}

float aaLine(float v, float width) {
  float f = abs(fract(v) - 0.5);
  float w = fwidth(v);
  return 1.0 - smoothstep(width, width + w * 1.5, 0.5 - f);
}

void main() {
  vec4 base = texture2D(uMap, vUv);
  vec3 mask = texture2D(uMask, vUv).rgb;

  // Emboss: height gradient from the mask's blue channel bends the normal.
  float hL = texture2D(uMask, vUv - vec2(uTexel.x, 0.0)).b;
  float hR = texture2D(uMask, vUv + vec2(uTexel.x, 0.0)).b;
  float hD = texture2D(uMask, vUv - vec2(0.0, uTexel.y)).b;
  float hU = texture2D(uMask, vUv + vec2(0.0, uTexel.y)).b;
  vec3 N = normalize(vN - vT * (hR - hL) * 1.4 - vB * (hU - hD) * 1.4);
  N *= float(gl_FrontFacing) * 2.0 - 1.0;

  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 H = normalize(L + V);
  float cosV = clamp(dot(N, V), 0.0, 1.0);

  // Guilloche: a rosette and a wave field, both resolution independent.
  vec2 p = (vUv - 0.5) * vec2(1.0, 1.588);
  float r = length(p);
  float a = atan(p.y, p.x);
  float rose = aaLine(r * 46.0 + 0.55 * sin(a * 12.0) + 0.25 * sin(a * 5.0 + r * 30.0), 0.035);
  float rose2 = aaLine(r * 46.0 - 0.55 * sin(a * 12.0 + 1.3), 0.035);
  float waves = aaLine(p.y * 70.0 + 0.9 * sin(p.x * 24.0 + p.y * 6.0), 0.03);
  float guilloche = max(max(rose, rose2) * smoothstep(0.62, 0.15, r), waves * 0.55);

  // Finish weights without branches.
  float isGlass = step(0.5, uFinish) * step(uFinish, 1.5);
  float isHolo = step(1.5, uFinish);
  float isMetal = 1.0 - isGlass - isHolo;
  float rough = mix(mix(0.38, 0.06, isGlass), 0.2, isHolo);
  float shininess = 2.0 / (rough * rough * rough * rough + 1e-3);

  // Foil: thin film whose thickness flows over the card, so colours sweep with tilt.
  float foil = max(mask.r, isHolo * 0.45 + guilloche * 0.25 * isHolo);
  float thickness = 360.0 + 260.0 * sin(p.x * 3.1 + p.y * 2.3 + uSeed.w * 6.2831) + 120.0 * guilloche;
  vec3 film = thinFilm(cosV, thickness);
  // Bias toward ROUT gold / emerald / deep blue.
  film = mix(film, film * vec3(1.05, 0.98, 1.1) + vec3(0.04, 0.02, 0.0), 0.5);

  float diff = clamp(dot(N, L), 0.0, 1.0);
  float spec = pow(clamp(dot(N, H), 0.0, 1.0), shininess) * (shininess + 8.0) / 25.0;
  float F0 = mix(mix(0.6, 0.04, isGlass), 0.3, isHolo);
  float fres = F0 + (1.0 - F0) * pow(1.0 - cosV, 5.0);

  // Cheap studio environment for reflections.
  vec3 R = reflect(-V, N);
  vec3 env = mix(vec3(0.05, 0.05, 0.07), vec3(1.0), smoothstep(-0.1, 0.9, R.y));
  env += vec3(0.55, 0.65, 1.0) * smoothstep(0.55, 1.0, -R.x) + vec3(1.0, 0.8, 0.9) * smoothstep(0.6, 1.0, R.x) * 0.6;

  vec3 col = base.rgb * (0.38 + 0.72 * diff);
  col *= 1.0 - guilloche * 0.08 * (isMetal + isHolo);
  vec3 metalTint = mix(vec3(1.0), base.rgb + 0.35, 0.5 * isMetal);
  col += spec * metalTint * (1.0 - rough);
  col += env * fres * mix(0.35, 0.6, isGlass);
  col = mix(col, film * (0.55 + env * 0.5 + spec * 0.8), foil * (0.55 + 0.4 * (1.0 - cosV)));

  // Latent image: Gaussian window around 45 deg, effectively zero at 0 deg.
  float latent = exp(-pow((cosV - uLatentCos) / uLatentWidth, 2.0)) * mask.g;
  col += latent * vec3(0.85, 1.0, 0.92) * 0.85;

  // Temporal security noise: changes 60x/s and per 30 s server window.
  float tick = floor(uTime * 60.0);
  float n = hash12(gl_FragCoord.xy + uSeed.xy * 4096.0 + tick * vec2(1.618, 2.718));
  float strobe = step(0.5, fract((vUv.x + vUv.y) * 180.0 + uTime * (3.0 + uSeed.z * 4.0)));
  col += (n - 0.5) * 0.022 + (strobe - 0.5) * 0.006;

  gl_FragColor = vec4(max(col, 0.0), 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function createSecurityMaterial(map: THREE.Texture, mask: THREE.Texture, texel: [number, number]): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    toneMapped: true,
    uniforms: {
      uMap: { value: map },
      uMask: { value: mask },
      uTime: { value: 0 },
      uFinish: { value: 0 },
      uSeed: { value: new THREE.Vector4(0.5, 0.5, 0.5, 0.5) },
      uLightPos: { value: new THREE.Vector3(0, 1, 2.4) },
      uTexel: { value: new THREE.Vector2(texel[0], texel[1]) },
      uLatentCos: { value: LATENT_COS },
      uLatentWidth: { value: LATENT_WIDTH },
    },
  });
}

/** A restrained, sky-blue adaptation of the supplied FloatingLines reference. */
export const ASTRAL_PALETTE = [
  "#bae6fd",
  "#7dd3fc",
  "#38bdf8",
  "#0ea5e9",
  "#0284c7",
] as const;

export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec2 iMouse;
  uniform float bendInfluence;
  uniform float intensity;
  uniform vec3 lineGradient[5];

  const float bendRadius = 1.65;
  const float bendStrength = 1.25;
  const vec3 VOID_BLACK = vec3(2.0, 6.0, 23.0) / 255.0;

  mat2 rotate(float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return mat2(c, s, -s, c);
  }

  // Constant array indices keep this compatible with older WebGL drivers.
  vec3 lineColor(float t) {
    float segment = clamp(t, 0.0, 1.0) * 4.0;
    if (segment < 1.0) return mix(lineGradient[0], lineGradient[1], segment);
    if (segment < 2.0) return mix(lineGradient[1], lineGradient[2], segment - 1.0);
    if (segment < 3.0) return mix(lineGradient[2], lineGradient[3], segment - 2.0);
    return mix(lineGradient[3], lineGradient[4], segment - 3.0);
  }

  float wave(vec2 uv, float offset, float strand, vec2 screenUv, vec2 mouseUv) {
    float time = iTime * 0.55;
    float amplitude = 0.21 + sin(offset + time * 0.22) * 0.09;
    float y = sin(uv.x * 1.28 + offset + time * 0.8) * amplitude;
    y += sin(uv.x * 0.6 - time * 0.45 + strand * 0.1) * 0.16;
    vec2 distanceToMouse = screenUv - mouseUv;
    float influence = exp(-dot(distanceToMouse, distanceToMouse) * bendRadius);
    float bend = (mouseUv.y - screenUv.y) * influence * bendStrength * bendInfluence;
    y += bend;
    y += sin(uv.x * 2.0 - time + strand * 0.12) * influence * bendInfluence * 0.065;
    float distanceToLine = abs(uv.y - y);
    float pixel = 2.0 / max(iResolution.y, 1.0);
    float core = 1.0 - smoothstep(pixel * 0.45, pixel * 1.45, distanceToLine);
    float halo = exp(-distanceToLine * 33.0) * 0.095;
    return core * 0.24 + halo;
  }

  void main() {
    vec2 screenUv = (2.0 * gl_FragCoord.xy - iResolution.xy) / iResolution.y;
    vec2 mouseUv = (2.0 * iMouse - 1.0) * vec2(iResolution.x / iResolution.y, 1.0);
    vec2 uv = screenUv;
    vec3 ribbons = vec3(0.0);

    for (int i = 0; i < 12; i++) {
      float fi = float(i);
      float t = fi / 11.0;
      vec2 ribbonUv = rotate(-0.22 + 0.05 * sin(uv.x * 0.4)) * uv;
      ribbonUv.y += 0.10 + (fi - 5.5) * 0.025;
      ribbons += lineColor(t) * wave(ribbonUv, 1.8 + fi * 0.11, fi, screenUv, mouseUv);
    }

    for (int i = 0; i < 8; i++) {
      float fi = float(i);
      vec2 ribbonUv = rotate(0.18) * uv;
      ribbonUv.y += 0.42 + fi * 0.032;
      ribbons += lineColor(0.25 + fi / 14.0) * wave(ribbonUv, 3.4 + fi * 0.14, fi, screenUv, mouseUv) * 0.35;
    }

    // Keep the ends and outer edges quiet enough to sit behind real content.
    float edgeFade = 1.0 - smoothstep(0.58, 1.8, abs(screenUv.y));
    float breath = 0.86 + sin(iTime * 0.13) * 0.06;
    vec3 glow = vec3(0.0, 0.027, 0.05) * exp(-dot(screenUv * vec2(0.45, 0.8), screenUv * vec2(0.45, 0.8)));
    glow += vec3(0.012, 0.045, 0.07) * exp(-dot(screenUv - mouseUv, screenUv - mouseUv) * 2.5) * bendInfluence;
    vec3 color = VOID_BLACK + (ribbons * edgeFade * breath + glow) * intensity;
    gl_FragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
  }
`;

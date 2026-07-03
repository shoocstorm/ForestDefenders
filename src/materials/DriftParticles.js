import * as THREE from 'three';

// Shader-driven replacements for the fireflies (Arena.js) and falling-petals
// (Game.js) THREE.Points clouds. Both used to be animated by a per-frame CPU
// loop that rewrote the whole position buffer and re-uploaded it to the GPU
// every frame regardless of what's happening in-game — a fixed baseline cost
// on every frame of gameplay. Here the same motion is expressed as a closed
// form of a single `uTime` uniform plus per-particle attributes baked once at
// init, so the CPU side only ever writes two scalars a frame.

const _fragmentShader = /* glsl */`
  precision highp float;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - vec2(0.5);
    float d = length(uv);
    if (d > 0.5) discard;
    float alpha = smoothstep(0.5, 0.0, d) * uOpacity;
    gl_FragColor = vec4(vColor, alpha);
  }
`;

function _pointsMaterial(uniforms, vertexShader) {
  return new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader: _fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
}

// Fireflies: the old CPU loop Euler-integrated a smooth periodic velocity
// (`arr[i*3] += cos(t*0.8+s) * dt * speed*0.5`, etc). At 60fps that numerical
// integration converges to the exact analytic integral, so the closed forms
// below reproduce the same drift/bob almost exactly with no per-frame loop.
// `position` doubles as each firefly's baked spawn point (x0, baseY, z0).
export function fireflyMaterial(size) {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.85 },
    uSize: { value: size },
  };
  const vertexShader = /* glsl */`
    attribute vec3 color;
    attribute float aSeed;
    attribute float aSpeed;
    uniform float uTime;
    uniform float uSize;
    varying vec3 vColor;
    void main() {
      float s = aSeed;
      float sp = aSpeed;
      float t = uTime;
      float x = position.x + (sp * 0.625) * (sin(0.8 * t + s) - sin(s));
      float z = position.z + (sp * 0.66667) * (cos(s) - cos(0.6 * t + s));
      float y = position.y
        + sin(1.5 * t + s) * 0.5
        + sin(0.7 * t + s * 2.0) * 0.3
        + 0.1 * cos(s) - 0.1 * cos(2.0 * t + s);
      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
      gl_PointSize = uSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  return _pointsMaterial(uniforms, vertexShader);
}

// Falling petals/ash/leaves: linear fall from y=20 down to 0, expressed as a
// sawtooth via mod() so the "reset to the top" is stateless. The old CPU
// version re-randomized X/Z on every reset; here each particle always returns
// to its own baked spawn X/Z (still desynced from its neighbours by speed and
// phase, so it still reads as scattered ambient fall) — trading an exact
// re-randomize for a fully stateless shader with no per-frame CPU pass.
export function fallingParticleMaterial(size) {
  const uniforms = {
    uTime: { value: 0 },
    uOpacity: { value: 0.75 },
    uSize: { value: size },
  };
  const vertexShader = /* glsl */`
    attribute vec3 color;
    attribute float aFallSpeed;
    attribute float aFallDrift;
    attribute float aPhase;
    uniform float uTime;
    uniform float uSize;
    varying vec3 vColor;
    void main() {
      float speed = aFallSpeed;
      float phase = aPhase;
      float t = uTime;
      float cycle = 20.0 / speed;
      float tOffset = (20.0 - position.y) / speed;
      float tau = mod(t + tOffset, cycle);
      float y = 20.0 - speed * tau;

      float swayX = (cos(phase) - cos(0.5 * t + phase))
                  + 0.1 * (cos(phase) - cos(2.0 * t + phase));
      float x = position.x + aFallDrift * tau + swayX;

      float swayZ = sin(0.4 * t + phase * 0.7) - sin(phase * 0.7);
      float z = position.z + swayZ;

      vColor = color;
      vec4 mvPosition = modelViewMatrix * vec4(x, y, z, 1.0);
      gl_PointSize = uSize * (300.0 / -mvPosition.z);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;
  return _pointsMaterial(uniforms, vertexShader);
}

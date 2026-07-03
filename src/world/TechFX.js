import * as THREE from 'three';

// Sci-fi arena FX shaders (used by the reskinned Arena). Two additive,
// transparent ShaderMaterials that read as holographic tech: an animated grid
// floor overlay and an energy force-field panel. Each exposes its time uniform
// at material.userData.__uTime so the Arena can advance it per-frame and own
// disposal (no global registry — keeps biome-switch teardown leak-free).

function _mat(uniforms, vertexShader, fragmentShader) {
  const m = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  m.userData.__uTime = uniforms.uTime;
  return m;
}

// Ground holo-grid: crisp derivative-AA grid lines + a radial scan pulse
// expanding from arena centre + soft distance vignette. `cell` = grid spacing
// in world units; the plane is expected to carry world XZ in its UVs scaled to
// world size (Arena maps uv → world position via uScale).
export function gridMaterial(accentColor, { cell = 4.0, sizeX = 1.0, sizeZ = 1.0, scan = 1.0 } = {}) {
  const uniforms = {
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(accentColor) },
    uCell: { value: cell },
    uSize: { value: new THREE.Vector2(sizeX, sizeZ) },
    uScan: { value: scan },
  };
  const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uAccent;
    uniform float uCell;
    uniform vec2 uSize;
    uniform float uScan;

    float gridLine(vec2 p, float cell) {
      vec2 g = abs(fract(p / cell - 0.5) - 0.5) / fwidth(p / cell);
      float line = min(g.x, g.y);
      return 1.0 - clamp(line, 0.0, 1.0);
    }

    void main() {
      // World-space position centred on arena (uv 0..1 → -0.5..0.5 * size).
      vec2 wp = (vUv - 0.5) * uSize;

      float fine = gridLine(wp, uCell);
      float coarse = gridLine(wp, uCell * 4.0) * 1.4;
      float grid = max(fine * 0.5, coarse);

      // Radial scan pulse rippling outward from centre (uScan lets callers
      // silence this per-instance — e.g. the platform deck trades it for
      // rings that rise off the deck instead of a ground ripple).
      float r = length(wp);
      float scan = smoothstep(0.06, 0.0, abs(fract(r * 0.03 - uTime * 0.18) - 0.0));
      scan += smoothstep(0.06, 0.0, abs(fract(r * 0.03 - uTime * 0.18) - 1.0));
      scan *= uScan;

      // Fade with distance so the far field dissolves into fog.
      float maxR = length(uSize) * 0.5;
      // Very aggressive fade — pulse stays near center, never reaches player
      float vignette = smoothstep(maxR * 0.35, maxR * 0.18, r);

      float a = (grid * 0.45 + scan * 0.12) * vignette;
      gl_FragColor = vec4(uAccent * (1.0 + scan), a);
    }
  `;
  return _mat(uniforms, vertexShader, fragmentShader);
}

// Energy force-field panel: scrolling vertical scanlines + faint horizontal
// stripe weave + edge fade (brighter near vertical edges/top) + slow flicker.
// Applied to thin upright planes spanning the arena boundary posts.
export function forceFieldMaterial(accentColor) {
  const uniforms = {
    uTime: { value: 0 },
    uAccent: { value: new THREE.Color(accentColor) },
  };
  const vertexShader = /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const fragmentShader = /* glsl */`
    precision highp float;
    varying vec2 vUv;
    uniform float uTime;
    uniform vec3 uAccent;

    void main() {
      // Vertical scanlines drifting upward.
      float scan = 0.5 + 0.5 * sin((vUv.y * 60.0) - uTime * 3.0);
      scan = pow(scan, 3.0);

      // Faint moving hex/stripe weave.
      float weave = 0.5 + 0.5 * sin(vUv.x * 40.0 + uTime * 1.5)
                        * sin(vUv.y * 22.0 - uTime * 1.1);

      // Edge glow: brighter near left/right posts and along the top rail.
      float edge = pow(1.0 - abs(vUv.x - 0.5) * 2.0, 2.0);
      edge = max(edge, smoothstep(0.7, 1.0, vUv.y) * 0.8);

      // Overall low-frequency flicker.
      float flick = 0.85 + 0.15 * sin(uTime * 7.0 + vUv.x * 3.0);

      float base = 0.02 + edge * 0.10;
      float a = (base + scan * 0.05 + weave * 0.02) * flick;
      a = clamp(a, 0.0, 0.85);
      gl_FragColor = vec4(uAccent * (1.0 + scan * 0.6), a);
    }
  `;
  return _mat(uniforms, vertexShader, fragmentShader);
}

import * as THREE from 'three';

// Gradient sky dome (production-visual pass). A large inverted sphere replaces
// the flat `scene.background` colour with a three-stop vertical gradient, a
// directional sun/moon glow aligned with SkyDecor's sky body, and (optionally)
// a fine shader star field. Horizon colour is chosen per biome to sit close to
// the scene fog colour so distant geometry dissolves into the sky instead of
// silhouetting against a flat backdrop.
//
// The dome is drawn first (renderOrder -1000) with depthWrite off, so the
// SkyDecor bodies beyond its radius still overdraw it, and it never occludes
// gameplay geometry. It is a plain ShaderMaterial — intentionally fog-blind
// and unlit. A per-pixel dither kills gradient banding on smooth skies.
const DOME_R = 300; // < camera far (600); > fog far so it reads through the haze

const VERT = /* glsl */`
  varying vec3 vDir;
  void main() {
    vDir = position; // dome is centred on the origin — position IS the direction
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FRAG = /* glsl */`
  uniform vec3 uZenith, uHorizon, uBottom, uSunGlow;
  uniform vec3 uSunDir;
  uniform float uSunPow, uSunGlowI, uStars, uTime;
  varying vec3 vDir;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec3 dir = normalize(vDir);

    // Vertical gradient: horizon -> zenith above, short falloff -> bottom below.
    vec3 sky = mix(uHorizon, uZenith, pow(clamp(dir.y, 0.0, 1.0), 0.62));
    sky = mix(sky, uBottom, clamp(-dir.y * 3.0, 0.0, 1.0));

    // Directional sun/moon bloom around the sky body.
    float s = pow(max(dot(dir, uSunDir), 0.0), uSunPow);
    sky += uSunGlow * (s * uSunGlowI);

    // Fine star field (biome-gated): cell-hashed points on the direction
    // sphere, kept above the horizon and gently twinkling.
    if (uStars > 0.0) {
      vec2 sph = vec2(atan(dir.z, dir.x), asin(clamp(dir.y, -1.0, 1.0))) * 80.0;
      vec2 id = floor(sph);
      float h = hash(id);
      vec2 f = fract(sph) - 0.5 - (vec2(fract(h * 13.7), fract(h * 7.3)) - 0.5) * 0.6;
      float star = smoothstep(0.10, 0.02, length(f)) * step(0.82, h);
      star *= smoothstep(0.04, 0.28, dir.y);
      star *= 0.65 + 0.35 * sin(uTime * 2.0 + h * 41.0);
      sky += vec3(0.82, 0.9, 1.0) * (star * uStars);
    }

    // Per-pixel dither — smooth gradients band badly on 8-bit outputs.
    sky += (hash(gl_FragCoord.xy + fract(uTime) * 61.7) - 0.5) * (1.5 / 255.0);

    gl_FragColor = vec4(sky, 1.0);
  }
`;

export class SkyDome {
  constructor(scene, biome, skyBodyPos) {
    this.uniforms = {
      uZenith: { value: new THREE.Color(biome.skyGrad?.zenith ?? biome.sky) },
      uHorizon: { value: new THREE.Color(biome.skyGrad?.horizon ?? biome.fog) },
      uBottom: { value: new THREE.Color(biome.skyGrad?.bottom ?? biome.fog) },
      uSunGlow: { value: new THREE.Color(biome.skyGrad?.sunGlow ?? 0xffffff) },
      uSunDir: { value: new THREE.Vector3(-0.5, 0.4, 0.2).normalize() },
      uSunPow: { value: biome.skyGrad?.sunPow ?? 24 },
      uSunGlowI: { value: biome.skyGrad?.sunGlowI ?? 0.4 },
      uStars: { value: biome.skyGrad?.stars ?? 0 },
      uTime: { value: 0 },
    };
    // Align the glow with SkyDecor's sun/moon disc so the shader bloom and the
    // visible body read as one light source.
    if (Array.isArray(skyBodyPos) && skyBodyPos.length === 3) {
      this.uniforms.uSunDir.value.fromArray(skyBodyPos).normalize();
    }

    const geo = new THREE.SphereGeometry(DOME_R, 48, 24);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, vertexShader: VERT, fragmentShader: FRAG,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -1000; // behind everything; writes no depth
    scene.add(this.mesh);
    this.scene = scene;
  }

  update(dt) {
    this.uniforms.uTime.value += dt; // star twinkle + dither animation
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

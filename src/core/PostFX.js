import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { POST, QUALITY, AO_QUALITY, BLOOM_LAYER } from '../config/Constants.js';

// Cinematic-cel post pipeline (threejs-bloom + image-pipeline ordering).
//
// Selective bloom uses the layer-camera ownership model: the bloom composer renders
// ONLY bloom-layer objects on a black background (no per-frame material mutation, so
// restoration is guaranteed by construction — no transactional risk). It is composited
// additively in LINEAR HDR, *before* tone mapping:
//
//   bloomComposer:  render(bloom layer only, black bg) → UnrealBloom            → tBloom
//   finalComposer:  [GTAO|Render](full scene, linear) → +tBloom → OutputPass(ACES)
//
// Quality tiers (Constants.QUALITY): HIGH adds GTAO contact AO; LOW drops it and
// halves bloom resolution to hold 60fps. Toggle with `/`. Debug: setMode() exposes
// a no-post baseline and isolated bloom/AO views for validation.
const COMBINE = {
  uniforms: { tDiffuse: { value: null }, tBloom: { value: null }, uStrength: { value: 1 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform sampler2D tBloom; uniform float uStrength; varying vec2 vUv;' +
    'void main(){ vec4 b=texture2D(tDiffuse,vUv); vec4 g=texture2D(tBloom,vUv); gl_FragColor=b+g*uStrength; }',
};

// Final image polish (production-visual pass): gentle saturation/contrast
// grade, a soft vignette, and luminance-weighted animated film grain. Runs
// AFTER OutputPass, i.e. on the tone-mapped sRGB image, as the last quad to
// screen. All strengths are tiny by design — this is the "expensive game"
// sheen, not a filter. Bypassed entirely on the Performance preset (post off).
const POLISH = {
  uniforms: {
    tDiffuse: { value: null }, uVignette: { value: 0.32 }, uGrain: { value: 0.045 },
    uSaturation: { value: 1.06 }, uContrast: { value: 1.04 }, uTime: { value: 0 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader:
    'uniform sampler2D tDiffuse; uniform float uVignette,uGrain,uSaturation,uContrast,uTime;' +
    'uniform vec2 uRes; varying vec2 vUv;\n' +
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }\n' +
    'void main(){\n' +
    '  vec3 c = texture2D(tDiffuse, vUv).rgb;\n' +
    '  float lum = dot(c, vec3(0.2126,0.7152,0.0722));\n' +
    '  c = mix(vec3(lum), c, uSaturation);\n' +
    '  c = (c - 0.5) * uContrast + 0.5;\n' +
    '  float d = distance(vUv, vec2(0.5));\n' +
    '  c *= 1.0 - uVignette * smoothstep(0.32, 0.75, d);\n' +
    '  c += (hash(vUv * uRes + vec2(mod(uTime, 10.0) * 43.7)) - 0.5) * uGrain * (1.0 - 0.5 * lum);\n' +
    '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);\n' +
    '}',
};

export class PostFX {
  constructor(renderer, scene, camera) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.quality = QUALITY.DEFAULT;
    this.aoLevel = AO_QUALITY.DEFAULT; // player-facing GTAO tier (HIGH | LOW | OFF)
    this.aoScale = 1; // GTAO resolution multiplier for the active tier
    this.gtaoEnabled = false; // player override: defaults off — GTAO nearly doubles frame cost
    this.postEnabled = true; // false → bypass the whole composer stack (Performance preset)
    this.mode = 'full'; // 'full' | 'nopost' | 'bloom' | 'ao'
    const w = window.innerWidth, h = window.innerHeight;

    // --- Bloom composer: bloom-layer objects only, on black ---
    this.bloomComposer = new EffectComposer(renderer);
    this.bloomComposer.renderToScreen = false;
    this.bloomComposer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h),
      POST.BLOOM_STRENGTH, POST.BLOOM_RADIUS, POST.BLOOM_THRESHOLD);
    this.bloomComposer.addPass(this.bloom);

    // --- Final composer (rebuilt on quality change) ---
    this._buildFinal(w, h);
  }

  _buildFinal(w, h) {
    // Rebuilding (quality/AO toggle) replaces the composer + its passes, each of
    // which owns its own full-screen render targets/materials — dispose the
    // outgoing ones or every toggle leaks a set of HDR framebuffers for the
    // session's lifetime. EffectComposer.dispose() only frees its own read/write
    // targets, not the passes added to it, so each owned pass is disposed too.
    this.finalComposer?.dispose();
    this.gtao?.dispose();
    this.combine?.dispose();
    this.outputPass?.dispose();
    this.polishPass?.dispose();

    const q = QUALITY[this.quality];
    const ao = AO_QUALITY[this.aoLevel] || AO_QUALITY[AO_QUALITY.DEFAULT];
    this.aoScale = ao.scale;
    // MSAA lives on the composer's render targets: the renderer's canvas
    // antialias never applies while the post stack is active (geometry renders
    // into these targets, not the canvas), so without samples every crisp cel
    // edge aliases. WebGL2 resolves the multisampled buffer automatically when
    // the following passes sample it.
    this.finalComposer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType, samples: q.msaa || 0,
    }));

    // AO runs only when the global quality tier allows it AND the player hasn't
    // turned it off. LOW renders GTAO at a fraction of screen resolution (aoScale)
    // — the dominant mobile-FPS lever — then composites onto the full-res beauty.
    if (q.ao && ao.enabled && this.gtaoEnabled) {
      // GTAO's OUTPUT.Default composites AO onto the beauty already living in the
      // composer's readBuffer — it does NOT render the scene itself. A RenderPass
      // must run first to fill that buffer, otherwise the beauty pass comes out
      // black and only the separate bloom layer shows through.
      this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
      const aw = Math.max(1, Math.round(w * ao.scale));
      const ah = Math.max(1, Math.round(h * ao.scale));
      this.gtao = new GTAOPass(this.scene, this.camera, aw, ah);
      this.gtao.output = GTAOPass.OUTPUT.Default; // composites AO onto the beauty render
      this.gtao.blendIntensity = POST.AO_INTENSITY;
      this.finalComposer.addPass(this.gtao);
    } else {
      this.gtao = null;
      this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
    }

    this.combine = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(COMBINE.uniforms),
      vertexShader: COMBINE.vertexShader, fragmentShader: COMBINE.fragmentShader,
    }), 'tDiffuse');
    this.combine.material.uniforms.tBloom.value = this.bloomComposer.renderTarget2.texture;
    this.combine.material.uniforms.uStrength.value = q.bloomScale;
    this.finalComposer.addPass(this.combine);

    this.outputPass = new OutputPass();
    this.finalComposer.addPass(this.outputPass);

    // Final polish quad — after OutputPass (sRGB image), before the screen.
    const pz = q.polish || QUALITY.HIGH.polish;
    this.polishPass = new ShaderPass(new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(POLISH.uniforms),
      vertexShader: POLISH.vertexShader, fragmentShader: POLISH.fragmentShader,
    }), 'tDiffuse');
    const pu = this.polishPass.material.uniforms;
    pu.uVignette.value = pz.vignette;
    pu.uGrain.value = pz.grain;
    pu.uSaturation.value = pz.saturation;
    pu.uContrast.value = pz.contrast;
    this.finalComposer.addPass(this.polishPass);

    this.finalComposer.setSize(w, h);
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this._buildFinal(window.innerWidth, window.innerHeight);
  }
  toggleQuality() { this.setQuality(this.quality === 'HIGH' ? 'LOW' : 'HIGH'); }

  // Player-facing GTAO tier (Settings → Graphics). Rebuilds the final composer so
  // the pass is added/dropped or its render targets resized to the new aoScale.
  setAOLevel(name) {
    if (!AO_QUALITY[name] || name === 'DEFAULT' || name === 'ORDER') return;
    this.aoLevel = name;
    this._buildFinal(window.innerWidth, window.innerHeight);
  }

  // Player override (Settings → Graphics → Ambient Occlusion). Independent of the
  // quality preset's AO tier: false force-drops the GTAO pass even on High/Balanced.
  setGTAOEnabled(on) {
    this.gtaoEnabled = on;
    this._buildFinal(window.innerWidth, window.innerHeight);
  }

  setMode(mode) { this.mode = mode; }

  // Performance preset: when false, render() does a single direct scene render,
  // skipping the bloom composer's extra full-scene pass, the bloom blur mips, the
  // GTAO pass and the OutputPass. The renderer's own ACES tone mapping still applies.
  setPostEnabled(on) { this.postEnabled = on; }

  render() {
    if (!this.postEnabled || this.mode === 'nopost') { this.renderer.render(this.scene, this.camera); return; }

    // Animated grain (wrapped to keep float precision inside the hash).
    if (this.polishPass) this.polishPass.material.uniforms.uTime.value = (performance.now() * 0.001) % 10;

    // Bloom pass: isolate the bloom layer on a black background.
    const bg = this.scene.background;
    const mask = this.camera.layers.mask;
    this.scene.background = null;
    this.camera.layers.set(BLOOM_LAYER);
    this.bloomComposer.renderToScreen = this.mode === 'bloom'; // debug: bloom only
    this.bloomComposer.render();
    this.bloomComposer.renderToScreen = false;
    this.camera.layers.mask = mask;
    this.scene.background = bg;
    if (this.mode === 'bloom') return;

    // 'ao' debug zeroes bloom to inspect contact AO in isolation.
    this.combine.material.uniforms.uStrength.value =
      this.mode === 'ao' ? 0 : QUALITY[this.quality].bloomScale;
    this.finalComposer.render();
  }

  setSize(w, h) {
    // EffectComposer snapshots the renderer's pixel ratio at construction and
    // never sees later changes — setGraphics lowers it for Balanced/Performance
    // *after* this object exists. Sync both composers here (setSize runs on
    // resize and preset changes) or the bloom chain keeps rendering at the
    // construction-time ratio: up to 4x the intended pixels on high-DPR screens.
    const pr = this.renderer.getPixelRatio();
    this.bloomComposer.setPixelRatio(pr);
    this.finalComposer.setPixelRatio(pr);
    this.bloomComposer.setSize(w, h);
    // Bloom blur mips deliberately capped at CSS resolution (not effective
    // pixels): the glow is heavily blurred, so a lower-res mip chain looks
    // identical and saves ratio² of fill on retina displays.
    this.bloom.setSize(w, h);
    this.finalComposer.setSize(w, h);
    this.gtao?.setSize(Math.max(1, Math.round(w * this.aoScale)), Math.max(1, Math.round(h * this.aoScale)));
    this.combine.material.uniforms.tBloom.value = this.bloomComposer.renderTarget2.texture;
    // Grain is per-screen-pixel — scale the hash domain with the drawing buffer.
    this.polishPass?.material.uniforms.uRes.value.set(w * pr, h * pr);
  }
}

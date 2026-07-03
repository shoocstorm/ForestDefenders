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

    const q = QUALITY[this.quality];
    const ao = AO_QUALITY[this.aoLevel] || AO_QUALITY[AO_QUALITY.DEFAULT];
    this.aoScale = ao.scale;
    this.finalComposer = new EffectComposer(this.renderer);

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
    this.bloomComposer.setSize(w, h);
    this.bloom.setSize(w, h);
    this.finalComposer.setSize(w, h);
    this.gtao?.setSize(Math.max(1, Math.round(w * this.aoScale)), Math.max(1, Math.round(h * this.aoScale)));
    this.combine.material.uniforms.tBloom.value = this.bloomComposer.renderTarget2.texture;
  }
}

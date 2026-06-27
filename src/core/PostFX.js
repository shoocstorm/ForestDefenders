import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { POST, QUALITY, BLOOM_LAYER } from '../config/Constants.js';

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
    const q = QUALITY[this.quality];
    this.finalComposer = new EffectComposer(this.renderer);

    if (q.ao) {
      // GTAO's OUTPUT.Default composites AO onto the beauty already living in the
      // composer's readBuffer — it does NOT render the scene itself. A RenderPass
      // must run first to fill that buffer, otherwise the beauty pass comes out
      // black and only the separate bloom layer shows through.
      this.finalComposer.addPass(new RenderPass(this.scene, this.camera));
      this.gtao = new GTAOPass(this.scene, this.camera, w, h);
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

    this.finalComposer.addPass(new OutputPass());
    this.finalComposer.setSize(w, h);
  }

  setQuality(name) {
    if (!QUALITY[name]) return;
    this.quality = name;
    this._buildFinal(window.innerWidth, window.innerHeight);
  }
  toggleQuality() { this.setQuality(this.quality === 'HIGH' ? 'LOW' : 'HIGH'); }

  setMode(mode) { this.mode = mode; }

  render() {
    if (this.mode === 'nopost') { this.renderer.render(this.scene, this.camera); return; }

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
    this.gtao?.setSize(w, h);
    this.combine.material.uniforms.tBloom.value = this.bloomComposer.renderTarget2.texture;
  }
}

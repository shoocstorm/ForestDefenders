import * as THREE from 'three';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { Arena } from '../world/Arena.js';
import { Player } from '../entities/Player.js';
import { CAMERA } from '../config/Constants.js';

// Top-level game: owns renderer, scene, the fixed-step update loop, and the
// systems registry. Milestones add systems (WaveManager, enemies, HUD, etc.)
// by pushing into this.systems and/or extending update().
export class Game {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight);

    this.arena = new Arena(this.scene);
    this.player = new Player(this.scene, this.cameraRig);

    this._buildAmbientFall();

    this.clock = new THREE.Clock();
    this.accum = 0;
    this.fixedDt = 1 / 60;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.statsEl = document.getElementById('stats');

    window.addEventListener('resize', () => this._onResize());
    this._raf = this._raf.bind(this);
  }

  // Ambient petal fall (LEVELS_SPEC set piece 7) — cheap Points cloud.
  _buildAmbientFall() {
    const count = 400;
    const positions = new Float32Array(count * 3);
    this._fallY = new Float32Array(count);
    this._fallSpeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 30;
      positions[i * 3 + 1] = Math.random() * 18;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 70;
      this._fallSpeed[i] = 0.4 + Math.random() * 0.8;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffd9ec, size: 0.18, transparent: true, opacity: 0.85 });
    this.petals = new THREE.Points(geo, mat);
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
  }

  _updateAmbientFall(dt) {
    const pos = this.petals.geometry.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length / 3; i++) {
      arr[i * 3 + 1] -= this._fallSpeed[i] * dt;
      arr[i * 3] += Math.sin(performance.now() * 0.0005 + i) * dt * 0.3;
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 18;
        arr[i * 3] = (Math.random() - 0.5) * 30;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 70;
      }
    }
    pos.needsUpdate = true;
  }

  start() {
    document.getElementById('boot')?.classList.add('hidden');
    this.clock.start();
    requestAnimationFrame(this._raf);
  }

  _raf() {
    requestAnimationFrame(this._raf);
    const frameDt = Math.min(this.clock.getDelta(), 0.1); // clamp big stalls

    // Camera mode switching (edge-triggered).
    if (this.input.wasPressed('Digit1')) this.cameraRig.setMode(CAMERA.FP);
    if (this.input.wasPressed('Digit2')) this.cameraRig.setMode(CAMERA.TP);
    if (this.input.wasPressed('Digit3')) this.cameraRig.setMode(CAMERA.TOP);

    // Mouse-look (apply accumulated delta once per frame).
    const md = this.input.consumeMouseDelta();
    if (md.x || md.y) this.cameraRig.applyMouse(md.x, md.y);

    // Fixed-step simulation for stable physics/animation.
    this.accum += frameDt;
    let steps = 0;
    while (this.accum >= this.fixedDt && steps < 5) {
      this._fixedUpdate(this.fixedDt);
      this.accum -= this.fixedDt;
      steps++;
    }

    // Per-frame (variable) updates.
    this.cameraRig.update(frameDt, this.player.position);
    this._updateAmbientFall(frameDt);

    this.renderer.render(this.scene, this.cameraRig.camera);
    this.input.endFrame();
    this._updateStats(frameDt);
  }

  _fixedUpdate(dt) {
    this.player.update(dt, this.input);
  }

  _updateStats(dt) {
    this._fpsAccum += dt; this._fpsFrames++;
    if (this._fpsAccum >= 0.25) {
      this.fps = Math.round(this._fpsFrames / this._fpsAccum);
      this._fpsAccum = 0; this._fpsFrames = 0;
    }
    const p = this.player.position;
    const modeName = { fp: 'First-Person', tp: 'Third-Person', top: 'Top-Down' }[this.cameraRig.mode];
    if (this.statsEl) {
      this.statsEl.textContent =
        `FPS ${this.fps}\n` +
        `CAM ${modeName}\n` +
        `POS ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}\n` +
        `HP  ${this.player.hp}/${this.player.maxHp}`;
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraRig.resize(w / h);
  }
}

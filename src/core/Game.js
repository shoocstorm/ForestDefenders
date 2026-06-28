import * as THREE from 'three';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { PostFX } from './PostFX.js';
import { Arena } from '../world/Arena.js';
import { Player } from '../entities/Player.js';
import { CAMERA } from '../config/Constants.js';
import { Juice } from '../systems/Juice.js';
import { GameManager } from '../systems/GameManager.js';
import { EnemyManager } from '../systems/EnemyManager.js';
import { ProjectilePool } from '../weapons/Projectile.js';
import { VFX } from '../vfx/VFX.js';
import { Loot } from '../vfx/Loot.js';
import { DamageNumbers } from '../ui/DamageNumbers.js';
import { HUD } from '../ui/HUD.js';
import { WorldLabels } from '../ui/WorldLabels.js';
import { Overlays } from '../ui/Overlays.js';
import { WaveManager } from '../systems/WaveManager.js';
import { AnimalManager } from '../systems/AnimalManager.js';
import { updateTime as updateWindTime } from '../materials/CelMaterial.js';

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

    // --- M2 combat systems ---
    this.juice = new Juice();
    this.gameManager = new GameManager();
    this.vfx = new VFX(this.scene);
    this.projectiles = new ProjectilePool(this.scene);
    this.enemies = new EnemyManager(this.scene);
    this.hud = new HUD();
    this.damageNumbers = new DamageNumbers(this.cameraRig.camera);
    this.worldLabels = new WorldLabels(this.cameraRig.camera);
    this.loot = new Loot(this.scene, this.gameManager, this.hud, this.vfx);
    this.animals = new AnimalManager(this.scene);
    this.overlays = new Overlays(() => this.resetLevel());

    // Reused per-frame combat context (avoids per-step allocation).
    this.ctx = {
      player: this.player,
      input: this.input,
      enemies: this.enemies.enemies,
      animals: this.animals.animals,
      colliders: this.arena.colliders,
      standables: this.arena.standables,
      projectiles: this.projectiles,
      vfx: this.vfx,
      loot: this.loot,
      damageNumbers: this.damageNumbers,
      gameManager: this.gameManager,
      juice: this.juice,
      hud: this.hud,
      cameraRig: this.cameraRig,
      onPlayerDeath: () => this._onDefeat(),
    };

    // Cinematic-cel post pipeline (selective bloom + GTAO + ACES output).
    this.postfx = new PostFX(this.renderer, this.scene, this.cameraRig.camera);

    this.state = 'playing'; // 'playing' | 'victory' | 'defeat'
    this.waves = new WaveManager(this.enemies, this.gameManager, {
      onWaveStart: (n) => this.hud.showBanner(`WAVE ${n}`),
      onAllCleared: () => this._onVictory(),
    });

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
    const realDt = Math.min(this.clock.getDelta(), 0.1); // clamp big stalls

    // Juice time-scale (hit-stop / impact-freeze) advances on real time; the
    // simulation delta is scaled by it so combat hangs briefly on impacts.
    this.juice.update(realDt);
    const simDt = realDt * this.juice.timeScale;

    // Camera mode switching (edge-triggered).
    if (this.input.wasPressed('Digit1')) this.cameraRig.setMode(CAMERA.FP);
    if (this.input.wasPressed('Digit2')) this.cameraRig.setMode(CAMERA.TP);
    if (this.input.wasPressed('Digit3')) this.cameraRig.setMode(CAMERA.TOP);

    // Mouse-look (apply accumulated delta once per frame — never time-scaled).
    const md = this.input.consumeMouseDelta();
    if (md.x || md.y) this.cameraRig.applyMouse(md.x, md.y);

    // Fixed-step simulation (scaled accumulator). Frozen while an overlay is up.
    if (this.state === 'playing') {
      this.accum += simDt;
      let steps = 0;
      while (this.accum >= this.fixedDt && steps < 5) {
        this._fixedUpdate(this.fixedDt);
        this.accum -= this.fixedDt;
        steps++;
      }
      // Per-frame (variable) combat VFX/UI — scaled so they freeze with the sim.
      this.vfx.update(simDt);
      this.loot.update(simDt, this.player.position);
      this.damageNumbers.update(simDt);
    }

    // Camera + ambience + projected labels (run even when paused so UI tracks).
    this.cameraRig.update(simDt, this.player.position);
    this.arena.update(realDt);
    this._updateAmbientFall(realDt);
    this.worldLabels.update(this.animals.animals, this.animals.nearestCaged);
    // Advance the cel-shader wind uTime for all foliage/tree materials.
    updateWindTime(performance.now() * 0.001);

    // Quality toggle (Slash) for the post stack.
    if (this.input.wasPressed('Slash')) this.postfx.toggleQuality();

    this._updateHud();
    this.postfx.render();
    this.input.endFrame();
    this._updateStats(realDt);
  }

  _fixedUpdate(dt) {
    this.waves.update(dt);
    this.player.update(dt, this.input, this.ctx);
    this.animals.update(dt, this.ctx);   // before enemies so targeting is current
    this.enemies.update(dt, this.ctx);
    this.projectiles.update(dt, this.ctx);
  }

  _onVictory() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    document.exitPointerLock?.();
    const saved = this.animals.savedCount;
    const r = this.gameManager.computeRank(saved);
    this.overlays.showVictory({
      rank: r.rank, stars: r.stars, bonus: r.bonus, saved, total: this.animals.total,
      kills: this.gameManager.kills, gold: this.gameManager.gold,
    });
  }

  _onDefeat() {
    if (this.state !== 'playing') return;
    this.state = 'defeat';
    document.exitPointerLock?.();
    this.overlays.showDefeat({
      wave: this.waves.waveNumber, total: this.waves.total, kills: this.gameManager.kills,
    });
  }

  // Rebuild the level in place (Retry / Play Again) — no full page reload.
  resetLevel() {
    for (const e of this.enemies.enemies) this.scene.remove(e.group);
    this.enemies.enemies.length = 0;
    for (const a of this.animals.animals) a.dispose();
    this.animals = new AnimalManager(this.scene);
    this.ctx.animals = this.animals.animals;

    this.gameManager.reset();
    this.player.hp = this.player.maxHp;
    this.player.dead = false;
    this.player.position.copy(this.player._spawn);
    this.player.velocity.set(0, 0, 0);

    this.waves = new WaveManager(this.enemies, this.gameManager, {
      onWaveStart: (n) => this.hud.showBanner(`WAVE ${n}`),
      onAllCleared: () => this._onVictory(),
    });
    this.accum = 0;
    this.state = 'playing';
  }

  // Project the player's world-space aim point to screen so the reticle sits on the
  // real aim (or the locked enemy), instead of pinned over the hero in third-person.
  _updateCrosshair() {
    const cam = this.cameraRig.camera;
    cam.updateMatrixWorld();
    const ndc = (this._ndc ||= new THREE.Vector3()).copy(this.player.aimPoint).project(cam);
    const onScreen = ndc.z < 1 && Math.abs(ndc.x) <= 1 && Math.abs(ndc.y) <= 1;
    const x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
    this.hud.setCrosshair(x, y, this.player.hasLock, onScreen);
  }

  _updateHud() {
    this._updateCrosshair();
    this.hud.update({
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      gold: this.gameManager.gold,
      enemies: this.enemies.aliveCount,
      kills: this.gameManager.kills,
      weapon: this.player.weapon.name,
      ammo: this.player.weapon.ammoText(),
      element: this.player.weapon.element,
      shield: this.gameManager.shield,
      buffs: this.gameManager.buffs,
      wave: this.waves.waveNumber || 1,
      totalWaves: this.waves.total,
      saved: this.animals.savedCount,
    });
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
    this.postfx?.setSize(w, h);
  }
}

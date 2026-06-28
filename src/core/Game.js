import * as THREE from 'three';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { PostFX } from './PostFX.js';
import { Arena } from '../world/Arena.js';
import { Player } from '../entities/Player.js';
import { CAMERA, AIM_ASSIST, BUFFS, ECONOMY } from '../config/Constants.js';
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
import { SaveManager } from '../systems/SaveManager.js';
import { Achievements } from '../systems/Achievements.js';
import { PlantManager } from '../systems/PlantManager.js';
import { Toasts } from '../ui/Toasts.js';
import { Shop } from '../ui/Shop.js';
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

    // --- M5 meta-progression: load the save and wire achievements before the
    // player is built, so weapon unlocks + derived stats apply from frame one. ---
    this.save = new SaveManager();
    this.juice = new Juice();
    this.gameManager = new GameManager();
    this.gameManager.loadSave(this.save.load());
    this.toasts = new Toasts();
    this.achievements = new Achievements((a) => this.toasts.achievement(a));
    this.gameManager.achievements = this.achievements;

    this.player = new Player(this.scene, this.cameraRig, this.gameManager.unlockedWeapons);
    this.gameManager.applyDerived(this.player, { fullHeal: true });
    this.plants = new PlantManager(this.scene);

    // --- M2 combat systems ---
    this.vfx = new VFX(this.scene);
    this.projectiles = new ProjectilePool(this.scene);
    this.enemies = new EnemyManager(this.scene);
    this.hud = new HUD();
    // Build the weapon slot strip once from the static roster.
    this.hud.initWeapons(this.player.weapons.weapons.map((w) => ({ name: w.name, element: w.element })));
    this.damageNumbers = new DamageNumbers(this.cameraRig.camera);
    this.worldLabels = new WorldLabels(this.cameraRig.camera);
    this.loot = new Loot(this.scene, this.gameManager, this.hud, this.vfx);
    this.animals = new AnimalManager(this.scene);
    this.overlays = new Overlays(() => this.resetLevel(), () => this.shop.open());
    this.shop = new Shop({
      gameManager: this.gameManager, player: this.player, toasts: this.toasts,
      onPurchase: () => this._persist(),
    });

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
      onEnemyDied: (e) => this.gameManager.registerEnemyDefeated(e),
      onMultiKill: (n) => this._onMultiKill(n),
      onAnimalRescued: (type) => this._onAnimalRescued(type),
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

    // Shop hotkey (P) — opens "Old Owl's Outfitters" mid-run; freezes the sim.
    if (this.input.wasPressed('KeyP')) this._toggleShop();

    // Mouse-look (apply accumulated delta once per frame — never time-scaled).
    const md = this.input.consumeMouseDelta();
    if (md.x || md.y) this.cameraRig.applyMouse(md.x, md.y);

    // Fixed-step simulation (scaled accumulator). Frozen while an overlay/shop is up.
    if (this.state === 'playing' && !this.shop.isOpen) {
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
    this.gameManager.updateTimers(dt); // timed buffs (Tail Guard countdown)
    this.waves.update(dt);
    this.player.update(dt, this.input, this.ctx);
    this.animals.update(dt, this.ctx);   // before enemies so targeting is current
    this.enemies.update(dt, this.ctx);
    this.projectiles.update(dt, this.ctx);
    this.plants.update(dt, this.ctx);
  }

  _onVictory() {
    if (this.state !== 'playing') return;
    this.state = 'victory';
    document.exitPointerLock?.();
    const gm = this.gameManager;
    const saved = this.animals.savedCount;
    gm.addGold(ECONOMY.LEVEL_CLEAR_GOLD);       // base clear reward
    const r = gm.computeRank(saved);            // + rescue bonus gold
    // Level-up if cleared flawlessly (all animals rescued + HP > 50%).
    const allRescued = this.animals.freedCount >= this.animals.total;
    const leveledUp = gm.tryLevelUp(this.player, { allRescued });
    if (leveledUp) this.toasts.levelUp(gm.playerLevel);
    gm.registerLevelCleared(gm.level);
    this._persist();
    this.overlays.showVictory({
      rank: r.rank, stars: r.stars, bonus: r.bonus, saved, total: this.animals.total,
      kills: gm.kills, gold: gm.gold, leveledUp, playerLevel: gm.playerLevel,
    });
  }

  // Open/close the shop mid-run (P). Only during active play; releases the mouse.
  _toggleShop() {
    if (this.shop.isOpen) { this.shop.close(); return; }
    if (this.state !== 'playing') return;
    document.exitPointerLock?.();
    this.shop.open();
  }

  // 3+ kills in one shot → unlock the Scattergun (once) + Combo King progress.
  _onMultiKill(n) {
    this.gameManager.registerMultiKill();
    if (this.gameManager.unlockWeapon('SHOTGUN')) {
      this.toasts.weapon('Scattergun');
      this._persist();
    }
  }

  // Rescue-driven weapon unlocks (ECONOMY_SHOP_SPEC §3) + rescue achievements.
  _onAnimalRescued(type) {
    const gm = this.gameManager;
    gm.registerAnimalRescued();
    const unlocked = [];
    if (gm.unlockWeapon('MACHINE')) unlocked.push('Machine Gun');         // cage reward L1
    if (type === 'BIRD' && gm.unlockWeapon('TOROID')) unlocked.push('Toroid Cannon');
    if (this.animals.freedCount >= this.animals.total && gm.unlockWeapon('FIRE_BULLET')) {
      unlocked.push('Fire Bullet');                                       // all animals rescued
    }
    for (const name of unlocked) this.toasts.weapon(name);
    if (unlocked.length) this._persist();
  }

  // Write meta-progression to the save (level win, purchase, unlock).
  _persist() {
    this.gameManager.currentWeapon = this.player.weapons.index;
    this.save.save(this.gameManager.toSave());
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
  // Meta-progression (gold, level, upgrades, unlocks, achievements) survives; only
  // per-run state (HP, buffs, plants, double-jump) is wiped (ECONOMY_SHOP_SPEC §6.1).
  resetLevel() {
    if (this.shop.isOpen) this.shop.close();
    for (const e of this.enemies.enemies) this.scene.remove(e.group);
    this.enemies.enemies.length = 0;
    for (const a of this.animals.animals) a.dispose();
    this.animals = new AnimalManager(this.scene);
    this.ctx.animals = this.animals.animals;
    this.plants.dispose();
    this.plants = new PlantManager(this.scene);

    this.gameManager.resetRun();
    this.gameManager.applyDerived(this.player, { fullHeal: true });
    this.player.hasDoubleJump = false;
    this.player.jumpsLeft = 1;
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
    const p = this.player;
    this.hud.update({
      hp: p.hp,
      maxHp: p.maxHp,
      shield: this.gameManager.shield,
      maxShield: BUFFS.SHIELD_POWER,
      gold: this.gameManager.gold,
      kills: this.gameManager.kills,
      enemies: this.enemies.aliveCount,
      wave: this.waves.waveNumber || 1,
      totalWaves: this.waves.total,
      weapon: p.weapon.name,
      element: p.weapon.element,
      ammo: p.weapon.ammoInfo(),
      weaponIndex: p.weapons.index,
      unlocked: p.weapons.weapons.map((w) => this.gameManager.isWeaponUnlocked(w.def.id)),
      buffs: this.gameManager.buffs,
      timedBuffs: this.gameManager.timedBuffs,
      fireRounds: this.gameManager.fireRounds,
      hitShield: this.gameManager.hitShield,
      saved: this.animals.savedCount,
      totalAnimals: this.animals.total,
      freePrompt: !!this.animals.nearestCaged,
      aimAssist: AIM_ASSIST.ENABLED,
      reveal: this.gameManager.reveal,
      radar: {
        px: p.position.x, pz: p.position.z, facing: p.facing,
        enemies: this.enemies.enemies, animals: this.animals.animals,
      },
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

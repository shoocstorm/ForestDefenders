import * as THREE from 'three';
import { Input } from './Input.js';
import { CameraRig } from './CameraRig.js';
import { TouchControls } from './TouchControls.js';
import { PostFX } from './PostFX.js';
import { Arena } from '../world/Arena.js';
import { Player } from '../entities/Player.js';
import { CAMERA, AIM_ASSIST, BUFFS, ECONOMY, CAMPAIGN, BIOMES, GRAPHICS } from '../config/Constants.js';
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
import { Director } from '../systems/Director.js';
import { AnimalManager } from '../systems/AnimalManager.js';
import { SaveManager } from '../systems/SaveManager.js';
import { Achievements } from '../systems/Achievements.js';
import { PlantManager } from '../systems/PlantManager.js';
import { Toasts } from '../ui/Toasts.js';
import { Shop } from '../ui/Shop.js';
import { Gallery } from '../ui/Gallery.js';
import { Settings } from '../ui/Settings.js';
import { AchievementViewer } from '../ui/AchievementViewer.js';
import { Backpack } from '../ui/Backpack.js';
import { PauseMenu } from '../ui/PauseMenu.js';
import { AudioSystem } from '../audio/AudioSystem.js';
import { SFX } from '../audio/SFX.js';
import { Music } from '../audio/Music.js';
import { Ambient } from '../audio/Ambient.js';
import { updateTime as updateWindTime } from '../materials/CelMaterial.js';

// Top-level game: owns renderer, scene, the fixed-step update loop, and the
// systems registry. M6 adds the procedural audio engine, multi-biome campaign
// (L1→L2→L3), and the weapon gallery.
export class Game {
  constructor(container) {
    this.container = container;

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.7; // [from 1.5] 1.5 blew out highlights and
    // washed the cel shading flat; 0.7 restores contrast and mood.
    // Per-biome sun/hemi/fill carry the rest so foliage still reads under ACES.
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.input = new Input(this.renderer.domElement);
    this.cameraRig = new CameraRig(window.innerWidth / window.innerHeight);

    // --- M6 procedural audio: 3-bus engine (SFX/Music/Ambient). Created now ---
    // but the AudioContext resumes on the first user gesture (browser autoplay).
    this.audio = new AudioSystem();
    this.audio.setSFX(new SFX());
    this.audio.setMusic(new Music());
    this.audio.setAmbient(new Ambient());

    // --- M5 meta-progression: load the save before the player is built. ---
    this.save = new SaveManager();
    this.juice = new Juice();
    this.gameManager = new GameManager();
    this.gameManager.loadSave(this.save.load());
    this.audio.loadSettings(this.gameManager.toSave()); // restore volume settings
    this.toasts = new Toasts();
    this.achievements = new Achievements((a) => { this.toasts.achievement(a); this.audio.achievement(); });
    this.gameManager.achievements = this.achievements;

    // --- Campaign level: start from the saved progress (gm.level), clamped. ---
    this.campaignLevel = Math.min(this.gameManager.level, CAMPAIGN.length - 1);

    // --- Build the world for the current campaign level. ---
    this.arena = new Arena(this.scene, CAMPAIGN[this.campaignLevel].biome);

    this.player = new Player(this.scene, this.cameraRig, this.gameManager.unlockedWeapons);
    this.gameManager.applyDerived(this.player, { fullHeal: true });
    this.plants = new PlantManager(this.scene);

    // --- M2 combat systems ---
    this.vfx = new VFX(this.scene);
    this.projectiles = new ProjectilePool(this.scene);
    this.enemies = new EnemyManager(this.scene);
    this.director = new Director();
    this.hud = new HUD();
    this.hud.initWeapons(this.player.weapons.weapons.map((w) => ({ name: w.name, element: w.element })));
    // On-screen controls for phones/tablets (null on non-touch devices).
    this.touch = TouchControls.maybeCreate(this.input, {
      toggleShop: () => this._toggleShop(),
      toggleGallery: () => this._toggleGallery(),
      toggleSettings: () => this._toggleSettings(),
      toggleAchievements: () => this._toggleAchievements(),
      toggleBackpack: () => this._toggleBackpack(),
      togglePause: () => this._togglePause(),
    });
    this.damageNumbers = new DamageNumbers(this.cameraRig.camera);
    this.worldLabels = new WorldLabels(this.cameraRig.camera);
    this.loot = new Loot(this.scene, this.gameManager, this.hud, this.vfx, this.audio);
    this.animals = new AnimalManager(this.scene);
    this.gallery = new Gallery(this.player.weapons.weapons, this.gameManager);
    this.overlays = new Overlays(
      () => this.loadLevel(this.campaignLevel),     // retry / play-again → same level
      () => this.shop.open(),                        // visit shop
      () => this._advanceCampaign(),                 // continue → next level
    );
    this.shop = new Shop({
      gameManager: this.gameManager, player: this.player, toasts: this.toasts,
      audio: this.audio,
      onPurchase: () => this._persist(),
    });

    // New UI screens
    this.settings = new Settings({
      audioSystem: this.audio,
      gameManager: this.gameManager,
      onGfxChange: (preset) => this.setGraphics(preset),
      onGTAOChange: (on) => this.postfx?.setGTAOEnabled(on),
      onClose: () => this._persist(),
    });

    this.achievementViewer = new AchievementViewer({
      gameManager: this.gameManager,
      onClose: () => {},
    });

    this.backpack = new Backpack({
      gameManager: this.gameManager,
      player: this.player,
      onClose: () => {},
    });

    this.pauseMenu = new PauseMenu({
      gameManager: this.gameManager,
      waves: this.waves,
      onResume: () => {
        this.state = 'playing';
        this.audio.ui('click');
      },
      onShop: () => { this.pauseMenu.close(); this.shop.open(); },
      onGallery: () => { this.pauseMenu.close(); this.gallery.open(); },
      onSettings: () => { this.pauseMenu.close(); this.settings.open(); },
      onAchievements: () => { this.pauseMenu.close(); this.achievementViewer.open(); },
      onBackpack: () => { this.pauseMenu.close(); this.backpack.open(); },
      onMainMenu: () => this._returnToLanding(),
      onQuit: () => window.location.reload(), // Simple quit for web
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
      director: this.director,
      juice: this.juice,
      hud: this.hud,
      cameraRig: this.cameraRig,
      audio: this.audio,
      onPlayerDeath: () => this._onDefeat(),
      onEnemyDied: (e) => { this.gameManager.registerEnemyDefeated(e); this.audio.death(e.element); },
      onMultiKill: (n) => this._onMultiKill(n),
      onAnimalRescued: (type) => this._onAnimalRescued(type),
    };

    // Cinematic-cel post pipeline (selective bloom + GTAO + ACES output).
    this.postfx = new PostFX(this.renderer, this.scene, this.cameraRig.camera);
    // Apply the player's graphics preset (Settings → Graphics). Defaults to
    // Performance on touch devices — phones can't afford the full post stack.
    this.setGraphics(this._initialGraphicsPreset());
    // Independent GTAO override (defaults on; users can force it off for FPS).
    if (this.gameManager.settings.gtao === false) this.postfx.setGTAOEnabled(false);

    this.state = 'playing'; // 'playing' | 'victory' | 'defeat'
    this.waves = new WaveManager(this.enemies, this.gameManager, {
      director: this.director,
      onWaveStart: (n) => { this.hud.showBanner(`WAVE ${n}`); this.audio.ui('click'); this.director.noteWaveStart(); },
      onWaveCleared: () => this.director.noteWaveCleared(),
      onAllCleared: () => this._onVictory(),
      waves: CAMPAIGN[this.campaignLevel].waves(),
      level: this.campaignLevel,
    });

    this._buildAmbientFall(CAMPAIGN[this.campaignLevel].biome);

    // --- Resume audio on the first user gesture (browser autoplay policy). ---
    this._audioStarted = false;
    this._startAudio = () => {
      if (this._audioStarted) return;
      this._audioStarted = true;
      this.audio.resume();
      this.audio.startMusic(CAMPAIGN[this.campaignLevel].biome);
      this.audio.startAmbient(CAMPAIGN[this.campaignLevel].biome);
    };
    window.addEventListener('pointerdown', this._startAudio, { once: true });
    window.addEventListener('keydown', this._startAudio, { once: true });

    this.clock = new THREE.Clock();
    this.accum = 0;
    this.fixedDt = 1 / 60;
    this.fps = 0;
    this._fpsAccum = 0;
    this._fpsFrames = 0;
    this.statsEl = document.getElementById('stats');

    this._onResizeRef = () => this._onResize();
    window.addEventListener('resize', this._onResizeRef);
    this._raf = this._raf.bind(this);
    this._rafHandle = 0;
  }

  // Ambient particle fall (LEVELS_SPEC set piece 7) — biome-themed: petals (L1),
  // glowing ash cinders (L2), glowing leaves (L3). Cheap Points cloud.
  _buildAmbientFall(biomeKey) {
    if (this.petals) { this.scene.remove(this.petals); this.petals.geometry.dispose(); this.petals.material.dispose(); }
    const af = (BIOMES[biomeKey] || BIOMES.L1).ambientFall;
    const count = 500; // More particles for better coverage
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3); // Per-particle colors
    this._fallY = new Float32Array(count);
    this._fallSpeed = new Float32Array(count);
    this._fallDrift = new Float32Array(count); // Horizontal drift
    this._fallPhase = new Float32Array(count); // For oscillation
    this._fallSize = new Float32Array(count); // Individual sizes

    const baseColor = new THREE.Color(af.color);

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 35;
      positions[i * 3 + 1] = Math.random() * 20;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 75;
      this._fallSpeed[i] = 0.5 + Math.random() * 0.7;
      this._fallDrift[i] = (Math.random() - 0.5) * 2;
      this._fallPhase[i] = Math.random() * Math.PI * 2;
      this._fallSize[i] = 0.6 + Math.random() * 0.8; // Size multiplier

      // Varied colors per particle
      const variedColor = baseColor.clone();
      const hueShift = (Math.random() - 0.5) * 0.15;
      const satShift = (Math.random() - 0.5) * 0.2;
      variedColor.offsetHSL(hueShift, satShift, (Math.random() - 0.5) * 0.2);
      colors[i * 3] = variedColor.r;
      colors[i * 3 + 1] = variedColor.g;
      colors[i * 3 + 2] = variedColor.b;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: af.size * 0.6, // Smaller base size
      transparent: true,
      opacity: af.opacity,
      vertexColors: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.petals = new THREE.Points(geo, mat);
    this.petals.frustumCulled = false;
    this.scene.add(this.petals);
  }

  _updateAmbientFall(dt) {
    if (!this.petals) return;
    const pos = this.petals.geometry.attributes.position;
    const arr = pos.array;
    const time = performance.now() * 0.001;

    for (let i = 0; i < arr.length / 3; i++) {
      // Falling with drift
      arr[i * 3 + 1] -= this._fallSpeed[i] * dt;

      // Gentle horizontal drift with figure-8 pattern
      const phase = this._fallPhase[i];
      arr[i * 3] += (Math.sin(time * 0.5 + phase) * 0.5 + this._fallDrift[i]) * dt;
      arr[i * 3 + 2] += Math.cos(time * 0.4 + phase * 0.7) * dt * 0.4;

      // Swaying motion
      arr[i * 3] += Math.sin(time * 2 + phase) * dt * 0.2;

      // Reset when below ground
      if (arr[i * 3 + 1] < 0) {
        arr[i * 3 + 1] = 20;
        arr[i * 3] = (Math.random() - 0.5) * 35;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 75;
      }
    }
    pos.needsUpdate = true;

    // Subtle pulsing of opacity
    this.petals.material.opacity = 0.7 + Math.sin(time * 0.8) * 0.1;
  }

  start() {
    document.getElementById('boot')?.classList.add('hidden');
    this.clock.start();
    this._rafHandle = requestAnimationFrame(this._raf);
  }

  _raf() {
    this._rafHandle = requestAnimationFrame(this._raf);
    const realDt = Math.min(this.clock.getDelta(), 0.1);

    this.juice.update(realDt);
    const simDt = realDt * this.juice.timeScale;

    // Camera mode switching — dedicated C key cycles FP → TP → TOP.
    if (this.input.wasPressed('KeyC')) this.cameraRig.cycleMode();

    // ESC for pause menu
    if (this.input.wasPressed('Escape')) this._togglePause();
    // Shop hotkey (P) — opens mid-run; freezes the sim.
    if (this.input.wasPressed('KeyP')) this._toggleShop();
    // Gallery hotkey (G) — weapon model viewer.
    if (this.input.wasPressed('KeyG')) this._toggleGallery();
    // Settings hotkey (O) — options screen
    if (this.input.wasPressed('KeyO')) this._toggleSettings();
    // Achievements hotkey (H) — honors/awards
    if (this.input.wasPressed('KeyH')) this._toggleAchievements();
    // Backpack hotkey (I) — inventory
    if (this.input.wasPressed('KeyI')) this._toggleBackpack();

    // Mouse-look (never time-scaled).
    const md = this.input.consumeMouseDelta();
    if (md.x || md.y) this.cameraRig.applyMouse(md.x, md.y);

    // Fixed-step simulation (frozen while an overlay/shop/gallery/pause/settings/achievements/backpack is up).
    const simActive = this.state === 'playing' &&
        !this.shop.isOpen &&
        !this.gallery.isOpen &&
        !this.pauseMenu.isOpen &&
        !this.settings.isOpen &&
        !this.achievementViewer.isOpen &&
        !this.backpack.isOpen;
    // Did a fixed step consume sim-edge input this frame? When the sim is paused,
    // treat edges as consumed so carried-over presses don't fire on resume.
    let simStepped = !simActive;
    if (simActive) {
      this.accum += simDt;
      let steps = 0;
      while (this.accum >= this.fixedDt && steps < 5) {
        this._fixedUpdate(this.fixedDt);
        this.accum -= this.fixedDt;
        steps++;
      }
      simStepped = steps > 0;
      this.vfx.update(simDt);
      this.loot.update(simDt, this.player.position);
      this.damageNumbers.update(simDt);
    }
    this._simStepped = simStepped;

    // Camera + ambience + audio (run even when paused so UI/music track).
    this.cameraRig.update(simDt, this.player.position);
    this.arena.update(realDt);
    this._updateAmbientFall(realDt);
    this.worldLabels.update(this.animals.animals, this.animals.nearestCaged);
    updateWindTime(performance.now() * 0.001);
    this.audio.update(realDt);

    // Quality toggle (Slash).
    if (this.input.wasPressed('Slash')) this.postfx.toggleQuality();

    this._updateHud();
    this._renderFrame(realDt);
    this.input.endFrame(simActive, this._simStepped);
    this._updateStats(realDt);
  }

  // Pause-aware rendering. The gallery draws its own full-screen WebGL canvas over
  // ours, so the heavy bloom+GTAO pipeline is pure waste while it's open — skip it.
  // While the shop/victory/defeat overlay is up the 3D scene is only a barely-moving
  // backdrop, so throttle it to ~30fps. Active play renders every frame.
  _renderFrame(realDt) {
    if (this.gallery.isOpen) return;

    const paused = this.shop.isOpen || this.pauseMenu.isOpen ||
                   this.settings.isOpen || this.achievementViewer.isOpen ||
                   this.backpack.isOpen || this.state !== 'playing';
    if (paused) {
      this._pausedRenderAccum += realDt;
      if (this._pausedRenderAccum < 1 / 30) return;
      this._pausedRenderAccum = 0;
    }
    this.postfx.render();
  }

  _fixedUpdate(dt) {
    this.gameManager.updateTimers(dt);
    this.director.update(dt, this.ctx);
    this.waves.update(dt);
    this.player.update(dt, this.input, this.ctx);
    this.animals.update(dt, this.ctx);
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
    gm.addGold(ECONOMY.LEVEL_CLEAR_GOLD);
    const r = gm.computeRank(saved);
    const allRescued = this.animals.freedCount >= this.animals.total;
    const leveledUp = gm.tryLevelUp(this.player, { allRescued });
    if (leveledUp) { this.toasts.levelUp(gm.playerLevel); this.audio.levelUp(); }
    gm.registerLevelCleared(gm.level);
    this._persist();

    const isFinalLevel = this.campaignLevel >= CAMPAIGN.length - 1;
    this.audio.duck(true);
    this.audio.startMusic('victory');
    this.overlays.showVictory({
      rank: r.rank, stars: r.stars, bonus: r.bonus, saved, total: this.animals.total,
      kills: gm.kills, gold: gm.gold, leveledUp, playerLevel: gm.playerLevel,
      levelNum: this.campaignLevel + 1,
      isFinal: isFinalLevel,
      onNext: () => this._advanceCampaign(),
    });
    // Star chimes (AUDIO_SPEC §2) — timed with the star pop animations.
    for (let i = 0; i < r.stars; i++) setTimeout(() => this.audio.starChime(i), 700 + i * 220);
  }

  // Advance to the next campaign level (L1→L2→L3) after a victory-continue.
  _advanceCampaign() {
    if (this.campaignLevel < CAMPAIGN.length - 1) {
      this.campaignLevel += 1;
      this.gameManager.level = this.campaignLevel; // enemy stat scaling + save position
      this._persist();
      this.loadLevel(this.campaignLevel);
    }
  }

  _toggleShop() {
    if (this.shop.isOpen) { this.shop.close(); return; }
    if (this.state !== 'playing') return;
    document.exitPointerLock?.();
    this.shop.open();
    this.audio.ui('click');
  }

  _toggleGallery() {
    if (this.gallery.isOpen) { this.gallery.close(); return; }
    if (this.state !== 'playing') return;
    document.exitPointerLock?.();
    this.gallery.open();
    this.audio.ui('click');
  }

  _toggleSettings() {
    if (this.settings.isOpen) { this.settings.close(); return; }
    if (this.state !== 'playing') return;
    document.exitPointerLock?.();
    this.settings.open();
    this.audio.ui('click');
  }

  _toggleAchievements() {
    if (this.achievementViewer.isOpen) { this.achievementViewer.close(); return; }
    document.exitPointerLock?.();
    this.achievementViewer.open();
    this.audio.ui('click');
  }

  _toggleBackpack() {
    if (this.backpack.isOpen) { this.backpack.close(); return; }
    if (this.state !== 'playing') return;
    document.exitPointerLock?.();
    this.backpack.open();
    this.audio.ui('click');
  }

  _togglePause() {
    // If any secondary screen is open, close it and return to pause
    if (this.settings.isOpen) {
      this.settings.close();
      this._openPauseMenu();
      return;
    }
    if (this.achievementViewer.isOpen) {
      this.achievementViewer.close();
      this._openPauseMenu();
      return;
    }
    if (this.backpack.isOpen) {
      this.backpack.close();
      this._openPauseMenu();
      return;
    }
    if (this.shop.isOpen) {
      this.shop.close();
      this._openPauseMenu();
      return;
    }
    if (this.gallery.isOpen) {
      this.gallery.close();
      this._openPauseMenu();
      return;
    }

    // If pause is open, close it (resume)
    if (this.pauseMenu.isOpen) {
      this.pauseMenu.close();
      this.state = 'playing';
      this.audio.ui('click');
      return;
    }

    // Otherwise open pause
    if (this.state !== 'playing') return;
    this._openPauseMenu();
  }

  _openPauseMenu() {
    document.exitPointerLock?.();
    this.pauseMenu.open();
    this.audio.ui('click');
  }

  _returnToLanding() {
    // Close pause menu and all screens
    if (this.pauseMenu.isOpen) this.pauseMenu.close();
    if (this.settings.isOpen) this.settings.close();
    if (this.achievementViewer.isOpen) this.achievementViewer.close();
    if (this.backpack.isOpen) this.backpack.close();
    if (this.shop.isOpen) this.shop.close();
    if (this.gallery.isOpen) this.gallery.close();

    // Stop the current level - clear enemies
    for (const e of this.enemies.enemies) this.scene.remove(e.group);
    this.enemies.enemies.length = 0;

    // Clear projectiles and VFX
    this.projectiles.clear();
    this.vfx.clear();

    // Reset player position and state
    this.player.position.copy(this.player._spawn);
    this.player.velocity.set(0, 0, 0);
    this.player.dead = false;
    this.player.hp = this.player.maxHp;

    // Set state to menu so game loop doesn't update
    this.state = 'menu';

    // Show landing screen
    document.getElementById('landing').classList.add('show');

    // Play UI sound
    this.audio.ui('click');
  }

  _onMultiKill(n) {
    this.gameManager.registerMultiKill();
    if (this.gameManager.unlockWeapon('SHOTGUN')) {
      this.toasts.weapon('Scattergun');
      this._persist();
    }
  }

  _onAnimalRescued(type) {
    const gm = this.gameManager;
    gm.registerAnimalRescued();
    this.audio.rescue();
    const unlocked = [];
    if (gm.unlockWeapon('MACHINE')) unlocked.push('Machine Gun');
    if (type === 'BIRD' && gm.unlockWeapon('TOROID')) unlocked.push('Toroid Cannon');
    if (this.animals.freedCount >= this.animals.total && gm.unlockWeapon('FIRE_BULLET')) {
      unlocked.push('Fire Bullet');
    }
    for (const name of unlocked) this.toasts.weapon(name);
    if (unlocked.length) this._persist();
  }

  _persist() {
    this.gameManager.currentWeapon = this.player.weapons.index;
    this.gameManager.settings = { ...this.gameManager.settings, ...this.audio.settings };
    this.save.save(this.gameManager.toSave());
  }

  _onDefeat() {
    if (this.state !== 'playing') return;
    this.state = 'defeat';
    document.exitPointerLock?.();
    this.audio.duck(true);
    this.audio.startMusic('defeat');
    this.overlays.showDefeat({
      wave: this.waves.waveNumber, total: this.waves.total, kills: this.gameManager.kills,
    });
  }

  // Tear down everything for a clean hot-reload (Bun HMR / import.meta.hot.dispose).
  // Stops the render loop, releases the WebGL context, and removes the canvas so a new
  // Game instance can be created without leaking GPU resources or spawning duplicate
  // Chrome GPU processes (see AGENTS.md for the HMR vs. WebGL-context accumulation).
  dispose() {
    console.log('[Game] dispose() — releasing WebGL context and cleaning up scene');
    cancelAnimationFrame(this._rafHandle);
    document.exitPointerLock?.();
    window.removeEventListener('resize', this._onResizeRef);
    window.removeEventListener('pointerdown', this._startAudio);
    window.removeEventListener('keydown', this._startAudio);

    // Release the WebGL context and GPU memory.
    this.renderer.dispose();
    this.renderer.domElement.remove();

    // Clean up all subsystems that hold dynamic scene objects.
    for (const e of this.enemies.enemies) this.scene.remove(e.group);
    this.enemies.enemies.length = 0;
    for (const a of this.animals.animals) a.dispose();
    this.projectiles.clear();
    this.vfx.clear();
    this.loot.clear();
    this.damageNumbers.clear();
    this.plants.dispose();
    this.arena.dispose();
    if (this.petals) { this.scene.remove(this.petals); this.petals.geometry.dispose(); this.petals.material.dispose(); }
  }

  // Full level (re)build — used by retry, play-again, and campaign advance.
  // Disposes the old arena + world objects and rebuilds with the target biome.
  loadLevel(campaignLevel) {
    if (this.shop.isOpen) this.shop.close();
    if (this.gallery.isOpen) this.gallery.close();
    if (this.pauseMenu.isOpen) this.pauseMenu.close();
    if (this.settings.isOpen) this.settings.close();
    if (this.achievementViewer.isOpen) this.achievementViewer.close();
    if (this.backpack.isOpen) this.backpack.close();
    this.campaignLevel = Math.max(0, Math.min(campaignLevel, CAMPAIGN.length - 1));

    // Clear enemies.
    for (const e of this.enemies.enemies) this.scene.remove(e.group);
    this.enemies.enemies.length = 0;
    // Clear animals.
    for (const a of this.animals.animals) a.dispose();
    this.animals = new AnimalManager(this.scene);
    this.ctx.animals = this.animals.animals;
    // Clear plants.
    this.plants.dispose();
    this.plants = new PlantManager(this.scene);

    // CRITICAL: Clear accumulated resources to prevent FPS degradation over time.
    // These systems persist across level loads but their dynamic content accumulates.
    this.projectiles.clear();
    this.vfx.clear();
    this.loot.clear();
    this.damageNumbers.clear();

    // Rebuild arena with the new biome.
    this.arena.dispose();
    this.arena = new Arena(this.scene, CAMPAIGN[this.campaignLevel].biome);
    this.ctx.colliders = this.arena.colliders;
    this.ctx.standables = this.arena.standables;
    // The fresh arena builds its sun at full 4096² — re-apply the active preset's
    // shadow resolution so Performance/Balanced players keep their cheaper map.
    this._applyShadowQuality((GRAPHICS[this.graphics] || GRAPHICS[GRAPHICS.DEFAULT]).shadowMap);

    // Reset run state + reposition the player.
    this.gameManager.resetRun();
    this.gameManager.applyDerived(this.player, { fullHeal: true });
    this.player.hasDoubleJump = false;
    this.player.jumpsLeft = 1;
    this.player.dead = false;
    this.player.position.copy(this.player._spawn);
    this.player.velocity.set(0, 0, 0);

    // New waves for this biome — start the Director at neutral for the fresh level
    // (mutate in place so ctx.director keeps its reference).
    this.director.reset();
    this.waves = new WaveManager(this.enemies, this.gameManager, {
      director: this.director,
      onWaveStart: (n) => { this.hud.showBanner(`WAVE ${n}`); this.audio.ui('click'); this.director.noteWaveStart(); },
      onWaveCleared: () => this.director.noteWaveCleared(),
      onAllCleared: () => this._onVictory(),
      waves: CAMPAIGN[this.campaignLevel].waves(),
      level: this.campaignLevel,
    });

    // Biome-themed ambient particles.
    this._buildAmbientFall(CAMPAIGN[this.campaignLevel].biome);

    // Cross-fade music + ambient to the new biome.
    this.audio.duck(false);
    this.audio.startMusic(CAMPAIGN[this.campaignLevel].biome);
    this.audio.startAmbient(CAMPAIGN[this.campaignLevel].biome);

    this.accum = 0;
    this.state = 'playing';
  }

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
    const biome = CAMPAIGN[this.campaignLevel];
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
      levelName: biome.name,
      levelNum: this.campaignLevel + 1,
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
    const c = this.cameraRig.camera.position;
    const modeName = { fp: 'First-Person', tp: 'Third-Person', top: 'Top-Down' }[this.cameraRig.mode];
    if (this.statsEl) {
      this.statsEl.textContent =
        `FPS ${this.fps} frames ${this._fpsFrames}\n` +
        `CAM ${modeName} pos ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}\n` +
        `POS ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}\n` +
        `HP  ${this.player.hp}/${this.player.maxHp}\n` +
        `DT ${dt.toFixed(4)} scene ${this.scene.children.length}`;
    }
  }

  _onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.cameraRig.resize(w / h);
    this.postfx?.setSize(w, h);
  }

  // First-run graphics preset: honour the saved choice, else default Performance
  // on touch devices (phones/tablets) and High on desktop.
  _initialGraphicsPreset() {
    const saved = this.gameManager.settings.gfx;
    if (saved && GRAPHICS[saved]) return saved;
    const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    return isTouch ? 'PERFORMANCE' : GRAPHICS.DEFAULT;
  }

  // Apply a graphics preset across every dominant cost: render resolution
  // (pixel ratio), the post stack, the GTAO tier and shadow-map resolution.
  setGraphics(name) {
    const cfg = GRAPHICS[name] || GRAPHICS[GRAPHICS.DEFAULT];
    this.graphics = name;
    this.gameManager.settings.gfx = name; // persisted with the save

    // Render resolution — the biggest mobile lever (pixel count ∝ ratio²).
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, cfg.pixelRatio));
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.postfx?.setSize(w, h);

    // Post stack + AO tier.
    this.postfx?.setPostEnabled(cfg.post !== 'none');
    this.postfx?.setAOLevel(cfg.ao);

    // Sun shadow-map resolution.
    this._applyShadowQuality(cfg.shadowMap);
  }

  // Resize the sun's shadow map. Disposing the existing target forces three.js
  // to reallocate at the new resolution on the next frame.
  _applyShadowQuality(size) {
    const sun = this.arena?.sun;
    if (!sun?.shadow) return;
    sun.shadow.mapSize.set(size, size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
}

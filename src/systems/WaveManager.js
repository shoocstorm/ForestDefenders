import * as THREE from 'three';
import { ARENA, CAMPAIGN } from '../config/Constants.js';
import { randRange } from '../util/MathUtils.js';
import { WoodShroom } from '../entities/enemies/WoodShroom.js';
import { FireShroom } from '../entities/enemies/FireShroom.js';
import { EarthShroom } from '../entities/enemies/EarthShroom.js';
import { WaterShroom } from '../entities/enemies/WaterShroom.js';
import { IceShroom } from '../entities/enemies/IceShroom.js';
import { MetalShroom } from '../entities/enemies/MetalShroom.js';

const ENEMY_CLASSES = {
  WOOD_SHROOM: WoodShroom,
  FIRE_SHROOM: FireShroom,
  EARTH_SHROOM: EarthShroom,
  WATER_SHROOM: WaterShroom,
  ICE_SHROOM: IceShroom,
  METAL_SHROOM: MetalShroom,
};

// Drives a 3-wave level script (LEVELS_SPEC §4). A wave's enemies spawn at the
// east-end markers after a delay; the next wave only begins once every enemy of
// the current wave is dead. Fires `onWaveStart` (HUD banner + endangered animal)
// and `onAllCleared` (victory). Now biome-agnostic — any wave config array works.
export class WaveManager {
  constructor(enemyManager, gameManager, { onWaveStart, onWaveCleared, onAllCleared, waves, level = 0, director } = {}) {
    this.enemies = enemyManager;
    this.gm = gameManager;
    this.director = director || null;
    this.onWaveStart = onWaveStart;
    this.onWaveCleared = onWaveCleared;
    this.onAllCleared = onAllCleared;
    this.waves = waves || CAMPAIGN[level || 0].waves();
    this.level = level || 0;
    this.index = -1;
    this.state = 'PREWAVE';
    this.timer = this.waves[0].delay;
    this.done = false;
    this.waveEnemies = [];
  }

  get waveNumber() { return Math.max(0, this.index + 1); }
  get total() { return this.waves.length; }

  update(dt) {
    if (this.done) return;
    if (this.state === 'PREWAVE') {
      this.timer -= dt;
      if (this.timer <= 0) this._startNextWave();
    } else if (this.state === 'ACTIVE') {
      if (!this.waveEnemies.some((e) => !e.dead)) {
        this.onWaveCleared?.(this.waveNumber);
        if (this.index + 1 < this.waves.length) {
          this.state = 'PREWAVE';
          // Director stretches the breather when the player is struggling.
          this.timer = this.waves[this.index + 1].delay * (this.director?.spawnDelayMult ?? 1);
        } else {
          this.done = true;
          this.onAllCleared?.();
        }
      }
    }
  }

  _startNextWave() {
    this.index++;
    const w = this.waves[this.index];
    this.waveEnemies = [];
    let i = 0;
    const mult = this.director?.spawnCountMult ?? 1;
    for (const [type, count] of w.enemies) {
      // Director scales the crowd, but never trivializes a wave: floor at count-1
      // (and always at least 1), cap at the rounded scaled value.
      const scaled = Math.max(1, count - 1, Math.round(count * mult));
      for (let n = 0; n < scaled; n++, i++) {
        const e = this.enemies.spawn(ENEMY_CLASSES[type], this._spawnPos(w.spread, type, i), this.level);
        this.waveEnemies.push(e);
      }
    }
    this.state = 'ACTIVE';
    this.onWaveStart?.(this.waveNumber, w);
  }

  // East-end spawn markers; `spread` scatters wider to avoid clustering. Boss spawns
  // close to its landmark. Always inside the arena, never on the central platform.
  _spawnPos(spread, type, i) {
    if (type === 'EARTH_SHROOM') return new THREE.Vector3(randRange(-3, 3), 0, ARENA.LENGTH / 2 - 7);
    const z = ARENA.LENGTH / 2 - randRange(6, 15);
    const x = (spread ? randRange(-13, 13) : randRange(-9, 9));
    return new THREE.Vector3(x, 0, z);
  }
}

import { WEAPONS, WEAPON_ORDER, UPGRADES, UPGRADE_ORDER } from '../config/Constants.js';
import { icon } from './Icon.js';

// Element colors from HUD.js
const ELEMENT_COLORS = {
  NATURE: '#b6e36a',
  ENERGY: '#49e8ff',
  PHYSICAL: '#ffd27a',
  FIRE: '#ff7a30',
  WOOD: '#8fe04a',
  EARTH: '#e0a83a',
  ICE: '#7ab3ff',
  WATER: '#4ea8ff',
};

function elColor(element) {
  return ELEMENT_COLORS[element] || '#cfe8b0';
}

// Backpack screen (UI_SPEC §4). Comprehensive inventory view showing hero stats,
// weapons, resources, and progress. Read-only display with no clickable actions.

export class Backpack {
  constructor({ gameManager, player, onClose }) {
    this.gm = gameManager;
    this.player = player;
    this.onClose = onClose;
    this.isOpen = false;

    this._buildDom();
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.id = 'fd-backpack';
    this.root.innerHTML = `
      <style>
        #fd-backpack {
          position: fixed;
          inset: 0;
          z-index: 39;
          display: none;
          font-family: "Rajdhani", "Trebuchet MS", system-ui, sans-serif;
          color: #eaf7df;
        }

        #bp-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 40%, #0e1f12e8, #000000f4);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        #bp-panel {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: linear-gradient(160deg, #16281df7, #0b140ef9);
          overflow: hidden;
          box-sizing: border-box;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }

        #bp-head {
          flex: none;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 26px 12px;
          border-bottom: 1px solid #ffffff18;
        }

        #bp-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #ffe08a;
          text-shadow: 0 2px 0 #0008, 0 0 18px #ffb31a55;
        }

        #bp-close {
          pointer-events: auto;
          cursor: pointer;
          font-size: 24px;
          color: #9fdca0;
          transition: transform 0.15s, color 0.15s;
        }

        #bp-close:hover {
          transform: scale(1.15);
          color: #fff;
        }

        #bp-body {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 18px 26px;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .bp-section {
          background: linear-gradient(160deg, #0e1a1288, #070d0a66);
          border: 1px solid #ffffff1a;
          border-radius: 12px;
          padding: 14px 16px;
        }

        .bp-section-title {
          font-size: 12px;
          letter-spacing: 2px;
          font-weight: 700;
          text-transform: uppercase;
          color: #9fdca0;
          margin-bottom: 12px;
        }

        /* Stats Grid */
        .bp-stats-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px;
        }

        .bp-stat {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 10px;
          background: #0a160e66;
          border-radius: 8px;
        }

        .bp-stat-icon {
          font-size: 20px;
          filter: drop-shadow(0 0 6px currentColor);
        }

        .bp-stat-icon.hp { color: #ff6a6a; }
        .bp-stat-icon.dmg { color: #ff9a6a; }
        .bp-stat-icon.spd { color: #49e8ff; }

        .bp-stat-label {
          font-size: 11px;
          font-weight: 600;
          color: #bfe0a8;
        }

        .bp-stat-value {
          font-size: 14px;
          font-weight: 800;
          color: #fff;
          margin-left: auto;
        }

        /* Upgrades */
        .bp-upgrades {
          display: flex;
          gap: 10px;
          margin-top: 10px;
        }

        .bp-upgrade {
          flex: 1;
          padding: 8px 10px;
          background: #0a160e66;
          border-radius: 8px;
          text-align: center;
        }

        .bp-upgrade-name {
          font-size: 10px;
          font-weight: 600;
          color: #bfe0a8;
          letter-spacing: 1px;
        }

        .bp-upgrade-tier {
          font-size: 16px;
          font-weight: 800;
          color: #ffd24a;
        }

        /* Weapons List */
        .bp-weapons-list {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }

        .bp-weapon {
          background: #0a160e66;
          border: 1px solid #ffffff1a;
          border-radius: 10px;
          padding: 10px;
          text-align: center;
          position: relative;
        }

        .bp-weapon.unlocked {
          border-color: #a8e06344;
        }

        .bp-weapon.locked {
          opacity: 0.45;
          filter: grayscale(0.5);
        }

        .bp-wpn-icon {
          font-size: 24px;
          margin-bottom: 6px;
        }

        .bp-wpn-name {
          font-size: 12px;
          font-weight: 700;
          color: #fff;
          margin-bottom: 2px;
        }

        .bp-wpn-element {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 6px;
          border-radius: 4px;
          display: inline-block;
        }

        .bp-wpn-check {
          position: absolute;
          top: 6px;
          right: 6px;
          font-size: 12px;
          color: #a8e063;
        }

        .bp-wpn-lock {
          position: absolute;
          top: 6px;
          right: 6px;
          font-size: 12px;
          color: #666;
        }

        /* Resources Grid */
        .bp-resources-grid {
          display: flex;
          justify-content: center;
          gap: 24px;
        }

        .bp-resource {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }

        .bp-res-icon {
          font-size: 32px;
          filter: drop-shadow(0 0 8px currentColor);
        }

        .bp-res-icon.gold { color: #ffd24a; }
        .bp-res-icon.keys { color: #49e8ff; }

        .bp-res-value {
          font-size: 18px;
          font-weight: 800;
          color: #fff;
        }

        .bp-res-label {
          font-size: 10px;
          font-weight: 600;
          color: #bfe0a8;
          letter-spacing: 1px;
        }

        /* Progress List */
        .bp-progress-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .bp-progress-item {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 6px 10px;
          background: #0a160e66;
          border-radius: 6px;
        }

        .bp-progress-label {
          font-size: 12px;
          font-weight: 600;
          color: #bfe0a8;
        }

        .bp-progress-value {
          font-size: 14px;
          font-weight: 800;
          color: #fff;
        }

        #bp-foot {
          flex: none;
          width: 100%;
          max-width: 900px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 12px 26px 18px;
          border-top: 1px solid #ffffff18;
          display: flex;
          justify-content: flex-end;
        }

        #bp-close-btn {
          pointer-events: auto;
          cursor: pointer;
          padding: 10px 26px;
          font-size: 15px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #10240f;
          border: none;
          border-radius: 24px;
          background: linear-gradient(90deg, #a8e063, #76d35a);
          box-shadow: 0 5px 0 #4a7a2e, 0 7px 14px #0006;
          transition: transform 0.1s, box-shadow 0.1s, filter 0.15s;
        }

        #bp-close-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        #bp-close-btn:active {
          transform: translateY(3px);
          box-shadow: 0 2px 0 #4a7a2e;
        }

        @media (prefers-reduced-motion: reduce) {
          #bp-close, #bp-close-btn {
            transition: none !important;
          }
        }

        /* Short viewports (landscape phones): lay the four sections out as a
           2-column grid instead of one long vertical stack. */
        @media (max-height: 520px) {
          #bp-head, #bp-body, #bp-foot {
            max-width: 1000px;
          }

          #bp-head {
            padding: 10px 20px 8px;
          }

          #bp-title {
            font-size: 20px;
          }

          #bp-body {
            padding: 10px 20px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            align-content: start;
          }

          .bp-section {
            padding: 10px 12px;
          }

          .bp-section-title {
            margin-bottom: 8px;
          }

          #bp-foot {
            padding: 8px 20px 10px;
          }
        }
      </style>
      <div id="bp-bg"></div>
      <div id="bp-panel">
        <div id="bp-head">
          <div id="bp-title">${icon('cage')} Backpack</div>
          <div id="bp-close">${icon('cancel')}</div>
        </div>
        <div id="bp-body">
          <!-- Hero Stats Section -->
          <div class="bp-section" id="bp-stats-section">
            <div class="bp-section-title">HERO STATS</div>
            <div class="bp-stats-grid">
              <div class="bp-stat">
                <span class="bp-stat-icon hp">${icon('hearts')}</span>
                <span class="bp-stat-label">Health</span>
                <span class="bp-stat-value" id="bp-hp">100/100</span>
              </div>
              <div class="bp-stat">
                <span class="bp-stat-icon dmg">${icon('crossed-swords')}</span>
                <span class="bp-stat-label">Damage</span>
                <span class="bp-stat-value" id="bp-dmg">×1.00</span>
              </div>
              <div class="bp-stat">
                <span class="bp-stat-icon spd">${icon('run')}</span>
                <span class="bp-stat-label">Speed</span>
                <span class="bp-stat-value" id="bp-spd">100%</span>
              </div>
              <div class="bp-stat">
                <span class="bp-stat-icon">${icon('upgrade')}</span>
                <span class="bp-stat-label">Level</span>
                <span class="bp-stat-value" id="bp-level">1</span>
              </div>
            </div>
            <div class="bp-upgrades">
              <div class="bp-upgrade">
                <div class="bp-upgrade-name">DMG</div>
                <div class="bp-upgrade-tier" id="bp-dmg-tier">0/5</div>
              </div>
              <div class="bp-upgrade">
                <div class="bp-upgrade-name">HP</div>
                <div class="bp-upgrade-tier" id="bp-hp-tier">0/5</div>
              </div>
              <div class="bp-upgrade">
                <div class="bp-upgrade-name">SPD</div>
                <div class="bp-upgrade-tier" id="bp-spd-tier">0/5</div>
              </div>
            </div>
          </div>

          <!-- Weapons Section -->
          <div class="bp-section" id="bp-weapons-section">
            <div class="bp-section-title">WEAPONS</div>
            <div class="bp-weapons-list" id="bp-weapons"></div>
          </div>

          <!-- Resources Section -->
          <div class="bp-section" id="bp-resources-section">
            <div class="bp-section-title">RESOURCES</div>
            <div class="bp-resources-grid">
              <div class="bp-resource">
                <span class="bp-res-icon gold">${icon('credits-currency')}</span>
                <span class="bp-res-value" id="bp-gold">0</span>
                <span class="bp-res-label">GOLD</span>
              </div>
              <div class="bp-resource">
                <span class="bp-res-icon keys">🔑</span>
                <span class="bp-res-value" id="bp-keys">0</span>
                <span class="bp-res-label">KEYS</span>
              </div>
            </div>
          </div>

          <!-- Progress Section -->
          <div class="bp-section" id="bp-progress-section">
            <div class="bp-section-title">PROGRESS</div>
            <div class="bp-progress-list">
              <div class="bp-progress-item">
                <span class="bp-progress-label">Animals Rescued</span>
                <span class="bp-progress-value" id="bp-rescued">0</span>
              </div>
              <div class="bp-progress-item">
                <span class="bp-progress-label">Enemies Defeated</span>
                <span class="bp-progress-value" id="bp-defeated">0</span>
              </div>
              <div class="bp-progress-item">
                <span class="bp-progress-label">Levels Cleared</span>
                <span class="bp-progress-value" id="bp-cleared">0/3</span>
              </div>
            </div>
          </div>
        </div>
        <div id="bp-foot">
          <button id="bp-close-btn">CLOSE</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    // Cache element references
    this.closeEl = this.root.querySelector('#bp-close');
    this.closeBtn = this.root.querySelector('#bp-close-btn');
    this.hpEl = this.root.querySelector('#bp-hp');
    this.dmgEl = this.root.querySelector('#bp-dmg');
    this.spdEl = this.root.querySelector('#bp-spd');
    this.levelEl = this.root.querySelector('#bp-level');
    this.dmgTierEl = this.root.querySelector('#bp-dmg-tier');
    this.hpTierEl = this.root.querySelector('#bp-hp-tier');
    this.spdTierEl = this.root.querySelector('#bp-spd-tier');
    this.weaponsEl = this.root.querySelector('#bp-weapons');
    this.goldEl = this.root.querySelector('#bp-gold');
    this.keysEl = this.root.querySelector('#bp-keys');
    this.rescuedEl = this.root.querySelector('#bp-rescued');
    this.defeatedEl = this.root.querySelector('#bp-defeated');
    this.clearedEl = this.root.querySelector('#bp-cleared');

    // Event listeners
    this.closeEl.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());
  }

  open() {
    this.isOpen = true;
    this.root.style.display = 'flex';
    this._render();
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
    this.onClose?.();
  }

  _render() {
    const gm = this.gm;
    const player = this.player;

    // Hero stats
    const currentHp = Math.ceil(player.hp);
    const maxHp = gm.maxHp || 100;
    this.hpEl.textContent = `${currentHp}/${maxHp}`;

    const dmgMult = gm.playerDamageMult || 1.0;
    this.dmgEl.textContent = `×${dmgMult.toFixed(2)}`;

    const speedMult = gm.speedMult || 1.0;
    this.spdEl.textContent = `${Math.round(speedMult * 100)}%`;

    this.levelEl.textContent = gm.playerLevel || 1;

    // Upgrade tiers
    const dmgTier = gm.upgrades?.DAMAGE || 0;
    const hpTier = gm.upgrades?.HP || 0;
    const spdTier = gm.upgrades?.SPEED || 0;

    this.dmgTierEl.textContent = `${dmgTier}/5`;
    this.hpTierEl.textContent = `${hpTier}/5`;
    this.spdTierEl.textContent = `${spdTier}/5`;

    // Weapons
    this.weaponsEl.innerHTML = '';
    WEAPON_ORDER.forEach((weaponId) => {
      const weapon = WEAPONS[weaponId];
      if (!weapon) return;

      const unlocked = gm.isWeaponUnlocked(weaponId);

      const wpnEl = document.createElement('div');
      wpnEl.className = `bp-weapon ${unlocked ? 'unlocked' : 'locked'}`;

      const color = elColor(weapon.element);

      wpnEl.innerHTML = `
        ${unlocked ? `<div class="bp-wpn-check">${icon('check-mark')}</div>` : '<div class="bp-wpn-lock">🔒</div>'}
        <div class="bp-wpn-icon" style="filter: drop-shadow(0 0 6px ${color});">${icon('pistol-gun')}</div>
        <div class="bp-wpn-name">${weapon.name}</div>
        <div class="bp-wpn-element" style="color: ${color}; background: ${color}22;">${weapon.element}</div>
      `;

      this.weaponsEl.appendChild(wpnEl);
    });

    // Resources
    this.goldEl.textContent = gm.gold || 0;
    this.keysEl.textContent = gm.goldenKeys || 0;

    // Progress
    this.rescuedEl.textContent = gm.rescuedAnimalsTotal || 0;
    this.defeatedEl.textContent = gm.enemiesDefeatedTotal || 0;

    // Calculate cleared levels from bitmask
    const clearedMask = gm.clearedLevelsMask || 0;
    const clearedCount = (clearedMask & 1 ? 1 : 0) + ((clearedMask >> 1) & 1 ? 1 : 0) + ((clearedMask >> 2) & 1 ? 1 : 0);
    this.clearedEl.textContent = `${clearedCount}/3`;
  }
}

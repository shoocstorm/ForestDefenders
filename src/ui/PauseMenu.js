// Pause Menu screen (UI_SPEC). Central navigation hub during gameplay.
// Shows current run state and provides quick access to all other screens.

export class PauseMenu {
  constructor({
    gameManager,
    waves,
    onResume,
    onShop,
    onGallery,
    onSettings,
    onAchievements,
    onBackpack,
    onMainMenu,
  }) {
    this.gm = gameManager;
    this.waves = waves;
    this.onResume = onResume;
    this.onShop = onShop;
    this.onGallery = onGallery;
    this.onSettings = onSettings;
    this.onAchievements = onAchievements;
    this.onBackpack = onBackpack;
    this.onMainMenu = onMainMenu;
    this.isOpen = false;

    this._buildDom();
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.id = 'fd-pause';
    this.root.innerHTML = `
      <style>
        #fd-pause {
          position: fixed;
          inset: 0;
          z-index: 43;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: "Rajdhani", "Trebuchet MS", system-ui, sans-serif;
          color: #eaf7df;
        }

        #pause-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 50%, #0e1f12d9, #000000f4);
          backdrop-filter: blur(10px);
          -webkit-backdrop-filter: blur(10px);
        }

        #pause-panel {
          position: relative;
          min-width: 320px;
          max-width: 90vw;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 32px 28px 24px;
          background: linear-gradient(160deg, #16281df7, #0b140ef9);
          border: 1px solid #ffffff22;
          border-radius: 20px;
          box-shadow: 0 24px 70px #000b, inset 0 0 50px #00000040;
        }

        #pause-title {
          font-size: 42px;
          font-weight: 800;
          letter-spacing: 2px;
          color: #a8e063;
          text-align: center;
          margin-bottom: 8px;
          text-shadow: 0 2px 0 #0008, 0 0 20px #a8e06388;
        }

        #pause-stats {
          display: flex;
          gap: 20px;
          margin-bottom: 24px;
        }

        .pause-stat {
          font-size: 14px;
          font-weight: 600;
          color: #bfe0a8;
        }

        .pause-stat span {
          color: #ffd24a;
          font-weight: 800;
        }

        #pause-buttons {
          display: flex;
          flex-direction: column;
          gap: 10px;
          width: 100%;
          max-width: 280px;
        }

        .pause-btn {
          pointer-events: auto;
          cursor: pointer;
          padding: 12px 20px;
          font-size: 15px;
          font-weight: 700;
          letter-spacing: 1px;
          border: none;
          border-radius: 12px;
          background: #0a160ecc;
          border: 1px solid #ffffff2a;
          color: #eaf7df;
          transition: all 0.15s;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .pause-btn:hover {
          transform: translateY(-2px);
          background: #0f1e14;
          border-color: #a8e06366;
          box-shadow: 0 4px 12px #0006;
        }

        .pause-btn:active {
          transform: translateY(0);
        }

        .pause-btn.primary {
          background: linear-gradient(90deg, #a8e063, #76d35a);
          color: #10240f;
          border: none;
          font-weight: 800;
        }

        .pause-btn.primary:hover {
          background: linear-gradient(90deg, #b6ec78, #85e069);
          transform: translateY(-2px);
          box-shadow: 0 6px 18px #a8e06355, 0 2px 8px #0006;
          filter: brightness(1.05);
        }

        .pause-btn.warn {
          border-color: #ff9a3a66;
        }

        .pause-btn.warn:hover {
          border-color: #ff9a3a;
          background: #ff9a3a11;
        }

        .pause-btn.danger {
          border-color: #ff6a6a66;
        }

        .pause-btn.danger:hover {
          border-color: #ff6a6a;
          background: #ff6a6a11;
        }

        .pause-btn-icon {
          font-size: 18px;
          flex: none;
        }

        #pause-hint {
          margin-top: 20px;
          font-size: 12px;
          color: #9bbf8a;
          opacity: 0.7;
        }

        @media (prefers-reduced-motion: reduce) {
          .pause-btn {
            transition: none !important;
          }
        }
      </style>
      <div id="pause-bg"></div>
      <div id="pause-panel">
        <div id="pause-title">PAUSED</div>
        <div id="pause-stats">
          <div class="pause-stat">Wave <span id="p-wave">1</span>/3</div>
          <div class="pause-stat">Gold: <span id="p-gold">0</span></div>
        </div>
        <div id="pause-buttons">
          <button class="pause-btn primary" id="p-resume">
            <span class="pause-btn-icon">▶</span>
            RESUME
          </button>
          <button class="pause-btn" id="p-shop">
            <span class="pause-btn-icon">🛒</span>
            SHOP
          </button>
          <button class="pause-btn" id="p-gallery">
            <span class="pause-btn-icon">🖼️</span>
            GALLERY
          </button>
          <button class="pause-btn" id="p-achievements">
            <span class="pause-btn-icon">🏆</span>
            ACHIEVEMENTS
          </button>
          <button class="pause-btn" id="p-settings">
            <span class="pause-btn-icon">⚙️</span>
            SETTINGS
          </button>
          <button class="pause-btn" id="p-backpack">
            <span class="pause-btn-icon">🎒</span>
            BACKPACK
          </button>
          <button class="pause-btn warn" id="p-menu">
            <span class="pause-btn-icon">🏠</span>
            MAIN MENU
          </button>
        </div>
        <div id="pause-hint">Press [ESC] to resume</div>
      </div>`;
    document.body.appendChild(this.root);

    // Cache element references
    this.waveEl = this.root.querySelector('#p-wave');
    this.goldEl = this.root.querySelector('#p-gold');

    // Event listeners
    this.root.querySelector('#p-resume').addEventListener('click', () => this._handleResume());
    this.root.querySelector('#p-shop').addEventListener('click', () => this._handleShop());
    this.root.querySelector('#p-gallery').addEventListener('click', () => this._handleGallery());
    this.root.querySelector('#p-achievements').addEventListener('click', () => this._handleAchievements());
    this.root.querySelector('#p-settings').addEventListener('click', () => this._handleSettings());
    this.root.querySelector('#p-backpack').addEventListener('click', () => this._handleBackpack());
    this.root.querySelector('#p-menu').addEventListener('click', () => this._handleMainMenu());
  }

  open() {
    this.isOpen = true;
    this.root.style.display = 'flex';
    this._updateStats();
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
  }

  _updateStats() {
    if (this.waves) {
      this.waveEl.textContent = this.waves.waveNumber || 1;
    }
    if (this.gm) {
      this.goldEl.textContent = this.gm.gold || 0;
    }
  }

  _handleResume() {
    this.close();
    this.onResume?.();
  }

  _handleShop() {
    this.close();
    this.onShop?.();
  }

  _handleGallery() {
    this.close();
    this.onGallery?.();
  }

  _handleSettings() {
    this.close();
    this.onSettings?.();
  }

  _handleAchievements() {
    this.close();
    this.onAchievements?.();
  }

  _handleBackpack() {
    this.close();
    this.onBackpack?.();
  }

  _handleMainMenu() {
    this.close();
    this.onMainMenu?.();
  }
}

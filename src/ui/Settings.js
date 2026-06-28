// Settings screen (UI_SPEC §3). Allows players to adjust audio volumes and
// display settings. Integrates with AudioSystem for live preview and persists
// via GameManager.settings.

export class Settings {
  constructor({ audioSystem, gameManager, onClose }) {
    this.audio = audioSystem;
    this.gm = gameManager;
    this.onClose = onClose;
    this.isOpen = false;

    // Working copy of settings (committed on save)
    this.settings = { ...audioSystem.settings };

    this._buildDom();
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.id = 'fd-settings';
    this.root.innerHTML = `
      <style>
        #fd-settings {
          position: fixed;
          inset: 0;
          z-index: 42;
          display: none;
          align-items: center;
          justify-content: center;
          font-family: "Rajdhani", "Trebuchet MS", system-ui, sans-serif;
          color: #eaf7df;
        }

        #stg-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 40%, #0e1f12e8, #000000f4);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        #stg-panel {
          position: relative;
          width: min(420px, 90vw);
          max-height: 85vh;
          display: flex;
          flex-direction: column;
          background: linear-gradient(160deg, #16281df7, #0b140ef9);
          border: 1px solid #ffffff22;
          border-radius: 20px;
          box-shadow: 0 24px 70px #000b, inset 0 0 50px #00000040;
          overflow: hidden;
        }

        #stg-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 20px 26px 16px;
          border-bottom: 1px solid #ffffff18;
        }

        #stg-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #ffe08a;
          text-shadow: 0 2px 0 #0008, 0 0 18px #ffb31a55;
        }

        #stg-close {
          pointer-events: auto;
          cursor: pointer;
          font-size: 24px;
          color: #9fdca0;
          transition: transform 0.15s, color 0.15s;
        }

        #stg-close:hover {
          transform: scale(1.15);
          color: #fff;
        }

        #stg-body {
          padding: 20px 26px;
          overflow-y: auto;
          flex: 1;
        }

        .stg-section {
          margin-bottom: 22px;
        }

        .stg-section:last-child {
          margin-bottom: 0;
        }

        .stg-label {
          font-size: 11px;
          letter-spacing: 2.5px;
          font-weight: 700;
          text-transform: uppercase;
          color: #9fdca0;
          opacity: 0.92;
          margin-bottom: 12px;
        }

        .stg-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 12px;
        }

        .stg-row:last-child {
          margin-bottom: 0;
        }

        .stg-row-name {
          font-size: 15px;
          font-weight: 600;
          color: #cfe8b0;
        }

        /* Volume sliders */
        .stg-slider-container {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
          max-width: 220px;
        }

        .stg-slider {
          flex: 1;
          -webkit-appearance: none;
          appearance: none;
          height: 6px;
          border-radius: 3px;
          background: #0a160e;
          outline: none;
          cursor: pointer;
        }

        .stg-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a8e063, #76d35a);
          cursor: pointer;
          box-shadow: 0 2px 8px #0006;
          transition: transform 0.15s;
        }

        .stg-slider::-webkit-slider-thumb:hover {
          transform: scale(1.15);
        }

        .stg-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: linear-gradient(135deg, #a8e063, #76d35a);
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 8px #0006;
          transition: transform 0.15s;
        }

        .stg-slider::-moz-range-thumb:hover {
          transform: scale(1.15);
        }

        .stg-val {
          font-size: 14px;
          font-weight: 700;
          color: #ffd24a;
          min-width: 38px;
          text-align: right;
        }

        /* Toggle buttons */
        .stg-toggle {
          pointer-events: auto;
          cursor: pointer;
          padding: 6px 16px;
          font-size: 13px;
          font-weight: 700;
          letter-spacing: 1px;
          border-radius: 18px;
          background: #0a160ecc;
          border: 1px solid #ffffff2a;
          color: #9bbf8a;
          transition: all 0.15s;
        }

        .stg-toggle.on {
          background: linear-gradient(90deg, #a8e063, #76d35a);
          border-color: #a8e063;
          color: #10240f;
        }

        .stg-toggle:hover {
          filter: brightness(1.15);
        }

        #stg-foot {
          padding: 16px 26px 20px;
          border-top: 1px solid #ffffff18;
          display: flex;
          justify-content: flex-end;
        }

        #stg-save {
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

        #stg-save:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        #stg-save:active {
          transform: translateY(3px);
          box-shadow: 0 2px 0 #4a7a2e;
        }

        @media (prefers-reduced-motion: reduce) {
          #stg-close, .stg-slider::-webkit-slider-thumb,
          .stg-slider::-moz-range-thumb, .stg-toggle, #stg-save {
            animation-duration: 0.01ms !important;
            transition: none !important;
          }
        }
      </style>
      <div id="stg-bg"></div>
      <div id="stg-panel">
        <div id="stg-head">
          <div id="stg-title">⚙ Settings</div>
          <div id="stg-close">✕</div>
        </div>
        <div id="stg-body">
          <div class="stg-section">
            <div class="stg-label">VOLUME</div>
            <div class="stg-row">
              <span class="stg-row-name">Master</span>
              <div class="stg-slider-container">
                <input type="range" class="stg-slider" id="stg-master" min="0" max="100" value="90">
                <span class="stg-val" id="stg-master-val">90%</span>
              </div>
            </div>
            <div class="stg-row">
              <span class="stg-row-name">SFX</span>
              <div class="stg-slider-container">
                <input type="range" class="stg-slider" id="stg-sfx" min="0" max="100" value="90">
                <span class="stg-val" id="stg-sfx-val">90%</span>
              </div>
            </div>
            <div class="stg-row">
              <span class="stg-row-name">Music</span>
              <div class="stg-slider-container">
                <input type="range" class="stg-slider" id="stg-music" min="0" max="100" value="40">
                <span class="stg-val" id="stg-music-val">40%</span>
              </div>
            </div>
            <div class="stg-row">
              <span class="stg-row-name">Ambient</span>
              <div class="stg-slider-container">
                <input type="range" class="stg-slider" id="stg-ambient" min="0" max="100" value="55">
                <span class="stg-val" id="stg-ambient-val">55%</span>
              </div>
            </div>
          </div>
          <div class="stg-section">
            <div class="stg-label">DISPLAY</div>
            <div class="stg-row">
              <span class="stg-row-name">Reduce Motion</span>
              <button class="stg-toggle" id="stg-motion">OFF</button>
            </div>
          </div>
        </div>
        <div id="stg-foot">
          <button id="stg-save">SAVE & CLOSE</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    // Cache element references
    this.closeBtn = this.root.querySelector('#stg-close');
    this.saveBtn = this.root.querySelector('#stg-save');
    this.motionBtn = this.root.querySelector('#stg-motion');

    // Volume sliders
    this.masterSlider = this.root.querySelector('#stg-master');
    this.sfxSlider = this.root.querySelector('#stg-sfx');
    this.musicSlider = this.root.querySelector('#stg-music');
    this.ambientSlider = this.root.querySelector('#stg-ambient');

    // Value displays
    this.masterVal = this.root.querySelector('#stg-master-val');
    this.sfxVal = this.root.querySelector('#stg-sfx-val');
    this.musicVal = this.root.querySelector('#stg-music-val');
    this.ambientVal = this.root.querySelector('#stg-ambient-val');

    // Event listeners
    this.closeBtn.addEventListener('click', () => this.close());
    this.saveBtn.addEventListener('click', () => this._saveAndClose());

    // Volume slider listeners (live preview)
    this.masterSlider.addEventListener('input', (e) => this._updateVolume('master', e.target.value));
    this.sfxSlider.addEventListener('input', (e) => this._updateVolume('sfx', e.target.value));
    this.musicSlider.addEventListener('input', (e) => this._updateVolume('music', e.target.value));
    this.ambientSlider.addEventListener('input', (e) => this._updateVolume('ambient', e.target.value));

    // Motion toggle
    this.motionBtn.addEventListener('click', () => this._toggleMotion());
  }

  open() {
    this.isOpen = true;
    this.root.style.display = 'flex';

    // Reload current settings
    this.settings = { ...this.audio.settings };

    // Update UI to match current settings
    this.masterSlider.value = Math.round(this.settings.master * 100);
    this.masterVal.textContent = this.masterSlider.value + '%';
    this.sfxSlider.value = Math.round(this.settings.sfx * 100);
    this.sfxVal.textContent = this.sfxSlider.value + '%';
    this.musicSlider.value = Math.round(this.settings.music * 100);
    this.musicVal.textContent = this.musicSlider.value + '%';
    this.ambientSlider.value = Math.round(this.settings.ambient * 100);
    this.ambientVal.textContent = this.ambientSlider.value + '%';

    // Check for reduced motion preference
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this._motionOn = prefersReduced;
    this.motionBtn.classList.toggle('on', this._motionOn);
    this.motionBtn.textContent = this._motionOn ? 'ON' : 'OFF';
  }

  close() {
    this.isOpen = false;
    this.root.style.display = 'none';
  }

  _saveAndClose() {
    // Commit settings to both audio system and game manager
    this.audio.setVolumes(this.settings);
    this.gm.settings = { ...this.gm.settings, ...this.settings };

    // Apply reduce motion setting
    if (this._motionOn) {
      document.documentElement.style.setProperty('--motion-duration', '0.01ms');
    } else {
      document.documentElement.style.removeProperty('--motion-duration');
    }

    this.close();
    this.onClose?.();
  }

  _updateVolume(type, value) {
    const normalized = value / 100;
    this.settings[type] = normalized;

    // Update display
    const valEl = this.root.querySelector(`#stg-${type}-val`);
    if (valEl) valEl.textContent = value + '%';

    // Live preview
    this.audio.setVolumes(this.settings);
  }

  _toggleMotion() {
    this._motionOn = !this._motionOn;
    this.motionBtn.classList.toggle('on', this._motionOn);
    this.motionBtn.textContent = this._motionOn ? 'ON' : 'OFF';
  }
}

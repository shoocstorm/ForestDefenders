import { ACHIEVEMENTS } from '../config/Constants.js';

// Achievement Viewer screen (UI_SPEC §5). Displays all achievements with
// progress indicators, unlock status, and category filtering. Named
// AchievementViewer to avoid conflict with src/systems/Achievements.js which
// handles achievement tracking logic.

const CATEGORIES = {
  pest_control: 'combat',
  menagerie: 'collection',
  treasure: 'collection',
  sharpshooter: 'combat',
  sanctuary: 'collection',
  big_spender: 'collection',
  dragons_hoard: 'collection',
  boss_hunter: 'combat',
  combo_king: 'combat',
};

export class AchievementViewer {
  constructor({ gameManager, onClose }) {
    this.gm = gameManager;
    this.onClose = onClose;
    this.isOpen = false;
    this.category = 'all';

    this._buildDom();
  }

  _buildDom() {
    this.root = document.createElement('div');
    this.root.id = 'fd-achievements';
    this.root.innerHTML = `
      <style>
        #fd-achievements {
          position: fixed;
          inset: 0;
          z-index: 41;
          display: none;
          font-family: "Rajdhani", "Trebuchet MS", system-ui, sans-serif;
          color: #eaf7df;
        }

        #ach-bg {
          position: absolute;
          inset: 0;
          background: radial-gradient(circle at 50% 40%, #0e1f12e8, #000000f4);
          backdrop-filter: blur(7px);
          -webkit-backdrop-filter: blur(7px);
        }

        #ach-panel {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          background: linear-gradient(160deg, #16281df7, #0b140ef9);
          overflow: hidden;
          box-sizing: border-box;
          padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
        }

        #ach-head {
          flex: none;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 26px 12px;
          border-bottom: 1px solid #ffffff18;
        }

        #ach-title {
          font-size: 26px;
          font-weight: 800;
          letter-spacing: 1px;
          color: #ffe08a;
          text-shadow: 0 2px 0 #0008, 0 0 18px #ffb31a55;
        }

        #ach-summary {
          font-size: 14px;
          font-weight: 600;
          color: #9fdca0;
          margin-left: 16px;
        }

        #ach-close {
          pointer-events: auto;
          cursor: pointer;
          font-size: 24px;
          color: #9fdca0;
          transition: transform 0.15s, color 0.15s;
        }

        #ach-close:hover {
          transform: scale(1.15);
          color: #fff;
        }

        #ach-categories {
          flex: none;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
          display: flex;
          gap: 8px;
          padding: 12px 26px 0;
        }

        .ach-cat {
          pointer-events: auto;
          cursor: pointer;
          font-size: 13px;
          font-weight: 800;
          letter-spacing: 1.5px;
          padding: 7px 16px;
          border-radius: 10px 10px 0 0;
          background: #0a160e88;
          border: 1px solid #ffffff14;
          border-bottom: none;
          color: #9bbf8a;
          text-transform: uppercase;
          transition: all 0.15s;
        }

        .ach-cat.active {
          background: #13281a;
          color: #fff;
          box-shadow: 0 -2px 14px -4px #a8e06388;
        }

        .ach-cat:hover {
          background: #0f1e14;
        }

        #ach-grid {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
          padding: 18px 26px;
          overflow-y: auto;
        }

        .ach-card {
          pointer-events: auto;
          cursor: default;
          background: linear-gradient(160deg, #11201688, #0a130d99);
          border: 1px solid #ffffff1e;
          border-radius: 14px;
          padding: 14px 16px;
          position: relative;
          transition: transform 0.12s, box-shadow 0.12s;
        }

        .ach-card.unlocked {
          border-color: #a8e06344;
          box-shadow: 0 0 18px -6px #a8e06322;
        }

        .ach-card.locked {
          opacity: 0.5;
          filter: grayscale(0.3);
        }

        .ach-icon {
          width: 48px;
          height: 48px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          margin-bottom: 10px;
          box-shadow: 0 4px 12px #0006;
        }

        .ach-name {
          font-size: 15px;
          font-weight: 800;
          color: #fff;
          margin-bottom: 4px;
        }

        .ach-desc {
          font-size: 12px;
          color: #bfe0a8;
          line-height: 1.4;
          margin-bottom: 10px;
          min-height: 34px;
        }

        .ach-progress {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .ach-bar {
          flex: 1;
          height: 6px;
          background: #0a160e;
          border-radius: 3px;
          overflow: hidden;
        }

        .ach-fill {
          height: 100%;
          background: linear-gradient(90deg, #a8e063, #76d35a);
          border-radius: 2px;
          transition: width 0.3s ease;
        }

        .ach-text {
          font-size: 11px;
          font-weight: 700;
          color: #ffd24a;
          white-space: nowrap;
        }

        .ach-check {
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 18px;
          color: #a8e063;
        }

        .ach-lock {
          position: absolute;
          top: 10px;
          right: 10px;
          font-size: 18px;
          color: #666;
        }

        /* Stagger fade-in animation */
        .ach-card {
          opacity: 0;
          transform: translateY(12px);
          animation: achFadeIn 0.3s ease forwards;
        }

        @keyframes achFadeIn {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        #ach-foot {
          flex: none;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
          padding: 12px 26px 18px;
          border-top: 1px solid #ffffff18;
          display: flex;
          justify-content: flex-end;
        }

        #ach-close-btn {
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

        #ach-close-btn:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }

        #ach-close-btn:active {
          transform: translateY(3px);
          box-shadow: 0 2px 0 #4a7a2e;
        }

        @media (prefers-reduced-motion: reduce) {
          .ach-card {
            animation-duration: 0.01ms !important;
          }
        }

        @media (max-height: 480px) {
          #ach-head { padding: 10px 20px 8px; }
          #ach-title { font-size: 20px; }
          #ach-summary { font-size: 12px; margin-left: 10px; }
          #ach-categories { padding: 8px 20px 0; }
          .ach-cat { padding: 5px 12px; font-size: 12px; }
          #ach-grid { padding: 12px 20px; gap: 10px; }
          #ach-foot { padding: 8px 20px 12px; }
        }
      </style>
      <div id="ach-bg"></div>
      <div id="ach-panel">
        <div id="ach-head">
          <div style="display: flex; align-items: center;">
            <div id="ach-title">🏆 Achievements</div>
            <div id="ach-summary">3/9 Unlocked</div>
          </div>
          <div id="ach-close">✕</div>
        </div>
        <div id="ach-categories">
          <div class="ach-cat active" data-cat="all">All</div>
          <div class="ach-cat" data-cat="combat">Combat</div>
          <div class="ach-cat" data-cat="collection">Collection</div>
        </div>
        <div id="ach-grid"></div>
        <div id="ach-foot">
          <button id="ach-close-btn">CLOSE</button>
        </div>
      </div>`;
    document.body.appendChild(this.root);

    // Cache element references
    this.gridEl = this.root.querySelector('#ach-grid');
    this.summaryEl = this.root.querySelector('#ach-summary');
    this.closeEl = this.root.querySelector('#ach-close');
    this.closeBtn = this.root.querySelector('#ach-close-btn');
    this.catEls = this.root.querySelectorAll('.ach-cat');

    // Event listeners
    this.closeEl.addEventListener('click', () => this.close());
    this.closeBtn.addEventListener('click', () => this.close());

    // Category tabs
    this.catEls.forEach((el) => {
      el.addEventListener('click', () => {
        this.category = el.dataset.cat;
        this._syncTabs();
        this._render();
      });
    });
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

  _syncTabs() {
    this.catEls.forEach((el) => {
      el.classList.toggle('active', el.dataset.cat === this.category);
    });
  }

  _getMetric(metric) {
    switch (metric) {
      case 'enemiesDefeatedTotal':
        return this.gm.enemiesDefeatedTotal || 0;
      case 'rescuedAnimalsTotal':
        return this.gm.rescuedAnimalsTotal || 0;
      case 'goldCollectedTotal':
        return this.gm.goldCollectedTotal || 0;
      case 'accurateShots':
        return this.gm.accurateShots || 0;
      case 'bossesDefeated':
        return this.gm.bossesDefeated || 0;
      case 'multiKills':
        return this.gm.multiKills || 0;
      case 'goldSpentTotal':
        return this.gm.goldSpentTotal || 0;
      default:
        return 0;
    }
  }

  _render() {
    const achievements = ACHIEVEMENTS;
    const unlocked = this.gm.achievementsUnlocked || {};
    const unlockedCount = Object.keys(unlocked).length;
    const total = achievements.length;

    // Update summary
    this.summaryEl.textContent = `${unlockedCount}/${total} Unlocked`;

    // Filter by category
    const filtered = this.category === 'all'
      ? achievements
      : achievements.filter((a) => CATEGORIES[a.id] === this.category);

    // Clear grid
    this.gridEl.innerHTML = '';

    // Render cards
    filtered.forEach((ach, index) => {
      const isUnlocked = !!unlocked[ach.id];
      const current = this._getMetric(ach.metric);
      const goal = ach.goal;
      const progress = Math.min(100, (current / goal) * 100);

      const card = document.createElement('div');
      card.className = `ach-card ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.style.animationDelay = `${index * 0.05}s`;

      card.innerHTML = `
        <div class="ach-icon" style="background: ${ach.color}33; box-shadow: 0 0 12px ${ach.color}66;">${ach.icon}</div>
        <div class="ach-name">${ach.name}</div>
        <div class="ach-desc">${ach.desc}</div>
        <div class="ach-progress">
          <div class="ach-bar">
            <div class="ach-fill" style="width: ${progress}%"></div>
          </div>
          <span class="ach-text">${current}/${goal}</span>
        </div>
        ${isUnlocked ? '<div class="ach-check">✓</div>' : '<div class="ach-lock">🔒</div>'}
      `;

      this.gridEl.appendChild(card);
    });
  }
}

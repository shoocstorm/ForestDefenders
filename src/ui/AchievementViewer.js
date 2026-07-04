import { ACHIEVEMENTS } from '../config/Constants.js';
import { icon } from './Icon.js';

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

// Rarity tiers based on goal difficulty (for visual distinction)
const RARITY = {
  COMMON: { threshold: 10, color: '#9fe35a', glow: '#9fe35a', label: 'Common' },
  RARE: { threshold: 50, color: '#4fe3ff', glow: '#4fe3ff', label: 'Rare' },
  EPIC: { threshold: 200, color: '#b48aff', glow: '#b48aff', label: 'Epic' },
  LEGENDARY: { threshold: 500, color: '#ffd24a', glow: '#ff9500', label: 'Legendary' },
};

function getRarity(goal) {
  if (goal >= RARITY.LEGENDARY.threshold) return RARITY.LEGENDARY;
  if (goal >= RARITY.EPIC.threshold) return RARITY.EPIC;
  if (goal >= RARITY.RARE.threshold) return RARITY.RARE;
  return RARITY.COMMON;
}

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

        /* Ambient floating particles */
        #ach-particles {
          position: absolute;
          inset: 0;
          pointer-events: none;
          overflow: hidden;
        }

        .ach-particle {
          position: absolute;
          width: 3px;
          height: 3px;
          background: #4fe3ff;
          border-radius: 50%;
          opacity: 0;
          animation: achParticleFloat 8s infinite ease-in-out;
          box-shadow: 0 0 6px #4fe3ff88;
        }

        @keyframes achParticleFloat {
          0%, 100% { opacity: 0; transform: translateY(100vh) scale(0); }
          10% { opacity: 0.6; }
          90% { opacity: 0.6; }
          100% { opacity: 0; transform: translateY(-20vh) scale(1); }
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

        .ach-title-group {
          display: flex;
          flex-direction: column;
        }

        .ach-title-row {
          display: flex;
          align-items: center;
          gap: 12px;
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
        }

        /* Overall progress ring */
        #ach-progress-ring {
          position: relative;
          width: 50px;
          height: 50px;
        }

        .ach-ring-svg {
          transform: rotate(-90deg);
        }

        .ach-ring-bg {
          fill: none;
          stroke: #ffffff1a;
          stroke-width: 4;
        }

        .ach-ring-fill {
          fill: none;
          stroke: url(#achRingGrad);
          stroke-width: 4;
          stroke-linecap: round;
          transition: stroke-dashoffset 0.6s ease;
          filter: drop-shadow(0 0 4px #4fe3ff88);
        }

        .ach-ring-text {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          font-weight: 800;
          color: #4fe3ff;
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
          flex: 0 1 auto;
          min-height: 0;
          width: 100%;
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          grid-auto-rows: min-content;
          gap: 14px;
          padding: 18px 26px;
          overflow-y: auto;
          align-content: start;
        }

        .ach-card {
          pointer-events: auto;
          cursor: default;
          border: 1px solid #ffffff1e;
          border-radius: 16px;
          padding: 20px 18px 16px;
          position: relative;
          transition: transform 0.25s, box-shadow 0.25s, border-color 0.25s;
          transform-style: preserve-3d;
          overflow: hidden;
          max-height: 220px;
          display: flex;
          flex-direction: column;
        }

        /* Premium layered background */
        .ach-card-bg {
          position: absolute;
          inset: 0;
          border-radius: 16px;
          background:
            /* Hexagonal grid pattern */
            repeating-linear-gradient(60deg, #ffffff04 0px 1px, transparent 1px 12px),
            repeating-linear-gradient(-60deg, #ffffff04 0px 1px, transparent 1px 12px),
            /* Radial gradient overlay */
            radial-gradient(ellipse at 30% 20%, #4fe3ff11 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, #a8e06308 0%, transparent 50%),
            /* Base gradient */
            linear-gradient(135deg, #0d1a1299 0%, #0a120d88 50%, #0d1a1299 100%);
          z-index: 0;
        }

        /* Animated glow orb */
        .ach-card-bg::before {
          content: '';
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, #4fe3ff08 0%, transparent 50%);
          animation: achOrbRotate 8s linear infinite;
        }

        @keyframes achOrbRotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        /* Holographic scan line effect */
        .ach-card-bg::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg,
            transparent 0%,
            #ffffff04 15%,
            #ffffff0a 50%,
            #ffffff04 85%,
            transparent 100%);
          animation: achScan 4s ease-in-out infinite;
          pointer-events: none;
        }

        @keyframes achScan {
          0%, 100% { transform: translateY(-100%); }
          50% { transform: translateY(100%); }
        }

        /* Unlocked card has special background */
        .ach-card.unlocked .ach-card-bg {
          background:
            repeating-linear-gradient(60deg, #ffffff06 0px 1px, transparent 1px 12px),
            repeating-linear-gradient(-60deg, #ffffff06 0px 1px, transparent 1px 12px),
            radial-gradient(ellipse at 30% 20%, #a8e06318 0%, transparent 50%),
            radial-gradient(ellipse at 70% 80%, #a8e06312 0%, transparent 50%),
            linear-gradient(135deg, #132a18ee 0%, #0d1a12cc 50%, #132a18ee 100%);
        }

        /* Tech corner decorations */
        .ach-card::before {
          content: '';
          position: absolute;
          inset: 4px;
          border-radius: 12px;
          background:
            linear-gradient(#4fe3ff33, #4fe3ff33) top left/20px 2px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) top left/2px 20px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) top right/20px 2px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) top right/2px 20px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) bottom left/20px 2px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) bottom left/2px 20px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) bottom right/20px 2px no-repeat,
            linear-gradient(#4fe3ff33, #4fe3ff33) bottom right/2px 20px no-repeat;
          opacity: 0.4;
          transition: opacity 0.2s;
          pointer-events: none;
          z-index: 1;
        }

        .ach-card:hover::before {
          opacity: 0.8;
        }

        .ach-card:hover {
          transform: translateY(-6px) scale(1.02);
          box-shadow: 0 16px 32px -8px #000b, 0 0 28px -4px #4fe3ff88;
          border-color: #4fe3ff66;
        }

        .ach-card:hover .ach-card-bg::before {
          background: radial-gradient(circle, #4fe3ff12 0%, transparent 50%);
        }

        .ach-card.unlocked {
          border-color: #a8e06355;
          box-shadow: 0 0 24px -6px #a8e06333;
        }

        .ach-card.unlocked:hover {
          box-shadow: 0 16px 32px -8px #000b, 0 0 40px -4px #a8e06388;
        }

        .ach-card.locked {
          opacity: 0.5;
          filter: grayscale(0.5);
        }

        .ach-card.locked::before {
          opacity: 0.15;
        }

        .ach-card.locked:hover {
          opacity: 0.7;
          filter: grayscale(0.3);
        }

        /* Icon container with glow effects */
        .ach-icon-wrap {
          position: relative;
          display: flex;
          justify-content: center;
          margin-bottom: 16px;
          z-index: 2;
        }

        .ach-icon-wrap::before {
          content: '';
          position: absolute;
          top: 50%;
          left: 50%;
          width: 112px;
          height: 34px;
          border-radius: 50%;
          background: radial-gradient(ellipse, var(--ach-glow, #4fe3ff) 0%, transparent 68%);
          opacity: 0.28;
          filter: blur(10px);
          transform: translate(-50%, 34px);
          pointer-events: none;
        }

        .ach-icon {
          width: 90px;
          height: 90px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 48px;
          color: var(--ach-color, #4fe3ff);
          background:
            radial-gradient(circle at 30% 24%, #ffffff66 0 9%, transparent 24%),
            radial-gradient(circle at 50% 50%, color-mix(in srgb, var(--ach-rarity, #4fe3ff) 34%, transparent) 0%, transparent 64%),
            linear-gradient(145deg, #10253a 0%, #07111c 62%, #02070d 100%);
          box-shadow:
            0 12px 26px #0009,
            inset 0 1px 0 #ffffff66,
            inset 0 -10px 18px #0007,
            0 0 0 2px color-mix(in srgb, var(--ach-rarity, #4fe3ff) 70%, #ffffff 12%),
            0 0 28px color-mix(in srgb, var(--ach-glow, #4fe3ff) 45%, transparent);
          position: relative;
          z-index: 1;
          animation: achIconFloat 3s ease-in-out infinite;
        }

        .ach-icon::before {
          content: '';
          position: absolute;
          inset: -8px;
          border-radius: inherit;
          background: conic-gradient(
            from 18deg,
            transparent 0 12%,
            var(--ach-rarity, #4fe3ff) 17%,
            #ffffffcc 21%,
            var(--ach-glow, #4fe3ff) 25%,
            transparent 32% 62%,
            color-mix(in srgb, var(--ach-rarity, #4fe3ff) 70%, transparent) 69%,
            transparent 76% 100%
          );
          opacity: 0.78;
          filter: blur(0.2px) drop-shadow(0 0 10px var(--ach-glow, #4fe3ff));
          animation: achIconOrbit 5.5s linear infinite;
          pointer-events: none;
          z-index: -1;
        }

        .ach-icon::after {
          content: '';
          position: absolute;
          inset: 8px;
          border-radius: inherit;
          border: 1px solid #ffffff35;
          box-shadow: inset 0 0 12px #ffffff20;
          pointer-events: none;
        }

        .ach-icon .fd-icon {
          position: relative;
          z-index: 2;
          filter:
            drop-shadow(0 2px 0 #001018aa)
            drop-shadow(0 0 10px color-mix(in srgb, var(--ach-color, #4fe3ff) 72%, transparent));
        }

        @keyframes achIconFloat {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-3px); }
        }

        @keyframes achIconOrbit {
          to { transform: rotate(360deg); }
        }

        /* Unlocked icon glow pulse */
        .ach-card.unlocked .ach-icon {
          animation: achIconFloat 3s ease-in-out infinite, achIconPulse 2s ease-in-out infinite;
        }

        @keyframes achIconPulse {
          0%, 100% {
            box-shadow:
              0 12px 26px #0009,
              inset 0 1px 0 #ffffff66,
              inset 0 -10px 18px #0007,
              0 0 0 2px color-mix(in srgb, var(--ach-rarity, #4fe3ff) 72%, #ffffff 12%),
              0 0 30px color-mix(in srgb, var(--ach-glow, #4fe3ff) 46%, transparent);
          }
          50% {
            box-shadow:
              0 14px 30px #000b,
              inset 0 1px 0 #ffffff88,
              inset 0 -10px 18px #0007,
              0 0 0 3px color-mix(in srgb, var(--ach-rarity, #4fe3ff) 90%, #ffffff 16%),
              0 0 38px color-mix(in srgb, var(--ach-glow, #4fe3ff) 72%, transparent),
              0 0 58px color-mix(in srgb, var(--ach-glow, #4fe3ff) 32%, transparent);
          }
        }

        .ach-card:hover .ach-icon {
          transform: translateY(-4px) scale(1.04);
        }

        .ach-name {
          font-size: 16px;
          font-weight: 900;
          letter-spacing: 0.5px;
          color: #fff;
          margin-bottom: 6px;
          text-transform: uppercase;
          text-shadow: 0 2px 4px #0006, 0 0 12px currentColor33;
          position: relative;
        }

        .ach-desc {
          font-size: 13px;
          color: #bfe0a8;
          line-height: 1.5;
          margin-bottom: 12px;
          min-height: 38px;
          font-weight: 500;
        }

        .ach-progress {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .ach-bar {
          flex: 1;
          height: 8px;
          background: #0a160e;
          border-radius: 4px;
          overflow: hidden;
          box-shadow: inset 0 2px 4px #0008, 0 1px 0 #ffffff11;
        }

        .ach-fill {
          height: 100%;
          background: linear-gradient(90deg, #a8e063, #76d35a);
          border-radius: 3px;
          transition: width 0.5s ease;
          position: relative;
          box-shadow: 0 0 8px currentColor66;
        }

        /* Animated shimmer effect on progress bar */
        .ach-fill::after {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(90deg, transparent, #ffffff66, transparent);
          animation: achShimmer 2.5s infinite;
        }

        @keyframes achShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }

        .ach-text {
          font-size: 12px;
          font-weight: 800;
          color: #ffd24a;
          white-space: nowrap;
          text-shadow: 0 1px 2px #0006;
        }

        .ach-check {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 20px;
          color: #a8e063;
          animation: achCheckPop 0.5s cubic-bezier(0.68, -0.55, 0.265, 1.55);
          filter: drop-shadow(0 0 8px #a8e06388);
        }

        @keyframes achCheckPop {
          0% { transform: scale(0) rotate(-180deg); opacity: 0; }
          50% { transform: scale(1.2) rotate(10deg); }
          100% { transform: scale(1) rotate(0deg); opacity: 1; }
        }

        .ach-lock {
          position: absolute;
          top: 12px;
          right: 12px;
          font-size: 20px;
          color: #555;
          filter: drop-shadow(0 2px 4px #0006);
        }

        /* Stagger fade-in animation with more bounce */
        .ach-card {
          opacity: 0;
          transform: translateY(20px) scale(0.95);
          animation: achFadeIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        @keyframes achFadeIn {
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
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
          justify-content: space-between;
          align-items: center;
        }

        /* Stats counter */
        .ach-stats {
          display: flex;
          gap: 20px;
          font-size: 13px;
          color: #7fa6c8;
        }

        .ach-stat {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .ach-stat-icon {
          font-size: 16px;
        }

        .ach-stat-value {
          font-weight: 800;
          color: #4fe3ff;
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
          .ach-card, .ach-fill, .ach-icon, .ach-card.unlocked .ach-icon, .ach-icon::before {
            animation-duration: 0.01ms !important;
          }
          .ach-card:hover {
            transform: translateY(-2px);
          }
        }

        @media (max-height: 480px) {
          #ach-head { padding: 10px 20px 8px; }
          #ach-title { font-size: 20px; }
          #ach-summary { font-size: 12px; }
          #ach-progress-ring { display: none; }
          #ach-categories { padding: 8px 20px 0; }
          .ach-cat { padding: 5px 12px; font-size: 12px; }
          #ach-grid { padding: 12px 20px; gap: 10px; }
          #ach-foot { padding: 8px 20px 12px; }
          .ach-stats { display: none; }
        }
      </style>
      <svg style="position: absolute; width: 0; height: 0;">
        <defs>
          <linearGradient id="achRingGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style="stop-color:#4fe3ff;stop-opacity:1" />
            <stop offset="100%" style="stop-color:#1f8fcf;stop-opacity:1" />
          </linearGradient>
        </defs>
      </svg>
      <div id="ach-bg">
        <div id="ach-particles"></div>
      </div>
      <div id="ach-panel">
        <div id="ach-head">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div id="ach-progress-ring">
              <svg class="ach-ring-svg" width="50" height="50" viewBox="0 0 50 50">
                <circle class="ach-ring-bg" cx="25" cy="25" r="20"/>
                <circle class="ach-ring-fill" cx="25" cy="25" r="20"
                  stroke-dasharray="125.6" stroke-dashoffset="125.6"/>
              </svg>
              <div class="ach-ring-text">0%</div>
            </div>
            <div class="ach-title-group">
              <div class="ach-title-row">
                <div id="ach-title">${icon('ribbon')} Achievements</div>
              </div>
              <div id="ach-summary">3/9 Unlocked</div>
            </div>
          </div>
          <div id="ach-close">${icon('cancel')}</div>
        </div>
        <div id="ach-categories">
          <div class="ach-cat active" data-cat="all">All</div>
          <div class="ach-cat" data-cat="combat">Combat</div>
          <div class="ach-cat" data-cat="collection">Collection</div>
        </div>
        <div id="ach-grid"></div>
        <div id="ach-foot">
          <div class="ach-stats">
            <div class="ach-stat">
              <span class="ach-stat-icon">⚔️</span>
              <span class="ach-stat-value" id="ach-combat-stat">0</span>
              <span>Combat</span>
            </div>
            <div class="ach-stat">
              <span class="ach-stat-icon">📦</span>
              <span class="ach-stat-value" id="ach-collection-stat">0</span>
              <span>Collection</span>
            </div>
          </div>
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
    this.particlesEl = this.root.querySelector('#ach-particles');
    this.ringFillEl = this.root.querySelector('.ach-ring-fill');
    this.ringTextEl = this.root.querySelector('.ach-ring-text');
    this.combatStatEl = this.root.querySelector('#ach-combat-stat');
    this.collectionStatEl = this.root.querySelector('#ach-collection-stat');

    // Create floating particles
    this._createParticles();

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

  _createParticles() {
    // Create 12 floating particles for ambient effect
    for (let i = 0; i < 12; i++) {
      const particle = document.createElement('div');
      particle.className = 'ach-particle';
      particle.style.left = `${Math.random() * 100}%`;
      particle.style.animationDelay = `${Math.random() * 8}s`;
      particle.style.animationDuration = `${6 + Math.random() * 4}s`;
      // Vary particle colors based on rarity colors
      const colors = ['#4fe3ff', '#a8e063', '#ffd24a', '#b48aff'];
      particle.style.background = colors[Math.floor(Math.random() * colors.length)];
      particle.style.boxShadow = `0 0 6px ${particle.style.background}88`;
      this.particlesEl.appendChild(particle);
    }
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

    // Update progress ring
    const progress = total > 0 ? unlockedCount / total : 0;
    const circumference = 125.6; // 2 * PI * r (r=20)
    const offset = circumference * (1 - progress);
    this.ringFillEl.style.strokeDashoffset = offset;
    this.ringTextEl.textContent = `${Math.round(progress * 100)}%`;

    // Update category stats
    let combatUnlocked = 0, combatTotal = 0;
    let collectionUnlocked = 0, collectionTotal = 0;
    achievements.forEach((ach) => {
      const cat = CATEGORIES[ach.id];
      const isUnlocked = !!unlocked[ach.id];
      if (cat === 'combat') {
        combatTotal++;
        if (isUnlocked) combatUnlocked++;
      } else {
        collectionTotal++;
        if (isUnlocked) collectionUnlocked++;
      }
    });
    this.combatStatEl.textContent = `${combatUnlocked}/${combatTotal}`;
    this.collectionStatEl.textContent = `${collectionUnlocked}/${collectionTotal}`;

    // Filter by category
    const filtered = this.category === 'all'
      ? achievements
      : achievements.filter((a) => CATEGORIES[a.id] === this.category);

    // Sort: by category, then unlocked (unlocked first), then by goal (lower first - natural progression)
    const sorted = [...filtered].sort((a, b) => {
      const aCat = CATEGORIES[a.id];
      const bCat = CATEGORIES[b.id];
      // Sort by category (combat before collection)
      if (aCat !== bCat) return aCat === 'combat' ? -1 : 1;
      // Within same category: unlocked first
      const aUnlocked = !!unlocked[a.id];
      const bUnlocked = !!unlocked[b.id];
      if (aUnlocked !== bUnlocked) return bUnlocked - aUnlocked;
      // Then by goal (lower goals first - logical progression)
      return a.goal - b.goal;
    });

    // Clear grid
    this.gridEl.innerHTML = '';

    // Render cards
    sorted.forEach((ach, index) => {
      const isUnlocked = !!unlocked[ach.id];
      const current = this._getMetric(ach.metric);
      const goal = ach.goal;
      const progress = Math.min(100, (current / goal) * 100);
      const rarity = getRarity(goal);

      const card = document.createElement('div');
      card.className = `ach-card ach-rarity-${rarity.label.toLowerCase()} ${isUnlocked ? 'unlocked' : 'locked'}`;
      card.style.animationDelay = `${index * 0.06}s`;

      card.innerHTML = `
        <div class="ach-icon-wrap">
          <div class="ach-icon" style="--ach-rarity: ${rarity.color}; --ach-glow: ${rarity.glow}; --ach-color: ${ach.color};">${icon(ach.icon)}</div>
        </div>
        <div class="ach-name" style="text-align: center;">${ach.name}</div>
        <div class="ach-desc" style="text-align: center;">${ach.desc}</div>
        ${!isUnlocked ? `
          <div class="ach-progress">
            <div class="ach-bar">
              <div class="ach-fill" style="width: ${progress}%; background: linear-gradient(90deg, ${rarity.color}, ${rarity.glow});"></div>
            </div>
            <span class="ach-text">${current}/${goal}</span>
          </div>
        ` : `
          <div class="ach-progress" style="justify-content: center;">
            <span class="ach-text" style="color: ${rarity.color};">✓ COMPLETE</span>
          </div>
        `}
        ${isUnlocked ? `<div class="ach-check">${icon('check-mark')}</div>` : '<div class="ach-lock">🔒</div>'}
      `;

      this.gridEl.appendChild(card);
    });
  }
}

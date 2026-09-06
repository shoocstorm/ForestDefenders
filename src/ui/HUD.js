// DOM HUD overlay (HUD_SPEC §2–3). A full combat HUD inspired by modern wave-
// shooters: a sweep radar (top-left), stacked HP/shield vitals (left), a wave +
// enemies-remaining readout with status badges (top-right), score/gold (bottom-
// left), an animals-safe tracker with a contextual rescue prompt (bottom-centre),
// and a rich weapon panel — element-tinted ammo gauge + a live weapon slot strip
// and buff pills (bottom-right). Plus the world-projected reticle, a damage
// vignette and a wave banner.

import { icon as ico } from './Icon.js';

// Per-element accent colours — shared by weapon panel, slot strip and badges.
const ELEMENT_COLORS = {
  NATURE: '#b6e36a', ENERGY: '#49e8ff', PHYSICAL: '#ffd27a',
  FIRE: '#ff7a30', WOOD: '#8fe04a', EARTH: '#e0a83a',
};
const elColor = (e) => ELEMENT_COLORS[e] || '#cfe8b0';

export class HUD {
  constructor() {
    const root = document.createElement('div');
    root.id = 'fd-hud';
    root.innerHTML = `
      <style>
        #fd-hud{position:fixed;inset:0;z-index:22;pointer-events:none;
          font-family:"Rajdhani","Trebuchet MS",system-ui,sans-serif;
          color:#eaf7df;-webkit-font-smoothing:antialiased;}
        #fd-hud *{box-sizing:border-box;}

        /* ---- shared panel chrome ---- */
        .fd-panel{position:absolute;
          background:linear-gradient(160deg,#0e1a1273,#070d0a66);
          border:1px solid #49e8ff2e;border-radius:0;padding:11px 15px;
          backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);
          box-shadow:0 6px 26px #000a, inset 0 1px 0 #ffffff14, 0 0 18px #49e8ff10;
          text-shadow:0 1px 3px #000c;
          /* chamfered top-right + bottom-left corners (left-side panels) */
          clip-path:polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px));}
        .fd-panel::before{content:"";position:absolute;left:14px;right:14px;top:0;height:2px;
          background:linear-gradient(90deg,transparent,#7fe3ffcc,transparent);opacity:.7;}
        /* glowing accent edge down the leading side */
        .fd-panel::after{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;
          background:linear-gradient(#49e8ff,#49e8ff22);box-shadow:0 0 10px #49e8ff88;}
        /* right-aligned panels: mirror the chamfer + accent edge to the right side */
        #fd-topright,#fd-weapon-panel{
          clip-path:polygon(14px 0,100% 0,100% calc(100% - 14px),calc(100% - 14px) 100%,0 100%,0 14px);}
        #fd-topright::after,#fd-weapon-panel::after{left:auto;right:0;}
        .fd-label{font-size:11px;letter-spacing:2.5px;font-weight:700;text-transform:uppercase;
          color:#9fdca0;opacity:.92;}
        .fd-mono{font-variant-numeric:tabular-nums;font-feature-settings:"tnum";}

        /* ---- radar (top-left) ---- */
        #fd-radar-panel{top:16px;left:16px;padding:10px;border-radius:50%;width:172px;height:172px;
          clip-path:none;display:flex;align-items:center;justify-content:center;
          background:radial-gradient(circle at 50% 45%,#0d201788,#05100b80);}
        #fd-radar-panel::before,#fd-radar-panel::after{display:none;}
        #fd-radar{width:150px;height:150px;border-radius:50%;
          box-shadow:inset 0 0 22px #00000088, 0 0 0 1px #5fe0c033;}
        #fd-radar-ring{position:absolute;inset:6px;border-radius:50%;
          border:1px solid #6fe3c040;pointer-events:none;
          box-shadow:0 0 16px #2effc022;}
        .fd-radar-card{position:absolute;font-size:9px;font-weight:800;letter-spacing:1px;
          color:#8fe0c0;opacity:.7;}
        #fd-rc-n{top:9px;left:50%;transform:translateX(-50%);}
        #fd-rc-s{bottom:9px;left:50%;transform:translateX(-50%);}
        #fd-rc-e{right:11px;top:50%;transform:translateY(-50%);}
        #fd-rc-w{left:11px;top:50%;transform:translateY(-50%);}

        /* ---- vitals — vertical edge bars (HP left, Shield right) ---- */
        .fd-vbar{position:absolute;top:50%;transform:translateY(-50%);
          display:flex;flex-direction:column;align-items:center;gap:7px;
          pointer-events:none;text-shadow:0 1px 3px #000c;transition:opacity .3s;}
        #fd-hp-bar{left:22px;}
        #fd-sh-bar{right:22px;}
        #fd-sh-bar.empty{opacity:.32;}
        .fd-vname{font-size:10px;letter-spacing:3px;font-weight:800;text-transform:uppercase;}
        .fd-vval{font-size:22px;font-weight:800;line-height:1;text-shadow:0 0 10px currentColor;}
        .fd-vmax{font-size:10px;font-weight:700;opacity:.5;letter-spacing:1px;}
        /* tall chamfered (hex-cap) track with a dark tech backing */
        .fd-vtrack{position:relative;width:16px;height:44vh;max-height:380px;min-height:180px;
          background:#02080c;overflow:hidden;border:1px solid #ffffff1f;
          clip-path:polygon(0 7px,50% 0,100% 7px,100% calc(100% - 7px),50% 100%,0 calc(100% - 7px));}
        /* fill rises from the bottom */
        .fd-vfill{position:absolute;left:0;right:0;bottom:0;height:100%;
          transition:height .18s ease,background .3s;}
        /* horizontal segment dividers painted over the fill (charge-cell look) */
        .fd-vtrack::before{content:"";position:absolute;inset:0;z-index:2;pointer-events:none;
          background:repeating-linear-gradient(0deg,#0000 0 14px,#02080c 14px 16px);}
        /* vertical scan sweep */
        .fd-vtrack::after{content:"";position:absolute;left:0;right:0;top:-32px;height:32px;z-index:3;
          pointer-events:none;background:linear-gradient(0deg,transparent,#ffffff55,transparent);
          animation:fdvscan 2.8s linear infinite;}
        @keyframes fdvscan{0%{top:-32px;}55%,100%{top:115%;}}
        #fd-hpfill{background:linear-gradient(0deg,#3f9e2a,#9fe35a);}
        #fd-shfill{background:linear-gradient(0deg,#2f8ec8,#9fe6ff);}
        /* glow via drop-shadow so it follows the chamfer and isn't clipped */
        #fd-hp-bar .fd-vtrack{filter:drop-shadow(0 0 7px #6fe04a88);}
        #fd-sh-bar .fd-vtrack{filter:drop-shadow(0 0 7px #6fd4ff88);}
        #fd-hpfill.crit{animation:fdcrit .7s steps(1) infinite;}
        @keyframes fdcrit{50%{filter:brightness(1.7);}}

        /* ---- wave / enemies (top-right) ---- */
        #fd-topright{top:16px;right:16px;text-align:right;min-width:230px;}
        #fd-wave{font-size:30px;font-weight:800;letter-spacing:2px;color:#ffd24a;line-height:1;
          text-shadow:0 2px 0 #0008,0 0 18px #ffb31a55;}
        #fd-wave small{font-size:18px;color:#fff7d6;opacity:.85;}
        #fd-enemies-row{margin-top:6px;font-size:12px;letter-spacing:1.5px;color:#cfe8b0;font-weight:700;}
        #fd-enemies{color:#ff6a6a;font-weight:800;font-size:15px;}
        #fd-badges{display:flex;gap:7px;justify-content:flex-end;margin-top:9px;}
        .fd-badge{display:flex;align-items:center;gap:5px;font-size:10px;font-weight:800;
          letter-spacing:1.5px;padding:4px 9px;border-radius:8px;background:#06140e99;
          border:1px solid #49e8ff44;color:#9fe8ff;text-transform:uppercase;}
        .fd-badge i{width:7px;height:7px;border-radius:50%;background:currentColor;
          box-shadow:0 0 7px currentColor;}
        .fd-badge.warm{border-color:#ffc24a55;color:#ffd98a;}

        /* ---- score / gold (bottom-left) ---- */
        #fd-score{bottom:18px;left:16px;}
        #fd-gold-line{display:flex;align-items:center;gap:9px;}
        #fd-coin{width:22px;height:22px;border-radius:50%;flex:none;
          background:radial-gradient(circle at 35% 30%,#ffe89a,#e8a81f 70%,#a8740c);
          box-shadow:0 0 10px #ffbf3a88, inset 0 -2px 3px #0006;
          display:flex;align-items:center;justify-content:center;
          font-size:12px;font-weight:900;color:#7a4d05;}
        .fd-gold{color:#ffd24a;font-size:30px;font-weight:800;line-height:1;display:inline-block;
          text-shadow:0 2px 0 #0008,0 0 16px #ffb31a55;}
        .fd-gold.pulse{animation:fdpulse .35s ease;}
        @keyframes fdpulse{0%{transform:scale(1)}40%{transform:scale(1.32)}100%{transform:scale(1)}}
        #fd-kills-line{margin-top:7px;font-size:12px;letter-spacing:2px;font-weight:700;color:#bfe0a8;}
        #fd-kills{color:#fff;font-weight:800;}

        /* ---- animals (merged into the bottom-left score panel) ---- */
        #fd-animals-row{display:flex;align-items:center;justify-content:flex-start;gap:8px;margin-top:7px;}
        #fd-paw{width:20px;height:20px;flex:none;fill:#9fe8c0;
          filter:drop-shadow(0 0 6px #8fe0a077);}
        #fd-saved{font-size:20px;font-weight:800;color:#9fe8c0;line-height:1;
          text-shadow:0 2px 0 #0008,0 0 16px #4fe09a55;}
        #fd-saved small{font-size:12px;color:#cfeed6;opacity:.8;}
        #fd-free{margin-top:7px;font-size:12px;font-weight:800;letter-spacing:1.5px;
          color:#0a160e;background:linear-gradient(90deg,#bfe36a,#8fe04a);
          border-radius:8px;padding:5px 12px;display:none;
          box-shadow:0 0 16px #9fe06a66;animation:fdpromptpulse 1.1s ease-in-out infinite;}
        #fd-free.show{display:inline-block;}
        #fd-free b{font-family:monospace;background:#0a160e;color:#bfe36a;border-radius:4px;
          padding:1px 6px;margin-right:6px;}
        @keyframes fdpromptpulse{0%,100%{transform:scale(1);}50%{transform:scale(1.06);}}

        /* ---- weapon panel (bottom-right) ---- */
        #fd-weapon-panel{bottom:18px;right:16px;min-width:198px;padding:8px 11px;}
        #fd-buffs{display:flex;gap:6px;justify-content:flex-end;margin-bottom:9px;min-height:0;}
        .fd-buff{font-size:10px;font-weight:800;letter-spacing:1px;padding:3px 9px;border-radius:9px;
          background:#0a1810cc;border:1px solid #ffffff2e;color:#dfffc0;white-space:nowrap;
          box-shadow:0 0 10px #0006;}
        #fd-wpn-head{display:flex;align-items:center;justify-content:flex-end;gap:9px;}
        #fd-element{font-size:10px;font-weight:800;letter-spacing:1.5px;padding:3px 9px;border-radius:8px;
          border:1px solid currentColor;text-transform:uppercase;}
        #fd-weapon{font-size:15px;font-weight:800;letter-spacing:1px;color:#fff;}
        #fd-ammo-row{display:flex;align-items:flex-end;justify-content:flex-end;gap:10px;margin-top:6px;}
        #fd-ammo{font-size:26px;font-weight:800;line-height:.9;letter-spacing:1px;}
        #fd-ammo.low{color:#ff6a5a;animation:fdblink .6s steps(1) infinite;}
        @keyframes fdblink{50%{opacity:.4;}}
        #fd-ammo-icon{font-size:18px;opacity:.85;}
        #fd-ammo-gauge{height:6px;border-radius:4px;background:#00000066;overflow:hidden;
          border:1px solid #ffffff22;margin-top:7px;}
        #fd-ammo-fill{height:100%;width:100%;border-radius:3px;transition:width .12s ease;}
        #fd-slots{display:flex;gap:5px;justify-content:flex-end;margin-top:8px;flex-wrap:wrap;}
        .fd-slot{display:flex;align-items:center;gap:4px;font-size:9px;font-weight:800;
          padding:3px 6px;border-radius:7px;background:#06120cb0;border:1px solid #ffffff1a;
          color:#9bbf8a;transition:all .15s ease;}
        .fd-slot .dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none;}
        .fd-slot .key{font-family:monospace;opacity:.7;}
        .fd-slot.active{background:#0e1f14;border-color:currentColor;color:#fff;
          box-shadow:0 0 14px -2px currentColor;transform:translateY(-2px);}
        /* Name shown in the panel header already — slots stay seq-number only. */
        .fd-slot .name{display:none;}
        .fd-slot.locked{opacity:.28;filter:grayscale(1);}
        .fd-slot.locked .key{text-decoration:line-through;}

        /* ---- reticle ---- */
        /* Positioned via transform (translate3d) each frame from JS — compositor
           only, no document layout (left/top writes invalidated layout every
           frame; see DamageNumbers for the same fix). The lock scale is baked
           into that JS transform, so .locked only owns colours. */
        #fd-reticle{position:absolute;left:0;top:0;will-change:transform;}
        #fd-cross{position:absolute;left:-11px;top:-11px;width:22px;height:22px;}
        #fd-cross::before,#fd-cross::after{content:"";position:absolute;background:#eaf7dfd9;
          box-shadow:0 0 3px #000a;transition:background .12s;}
        #fd-cross::before{left:10px;top:0;width:2px;height:22px;}
        #fd-cross::after{top:10px;left:0;height:2px;width:22px;}
        #fd-dot{position:absolute;left:-2px;top:-2px;width:4px;height:4px;border-radius:50%;
          background:#ff5a5a;box-shadow:0 0 4px #000;transition:background .12s;}
        #fd-reticle.locked #fd-cross::before,#fd-reticle.locked #fd-cross::after{
          background:#ff7a4a;box-shadow:0 0 7px #ff3a1acc;}
        #fd-reticle.locked #fd-dot{background:#ffe04a;box-shadow:0 0 6px #ffae00;}

        /* ---- vignette + banner ---- */
        #fd-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;
          box-shadow:inset 0 0 160px 40px #c01818;transition:opacity .1s;}
        #fd-banner{position:absolute;top:24%;left:50%;transform:translateX(-50%);
          font-size:50px;font-weight:900;letter-spacing:3px;color:#fff;opacity:0;
          text-shadow:0 4px 0 #0008,0 0 30px #a8e063;pointer-events:none;white-space:nowrap;}
        #fd-banner.show{animation:fdbanner 2s ease both;}
        @keyframes fdbanner{0%{opacity:0;transform:translateX(-50%) scale(.6);}
          15%{opacity:1;transform:translateX(-50%) scale(1.06);}
          30%{transform:translateX(-50%) scale(1);}80%{opacity:1;}100%{opacity:0;}}

        /* ---- Mobile (touch): minimal HUD that stays clear of the on-screen
           controls. Hide decorative panels (radar, score, badges, weapon slot
           strip + buffs); keep enemies-remaining, animals and a bare ammo
           count as lightweight text rather than chrome-heavy panels — the
           play area is precious on a phone screen. HP/Shield move onto
           TouchControls' fire-button ring (see TouchControls.setVitals) so
           the vertical bars are dropped entirely here. ---- */
        @media (pointer:coarse){
          #fd-radar-panel,#fd-badges,#fd-buffs,#fd-wpn-head,
          #fd-ammo-gauge,#fd-slots{display:none!important;}
          /* merged into the fire-button vitals ring (TouchControls) instead */
          #fd-hp-bar,#fd-sh-bar{display:none!important;}
          /* score panel keeps only the animals counter on touch */
          #fd-gold-line,#fd-kills-line{display:none!important;}
          /* The wave number is redundant on touch — Game.js already pops a
             big "WAVE N" banner (#fd-banner) on every transition, so a
             persistent readout just eats screen space between waves. */
          #fd-wave{display:none!important;}
          /* Enemies-remaining drops from its own top panel down to sit right
             above the animals-saved line — one merged status cluster,
             bottom-centre, instead of two separate readouts. */
          #fd-topright{top:auto;bottom:calc(46px + env(safe-area-inset-bottom));
            left:50%;right:auto;transform:translateX(-50%);text-align:center;min-width:0;
            padding:0 10px;background:none;border:none;box-shadow:none;
            backdrop-filter:none;-webkit-backdrop-filter:none;opacity:.82;clip-path:none;}
          #fd-topright::before,#fd-topright::after{display:none;}
          #fd-enemies-row{font-size:10px;margin-top:0;}
          /* Ammo readout → top-left. That corner sits clear of every touch
             control (util row is top-right, joystick bottom-left, fire/
             action cluster bottom-right) — unlike its old bottom-right spot,
             which the FREE/WEAPON buttons clipped into. */
          #fd-weapon-panel{top:calc(18px + env(safe-area-inset-top));
            left:calc(16px + env(safe-area-inset-left));right:auto;bottom:auto;transform:none;
            text-align:left;min-width:0;padding:0;background:none;border:none;box-shadow:none;
            backdrop-filter:none;-webkit-backdrop-filter:none;clip-path:none;}
          #fd-weapon-panel::before,#fd-weapon-panel::after{display:none;}
          #fd-ammo-row{margin-top:0;justify-content:flex-start;}#fd-ammo{font-size:20px;}
          /* score panel (now just the animals counter) → bottom-centre, no
             chrome, shrunk to a thin text strip; drop the [E] hint glyph.
             clip-path:none — the sci-fi chamfer is sized for full padded
             panels; on a bare ~14px-tall text strip it slices straight
             through the first/last characters instead of just cutting an
             (invisible, since there's no more background) corner. */
          #fd-score{left:50%;transform:translateX(-50%);text-align:center;
            bottom:calc(14px + env(safe-area-inset-bottom));
            padding:0;background:none;border:none;box-shadow:none;
            backdrop-filter:none;-webkit-backdrop-filter:none;opacity:.82;clip-path:none;}
          #fd-score::before,#fd-score::after{display:none;}
          #fd-animals-row{justify-content:center;margin-top:0;}
          #fd-paw{width:14px;height:14px;}
          #fd-saved{font-size:13px;} #fd-saved small{font-size:9px;}
          #fd-free b{display:none;}
        }
      </style>

      <div id="fd-vignette"></div>
      <div id="fd-banner"></div>

      <div class="fd-panel" id="fd-radar-panel">
        <canvas id="fd-radar"></canvas>
        <div id="fd-radar-ring"></div>
        <span class="fd-radar-card" id="fd-rc-n">N</span>
        <span class="fd-radar-card" id="fd-rc-s">S</span>
        <span class="fd-radar-card" id="fd-rc-e">E</span>
        <span class="fd-radar-card" id="fd-rc-w">W</span>
      </div>

      <div class="fd-vbar" id="fd-hp-bar">
        <div class="fd-vname" style="color:#9fe35a;">HP</div>
        <div class="fd-vval" style="color:#9fe35a;"><span id="fd-hpnum" class="fd-mono">100</span></div>
        <div class="fd-vtrack"><div class="fd-vfill" id="fd-hpfill"></div></div>
        <div class="fd-vmax">/<span id="fd-hpmax">100</span></div>
      </div>

      <div class="fd-vbar empty" id="fd-sh-bar">
        <div class="fd-vname" style="color:#8fd6ff;">SHD</div>
        <div class="fd-vval" style="color:#8fd6ff;"><span id="fd-shnum" class="fd-mono">0</span></div>
        <div class="fd-vtrack"><div class="fd-vfill" id="fd-shfill" style="height:0;"></div></div>
        <div class="fd-vmax">/<span id="fd-shmax">30</span></div>
      </div>

      <div class="fd-panel" id="fd-topright">
        <div id="fd-wave">WAVE <span class="fd-mono">1</span><small>/3</small></div>
        <div id="fd-enemies-row">ENEMIES REMAINING: <span id="fd-enemies" class="fd-mono">0</span></div>
        <div id="fd-badges"></div>
      </div>

      <div class="fd-panel" id="fd-score">
        <div id="fd-gold-line">
          <span id="fd-coin">¢</span>
          <span class="fd-gold fd-mono" id="fd-gold">0</span>
        </div>
        <div id="fd-kills-line">KILLS <span id="fd-kills" class="fd-mono">0</span></div>
        <div id="fd-animals-row">
          <svg id="fd-paw" viewBox="0 0 24 24" aria-label="animals saved">
            <ellipse cx="12" cy="16" rx="5.2" ry="4.2"/>
            <ellipse cx="5.5" cy="11" rx="2.1" ry="2.8"/>
            <ellipse cx="9.5" cy="7.2" rx="2.1" ry="2.8"/>
            <ellipse cx="14.5" cy="7.2" rx="2.1" ry="2.8"/>
            <ellipse cx="18.5" cy="11" rx="2.1" ry="2.8"/>
          </svg>
          <span id="fd-saved" class="fd-mono">0<small>/3 SAFE</small></span>
        </div>
        <div id="fd-free"><b>E</b>FREE ANIMAL</div>
      </div>

      <div class="fd-panel" id="fd-weapon-panel">
        <div id="fd-buffs"></div>
        <div id="fd-wpn-head">
          <span id="fd-weapon">Acorn Gun</span>
          <span id="fd-element" style="color:#b6e36a;">NATURE</span>
        </div>
        <div id="fd-ammo-row">
          <span id="fd-ammo-icon">▮</span>
          <span id="fd-ammo" class="fd-mono">∞</span>
        </div>
        <div id="fd-ammo-gauge"><div id="fd-ammo-fill"></div></div>
        <div id="fd-slots"></div>
      </div>

      <div id="fd-reticle"><div id="fd-cross"></div><div id="fd-dot"></div></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    const $ = (id) => root.querySelector(id);

    // Vitals
    this.hpFill = $('#fd-hpfill'); this.hpNum = $('#fd-hpnum'); this.hpMax = $('#fd-hpmax');
    this.shRow = $('#fd-sh-bar'); this.shFill = $('#fd-shfill');
    this.shNum = $('#fd-shnum'); this.shMax = $('#fd-shmax');
    // Wave / enemies
    this.waveEl = $('#fd-wave'); this.enemiesEl = $('#fd-enemies'); this.badgesEl = $('#fd-badges');
    // Score
    this.goldEl = $('#fd-gold'); this.killsEl = $('#fd-kills');
    // Animals
    this.savedEl = $('#fd-saved'); this.freeEl = $('#fd-free');
    // Weapon
    this.weaponEl = $('#fd-weapon'); this.elementEl = $('#fd-element');
    this.ammoEl = $('#fd-ammo'); this.ammoIconEl = $('#fd-ammo-icon'); this.ammoFill = $('#fd-ammo-fill');
    this.buffsEl = $('#fd-buffs'); this.slotsEl = $('#fd-slots');
    // FX
    this.vignette = $('#fd-vignette'); this.banner = $('#fd-banner'); this.reticle = $('#fd-reticle');

    // Radar canvas (dpr-scaled for crispness).
    this.radarCanvas = $('#fd-radar');
    this._radarSize = 150;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.radarCanvas.width = this._radarSize * dpr;
    this.radarCanvas.height = this._radarSize * dpr;
    this.rctx = this.radarCanvas.getContext('2d');
    this.rctx.scale(dpr, dpr);
    this._sweep = 0;
    this._radarLast = 0;
    this._radarRange = 42; // world units shown to the rim
    // Sweep gradient is constant (canvas interprets gradient coordinates in the
    // user space active at *paint* time, so one cached object rotates with the
    // wedge) — create it once instead of every frame.
    this._sweepGrad = this.rctx.createLinearGradient(0, 0, 0, -(this._radarSize / 2 - 8));
    this._sweepGrad.addColorStop(0, '#3effc000');
    this._sweepGrad.addColorStop(1, '#3effc055');
    // Grid rings + crosshair never change frame to frame — pre-render them once
    // to an offscreen canvas and blit it every frame instead of re-stroking two
    // arcs + a cross every single frame (only the sweep wedge + blips actually
    // move, so only those get redrawn live).
    this._radarBg = document.createElement('canvas');
    this._radarBg.width = this._radarSize * dpr;
    this._radarBg.height = this._radarSize * dpr;
    const bgCtx = this._radarBg.getContext('2d');
    bgCtx.scale(dpr, dpr);
    this._drawRadarGrid(bgCtx);

    // Change-tracking caches.
    this._last = { gold: -1, kills: -1, enemies: -1, wave: -1, saved: -1, weaponIndex: -1,
      hp: -1, shield: -1, ammo: '', buffs: '', badges: '', free: null, lock: false };
    this.slotEls = [];
  }

  // Build the weapon slot strip once from the static roster.
  // list: [{ name, element }]; index is 0-based, displayed as 1-based hotkeys.
  initWeapons(list) {
    this.slotsEl.innerHTML = '';
    this.slotEls = list.map((w, i) => {
      const el = document.createElement('div');
      el.className = 'fd-slot';
      el.style.color = elColor(w.element);
      el.innerHTML = `<span class="dot"></span><span class="key">${i + 1}</span>` +
        `<span class="name">${w.name}</span>`;
      this.slotsEl.appendChild(el);
      return el;
    });
  }

  // Position the reticle at a screen pixel; `locked` highlights it on a target;
  // hidden when the aim point is behind the camera / off-screen. Position is a
  // transform write (compositor-only); every other property is change-gated so
  // the steady state writes exactly one string per frame.
  setCrosshair(x, y, locked, visible) {
    const r = this.reticle;
    if (visible !== this._retVisible) {
      r.style.display = visible ? '' : 'none';
      this._retVisible = visible;
    }
    if (!visible) return;
    r.style.transform = `translate3d(${x}px,${y}px,0) translate(-50%,-50%)` +
      (locked ? ' scale(1.35)' : '');
    if (locked !== this._last.lock) {
      r.classList.toggle('locked', locked);
      this._last.lock = locked;
    }
  }

  showBanner(text) {
    this.banner.textContent = text;
    this.banner.classList.remove('show'); void this.banner.offsetWidth;
    this.banner.classList.add('show');
  }

  pulseGold() {
    this.goldEl.classList.remove('pulse');
    void this.goldEl.offsetWidth;
    this.goldEl.classList.add('pulse');
  }

  flashDamage() {
    this.vignette.style.opacity = '0.85';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 90);
  }

  update(state) {
    const L = this._last;

    // --- Health ---
    if (state.hp !== L.hp || state.maxHp !== this._maxHp) {
      const pct = Math.max(0, Math.min(1, state.hp / state.maxHp));
      this.hpFill.style.height = (pct * 100) + '%';
      this.hpNum.textContent = Math.ceil(state.hp);
      this.hpMax.textContent = state.maxHp;
      const [grad, glow] = pct > 0.5
        ? ['linear-gradient(0deg,#3f9e2a,#9fe35a)', '#6fe04a99']
        : pct > 0.25
          ? ['linear-gradient(0deg,#c79a2a,#f0d24a)', '#f0d24a99']
          : ['linear-gradient(0deg,#c43a3a,#ff7a6a)', '#ff5a4aaa'];
      this.hpFill.style.background = grad;
      this.hpFill.parentElement.style.filter = `drop-shadow(0 0 6px ${glow})`;
      this.hpFill.classList.toggle('crit', pct <= 0.25);
      L.hp = state.hp; this._maxHp = state.maxHp;
    }

    // --- Shield (Hedgehog buff) ---
    if (state.shield !== L.shield) {
      const max = state.maxShield || 30;
      this.shMax.textContent = max;
      this.shNum.textContent = Math.ceil(state.shield);
      this.shFill.style.height = Math.min(100, (state.shield / max) * 100) + '%';
      this.shRow.classList.toggle('empty', state.shield <= 0);
      L.shield = state.shield;
    }

    // --- Wave + enemies ---
    if (state.wave !== L.wave || state.totalWaves !== this._totWaves) {
      this.waveEl.innerHTML = `WAVE <span class="fd-mono">${state.wave}</span><small>/${state.totalWaves}</small>`;
      L.wave = state.wave; this._totWaves = state.totalWaves;
    }
    if (state.enemies !== L.enemies) {
      this.enemiesEl.textContent = state.enemies;
      L.enemies = state.enemies;
    }

    // --- Status badges (aim-assist always on; reveal when a Bird is freed) ---
    const badgeKey = `${state.aimAssist ? 1 : 0}${state.reveal ? 1 : 0}`;
    if (badgeKey !== L.badges) {
      const b = [];
      if (state.aimAssist) b.push('<span class="fd-badge"><i></i>AIM ASSIST</span>');
      if (state.reveal) b.push('<span class="fd-badge warm"><i></i>REVEAL</span>');
      this.badgesEl.innerHTML = b.join('');
      L.badges = badgeKey;
    }

    // --- Score / gold ---
    if (state.gold !== L.gold) { this.goldEl.textContent = state.gold.toLocaleString(); L.gold = state.gold; }
    if (state.kills !== L.kills) { this.killsEl.textContent = state.kills; L.kills = state.kills; }

    // --- Animals ---
    if (state.saved !== L.saved || state.totalAnimals !== this._totAnimals) {
      const s = String(state.saved).padStart(2, '0');
      this.savedEl.innerHTML = `${s}<small>/${state.totalAnimals} SAFE</small>`;
      L.saved = state.saved; this._totAnimals = state.totalAnimals;
    }
    if (!!state.freePrompt !== L.free) {
      this.freeEl.classList.toggle('show', !!state.freePrompt);
      L.free = !!state.freePrompt;
    }

    // --- Weapon panel ---
    if (state.weaponIndex !== L.weaponIndex) {
      this.weaponEl.textContent = state.weapon;
      const c = elColor(state.element);
      this.elementEl.textContent = state.element;
      this.elementEl.style.color = c;
      this.ammoFill.style.background = c;
      this.ammoIconEl.style.color = c;
      this.slotEls.forEach((el, i) => el.classList.toggle('active', i === state.weaponIndex));
      L.weaponIndex = state.weaponIndex;
    }
    // Dim locked weapon slots (M5 unlock gating).
    if (state.unlocked) {
      const lockKey = state.unlocked.map((u) => (u ? 1 : 0)).join('');
      if (lockKey !== L.unlocked) {
        this.slotEls.forEach((el, i) => el.classList.toggle('locked', !state.unlocked[i]));
        L.unlocked = lockKey;
      }
    }
    const info = state.ammo;
    if (info) {
      if (info.label !== L.ammo) { this.ammoEl.textContent = info.label; L.ammo = info.label; }
      this.ammoEl.classList.toggle('low', !!info.low);
      const ratio = Math.max(0, Math.min(1, info.ratio || 0));
      if (ratio !== L.ammoRatio) { this.ammoFill.style.width = ratio * 100 + '%'; L.ammoRatio = ratio; }
      const icon = { mag: '▮', heat: '♨', energy: '⚡', infinite: '∞' }[info.kind] || '▮';
      if (this.ammoIconEl.textContent !== icon) this.ammoIconEl.textContent = icon;
    }

    // --- Buff pills (incl. timed Tail Guard countdown + charge/round counters) ---
    const tb = state.timedBuffs || {};
    const tg = tb.TAIL_GUARD ? Math.ceil(tb.TAIL_GUARD) : 0;
    const fr = state.fireRounds || 0, hs = state.hitShield || 0;
    const buffKey = [...(state.buffs || [])].sort().join(',') + `|${tg}|${fr}|${hs}`;
    if (buffKey !== L.buffs) {
      L.buffs = buffKey;
      const warn = tg > 0 && tg <= 5;
      const label = {
        SHIELD: `${ico('bell-shield')} SHIELD`, SPEED: `${ico('run')} SPEED`, REVEAL: `${ico('warlock-eye')} REVEAL`,
        TAIL_GUARD: `${ico('fox-tail')} TAIL ${tg}s`, OAKSHIELD: `${ico('bell-shield')} GUARD ×${hs}`,
      };
      const pills = [...(state.buffs || [])].map((b) =>
        `<span class="fd-buff"${b === 'TAIL_GUARD' && warn ? ' style="color:#ff7a6a;border-color:#ff7a6a;"' : ''}>${label[b] || b}</span>`);
      if (fr > 0) pills.push(`<span class="fd-buff" style="color:#ff9a6a;border-color:#ff7a4a;">${ico('fire-silhouette')} FIRE ×${fr}</span>`);
      this.buffsEl.innerHTML = pills.join('');
    }

    // --- Radar ---
    if (state.radar) this._drawRadar(state.radar);
  }

  // Static grid rings + crosshair — drawn once into an offscreen canvas (see
  // ctor) since nothing about them changes frame to frame.
  _drawRadarGrid(ctx) {
    const s = this._radarSize, c = s / 2;
    ctx.strokeStyle = '#4fe0b033'; ctx.lineWidth = 1;
    for (let i = 1; i <= 2; i++) { ctx.beginPath(); ctx.arc(c, c, (c - 8) * i / 2, 0, Math.PI * 2); ctx.stroke(); }
    ctx.beginPath(); ctx.moveTo(c, 8); ctx.lineTo(c, s - 8);
    ctx.moveTo(8, c); ctx.lineTo(s - 8, c); ctx.stroke();
  }

  // Canvas sweep radar: player-centred, rotated so the player's facing is "up".
  // Enemies = red blips (boss bigger), caged animals = amber, freed/safe = green.
  // Redrawn at ~30 Hz — blips and the sweep tolerate 33 ms of staleness, and on
  // 60 Hz+ displays that halves the canvas work. The sweep advances by elapsed
  // time (not per-draw), so it spins at the same rate on every refresh rate.
  _drawRadar(r) {
    const now = performance.now();
    const elapsed = now - this._radarLast;
    if (elapsed < 33) return;
    this._radarLast = now;
    const ctx = this.rctx, s = this._radarSize, c = s / 2;
    const range = this._radarRange, scale = (c - 8) / range;
    ctx.clearRect(0, 0, s, s);
    ctx.drawImage(this._radarBg, 0, 0, s, s);

    // Rotating sweep wedge.
    this._sweep = (this._sweep + (elapsed / 1000) * 2.7) % (Math.PI * 2);
    ctx.save();
    ctx.translate(c, c); ctx.rotate(this._sweep);
    ctx.fillStyle = this._sweepGrad;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, c - 8, -Math.PI / 2 - 0.35, -Math.PI / 2 + 0.02); ctx.closePath();
    ctx.fill();
    ctx.restore();

    // facing: yaw where forward = (sin f, cos f) in world (x,z).
    const f = r.facing || 0, sinF = Math.sin(f), cosF = Math.cos(f);
    const plot = (ex, ez) => {
      const dx = ex - r.px, dz = ez - r.pz;
      let rx = dx * cosF - dz * sinF;       // right component
      let ry = dx * sinF + dz * cosF;       // ahead component (→ screen up)
      let px = rx * scale, py = -ry * scale;
      const d = Math.hypot(px, py), max = c - 8;
      let clamped = false;
      if (d > max) { const k = max / d; px *= k; py *= k; clamped = true; }
      return { x: c + px, y: c + py, clamped };
    };
    const blip = (x, y, col, rad, faint) => {
      ctx.globalAlpha = faint ? 0.5 : 1;
      ctx.fillStyle = col;
      ctx.shadowColor = col; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    };

    // Animals.
    for (const a of r.animals || []) {
      if (!a || a.removeMe) continue;
      const caged = a.state === 'CAGED';
      const p = plot(a.position.x, a.position.z);
      blip(p.x, p.y, caged ? '#ffcc3a' : '#7fe0a0', caged ? 3.2 : 2.6, p.clamped);
    }
    // Enemies.
    for (const e of r.enemies || []) {
      if (!e || e.dead) continue;
      const p = plot(e.position.x, e.position.z);
      const boss = (e.hitRadius || 0) > 1;
      blip(p.x, p.y, boss ? '#ff9a3a' : '#ff4d4d', boss ? 4 : 2.8, p.clamped);
    }

    // Player arrow (pointing up).
    ctx.fillStyle = '#7fe3ff';
    ctx.shadowColor = '#7fe3ff'; ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(c, c - 6); ctx.lineTo(c - 4.5, c + 5); ctx.lineTo(c, c + 2.5); ctx.lineTo(c + 4.5, c + 5);
    ctx.closePath(); ctx.fill();
    ctx.shadowBlur = 0;
  }
}

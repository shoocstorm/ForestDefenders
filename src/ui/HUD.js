// DOM HUD overlay (HUD_SPEC §2–3). M2 scope: vitals (HP bar + gold), a weapon
// readout, an enemies-remaining counter, a centre crosshair, plus a damage
// vignette and gold-pulse flourish. Wave/mission/score widgets arrive in M3.
export class HUD {
  constructor() {
    const root = document.createElement('div');
    root.style.cssText =
      'position:fixed;inset:0;z-index:22;pointer-events:none;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;color:#eaf7df;';
    root.innerHTML = `
      <style>
        .fd-panel{position:absolute;background:#0b1410aa;border:1px solid #ffffff22;
          border-radius:12px;padding:10px 14px;backdrop-filter:blur(4px);
          box-shadow:0 4px 18px #0006;text-shadow:0 1px 3px #000c;}
        .fd-hpwrap{width:180px;height:16px;background:#00000055;border-radius:8px;
          overflow:hidden;border:1px solid #ffffff22;margin-top:4px;}
        .fd-hp{height:100%;width:100%;background:linear-gradient(90deg,#76d35a,#a8e063);
          transition:width .18s ease,background .3s;}
        .fd-label{font-size:12px;letter-spacing:1px;opacity:.8;}
        .fd-gold{color:#ffd24a;font-size:20px;font-weight:800;}
        .fd-gold.pulse{animation:fdpulse .35s ease;}
        @keyframes fdpulse{0%{transform:scale(1)}40%{transform:scale(1.35)}100%{transform:scale(1)}}
        #fd-cross{position:absolute;left:50%;top:50%;width:18px;height:18px;
          transform:translate(-50%,-50%);}
        #fd-cross::before,#fd-cross::after{content:"";position:absolute;background:#eaf7dfcc;
          box-shadow:0 0 3px #000a;}
        #fd-cross::before{left:8px;top:0;width:2px;height:18px;}
        #fd-cross::after{top:8px;left:0;height:2px;width:18px;}
        #fd-dot{position:absolute;left:50%;top:50%;width:4px;height:4px;border-radius:50%;
          background:#ff5a5a;transform:translate(-50%,-50%);box-shadow:0 0 4px #000;}
        #fd-vignette{position:absolute;inset:0;pointer-events:none;opacity:0;
          box-shadow:inset 0 0 160px 40px #c01818;transition:opacity .1s;}
      </style>
      <div id="fd-vignette"></div>
      <div class="fd-panel" style="top:14px;left:14px;">
        <div class="fd-label">HP <span id="fd-hpnum">100</span></div>
        <div class="fd-hpwrap"><div class="fd-hp" id="fd-hpbar"></div></div>
        <div style="margin-top:8px;"><span class="fd-label">GOLD</span>
          <span class="fd-gold" id="fd-gold" style="display:inline-block;">0</span></div>
      </div>
      <div class="fd-panel" style="top:14px;right:14px;text-align:right;">
        <div class="fd-label">ENEMIES</div>
        <div style="font-size:22px;font-weight:800;" id="fd-enemies">0</div>
        <div class="fd-label" style="margin-top:4px;">KILLS <span id="fd-kills">0</span></div>
      </div>
      <div class="fd-panel" style="bottom:46px;right:14px;text-align:right;">
        <div style="font-size:16px;font-weight:800;" id="fd-weapon">Acorn Gun</div>
        <div class="fd-label">AMMO <span id="fd-ammo">&infin;</span> &middot; NATURE</div>
      </div>
      <div id="fd-cross"></div><div id="fd-dot"></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.hpBar = root.querySelector('#fd-hpbar');
    this.hpNum = root.querySelector('#fd-hpnum');
    this.goldEl = root.querySelector('#fd-gold');
    this.enemiesEl = root.querySelector('#fd-enemies');
    this.killsEl = root.querySelector('#fd-kills');
    this.weaponEl = root.querySelector('#fd-weapon');
    this.vignette = root.querySelector('#fd-vignette');
    this._lastGold = 0;
  }

  pulseGold() {
    this.goldEl.classList.remove('pulse');
    void this.goldEl.offsetWidth; // restart animation
    this.goldEl.classList.add('pulse');
  }

  flashDamage() {
    this.vignette.style.opacity = '0.85';
    setTimeout(() => { this.vignette.style.opacity = '0'; }, 90);
  }

  update(state) {
    const pct = Math.max(0, Math.min(1, state.hp / state.maxHp));
    this.hpBar.style.width = (pct * 100) + '%';
    this.hpNum.textContent = Math.ceil(state.hp);
    this.hpBar.style.background = pct > 0.5
      ? 'linear-gradient(90deg,#76d35a,#a8e063)'
      : pct > 0.25
        ? 'linear-gradient(90deg,#d6c14a,#e8d35a)'
        : 'linear-gradient(90deg,#d35a5a,#ff7a6a)';
    if (state.gold !== this._lastGold) {
      this.goldEl.textContent = state.gold.toLocaleString();
      this._lastGold = state.gold;
    }
    this.enemiesEl.textContent = state.enemies;
    this.killsEl.textContent = state.kills;
    this.weaponEl.textContent = state.weapon;
  }
}

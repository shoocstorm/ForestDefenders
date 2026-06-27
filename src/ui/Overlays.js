// Victory / defeat overlay screens (HUD_SPEC §4). Glass panels with a slam-in
// animation; both offer a Retry/Continue that calls back into Game.resetLevel.
export class Overlays {
  constructor(onRestart) {
    this.onRestart = onRestart;
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;color:#eaf7df;';
    this.root.innerHTML = `
      <style>
        #ov-bg{position:absolute;inset:0;background:radial-gradient(circle at 50% 40%,#0b1410cc,#000000ee);}
        #ov-panel{position:relative;min-width:340px;max-width:90vw;padding:28px 36px;text-align:center;
          background:#14241bf2;border:1px solid #ffffff22;border-radius:18px;
          box-shadow:0 20px 60px #000a, inset 0 0 40px #00000040;}
        #ov-panel h1{font-size:38px;letter-spacing:1px;text-shadow:0 3px 0 #0008,0 0 18px currentColor;margin-bottom:6px;}
        #ov-stars{font-size:40px;letter-spacing:8px;margin:6px 0 12px;}
        .ov-stat{font-size:16px;opacity:.92;margin:3px 0;}
        .ov-stat b{color:#ffd24a;}
        #ov-rank{font-size:22px;font-weight:800;margin:10px 0;}
        #ov-btn{margin-top:18px;pointer-events:auto;cursor:pointer;display:inline-block;
          padding:12px 28px;font-size:18px;font-weight:800;color:#10240f;border:none;border-radius:30px;
          background:linear-gradient(90deg,#a8e063,#76d35a);box-shadow:0 6px 0 #4a7a2e,0 8px 16px #0006;}
        #ov-btn:active{transform:translateY(3px);box-shadow:0 3px 0 #4a7a2e;}
        @keyframes ovslam{0%{transform:translateY(-120%) scale(.6);}60%{transform:translateY(8%) scale(1.04);}
          80%{transform:translateY(-2%) scale(.99);}100%{transform:translateY(0) scale(1);}}
        #ov-panel.in{animation:ovslam .5s cubic-bezier(.2,.8,.3,1.2) both;}
      </style>
      <div id="ov-bg"></div>
      <div id="ov-panel">
        <h1 id="ov-title">LEVEL 1 CLEAR!</h1>
        <div id="ov-stars"></div>
        <div id="ov-body"></div>
        <div id="ov-rank"></div>
        <button id="ov-btn">CONTINUE</button>
      </div>`;
    document.body.appendChild(this.root);
    this.panel = this.root.querySelector('#ov-panel');
    this.title = this.root.querySelector('#ov-title');
    this.stars = this.root.querySelector('#ov-stars');
    this.body = this.root.querySelector('#ov-body');
    this.rankEl = this.root.querySelector('#ov-rank');
    this.btn = this.root.querySelector('#ov-btn');
    this.btn.addEventListener('click', () => { this.hide(); this.onRestart?.(); });
  }

  _show() {
    this.root.style.display = 'flex';
    this.panel.classList.remove('in'); void this.panel.offsetWidth; this.panel.classList.add('in');
  }
  hide() { this.root.style.display = 'none'; }

  showVictory(s) {
    this.title.textContent = 'LEVEL 1 CLEAR!';
    this.title.style.color = '#a8e063';
    this.stars.textContent = '★★★'.slice(0, s.stars).padEnd(3, '☆');
    this.stars.style.color = '#ffd24a';
    this.body.innerHTML =
      `<div class="ov-stat">Animals saved <b>${s.saved}/${s.total}</b></div>` +
      `<div class="ov-stat">Enemies defeated <b>${s.kills}</b></div>` +
      `<div class="ov-stat">Gold <b>${s.gold}</b> &nbsp;(+${s.bonus} rescue bonus)</div>`;
    this.rankEl.innerHTML = `RANK <span style="color:#ffd24a">${s.rank}</span>`;
    this.btn.textContent = 'PLAY AGAIN';
    this._show();
  }

  showDefeat(s) {
    this.title.textContent = '💀 DEFEATED';
    this.title.style.color = '#ff6a5a';
    this.stars.textContent = '';
    this.body.innerHTML =
      `<div class="ov-stat">You reached wave <b>${s.wave}/${s.total}</b></div>` +
      `<div class="ov-stat">Enemies defeated <b>${s.kills}</b></div>`;
    this.rankEl.textContent = '';
    this.btn.textContent = 'RETRY';
    this._show();
  }
}

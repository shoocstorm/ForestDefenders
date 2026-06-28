// Victory / defeat overlay screens (HUD_SPEC §4). Glass panels with a juicy,
// game-show entrance: a fade-blur backdrop, a slam-in panel wrapped in a rotating
// glow ring, a shine-swept title, stars that pop in one-by-one with sparkle
// bursts, staggered stat rows and a breathing call-to-action. Victory rains
// confetti; defeat shakes with a red ember pulse. Both offer a Retry/Continue
// that calls back into Game.resetLevel.
export class Overlays {
  constructor(onRestart, onShop) {
    this.onRestart = onRestart;
    this.onShop = onShop;
    this.root = document.createElement('div');
    this.root.style.cssText =
      'position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;' +
      'font-family:"Trebuchet MS",system-ui,sans-serif;color:#eaf7df;';
    this.root.innerHTML = `
      <style>
        #ov-bg{position:absolute;inset:0;opacity:0;
          background:radial-gradient(circle at 50% 40%,#0b1410cc,#000000ee);
          backdrop-filter:blur(0px);-webkit-backdrop-filter:blur(0px);}
        .ov-on #ov-bg{animation:ovbg .5s ease forwards;}
        @keyframes ovbg{to{opacity:1;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}}

        /* radial light rays behind the panel (victory only) */
        #ov-rays{position:absolute;width:160vmax;height:160vmax;left:50%;top:50%;
          margin:-80vmax 0 0 -80vmax;opacity:0;pointer-events:none;mix-blend-mode:screen;
          background:repeating-conic-gradient(from 0deg,#ffe08a14 0deg 7deg,#0000 7deg 18deg);}
        .ov-victory.ov-on #ov-rays{animation:ovrays 26s linear infinite,ovrayfade .8s ease .15s forwards;}
        @keyframes ovrays{to{transform:rotate(360deg);}}
        @keyframes ovrayfade{to{opacity:.5;}}

        /* glow ring wrapping the panel */
        #ov-wrap{position:relative;}
        #ov-wrap::before{content:"";position:absolute;inset:-3px;border-radius:21px;z-index:0;
          background:conic-gradient(from 0deg,#a8e063,#49e8ff,#ffd24a,#a8e063);
          filter:blur(10px);opacity:0;transition:opacity .4s;}
        .ov-on #ov-wrap::before{opacity:.85;animation:ovspin 6s linear infinite;}
        .ov-defeat.ov-on #ov-wrap::before{
          background:conic-gradient(from 0deg,#ff5a4a,#7a1414,#ff8a3a,#ff5a4a);opacity:.7;}
        @keyframes ovspin{to{transform:rotate(360deg);}}

        #ov-panel{position:relative;z-index:1;min-width:340px;max-width:90vw;padding:28px 36px;text-align:center;
          background:linear-gradient(160deg,#16281df5,#0c1812f8);border:1px solid #ffffff22;border-radius:18px;
          box-shadow:0 20px 60px #000a, inset 0 0 40px #00000040;overflow:hidden;}

        /* sweeping sheen across the panel */
        #ov-panel::after{content:"";position:absolute;top:0;left:-60%;width:50%;height:100%;
          background:linear-gradient(100deg,#0000,#ffffff1f 50%,#0000);transform:skewX(-18deg);opacity:0;}
        .ov-on #ov-panel::after{animation:ovsheen 1.1s ease .45s;}
        @keyframes ovsheen{0%{left:-60%;opacity:1;}100%{left:140%;opacity:1;}}

        #ov-panel h1{position:relative;font-size:38px;letter-spacing:1px;margin-bottom:6px;
          text-shadow:0 3px 0 #0008,0 0 18px currentColor;
          background:linear-gradient(90deg,currentColor,#fff,currentColor);
          background-size:220% 100%;-webkit-background-clip:text;background-clip:text;}
        .ov-on #ov-panel h1{animation:ovtitle .55s cubic-bezier(.2,.8,.3,1.3) both,ovshine 2.4s ease .5s infinite;}
        @keyframes ovtitle{0%{opacity:0;transform:translateY(-18px) scale(.7);}
          70%{transform:translateY(0) scale(1.08);}100%{opacity:1;transform:scale(1);}}
        @keyframes ovshine{0%,100%{background-position:120% 0;}50%{background-position:-120% 0;}}

        #ov-stars{font-size:40px;letter-spacing:8px;margin:6px 0 12px;min-height:46px;color:#ffd24a;}
        #ov-stars span{display:inline-block;transform:scale(0);}
        #ov-stars span.lit{animation:ovstar .5s cubic-bezier(.2,1.4,.4,1) forwards;}
        #ov-stars span.dim{opacity:.35;transform:scale(1);}
        @keyframes ovstar{0%{transform:scale(0) rotate(-120deg);}
          60%{transform:scale(1.45) rotate(8deg);}100%{transform:scale(1) rotate(0);}}

        .ov-stat{font-size:16px;opacity:0;margin:3px 0;}
        .ov-on .ov-stat{animation:ovrow .45s ease both;}
        .ov-stat b{color:#ffd24a;}
        @keyframes ovrow{from{opacity:0;transform:translateX(-14px);}to{opacity:.92;transform:none;}}

        #ov-rank{font-size:22px;font-weight:800;margin:10px 0;opacity:0;}
        .ov-on #ov-rank{animation:ovpop .5s cubic-bezier(.2,1.5,.4,1) .9s both;}
        @keyframes ovpop{0%{opacity:0;transform:scale(.4);}60%{transform:scale(1.18);}100%{opacity:1;transform:scale(1);}}

        #ov-btns{display:flex;gap:12px;justify-content:center;flex-wrap:wrap;}
        #ov-levelup{font-size:14px;font-weight:800;letter-spacing:1px;color:#7fe3ff;margin:6px 0 2px;
          opacity:0;text-shadow:0 0 12px #49e8ff66;min-height:0;}
        #ov-levelup.show{opacity:1;animation:ovpop .5s cubic-bezier(.2,1.5,.4,1) 1.0s both;}
        #ov-shop{position:relative;margin-top:18px;pointer-events:auto;cursor:pointer;display:inline-block;
          padding:12px 22px;font-size:16px;font-weight:800;color:#10240f;border:none;border-radius:30px;
          background:linear-gradient(90deg,#ffd24a,#f0b13a);box-shadow:0 6px 0 #a87a1e,0 8px 16px #0006;
          opacity:0;transition:transform .12s,box-shadow .12s,filter .2s;}
        .ov-on #ov-shop{animation:ovpop .45s cubic-bezier(.2,1.5,.4,1) 1.0s both;}
        #ov-shop:hover{filter:brightness(1.1);transform:translateY(-2px);}
        #ov-shop:active{transform:translateY(3px);box-shadow:0 3px 0 #a87a1e;}
        .ov-defeat #ov-shop{display:none;}
        #ov-btn{position:relative;margin-top:18px;pointer-events:auto;cursor:pointer;display:inline-block;
          padding:12px 28px;font-size:18px;font-weight:800;color:#10240f;border:none;border-radius:30px;
          background:linear-gradient(90deg,#a8e063,#76d35a);box-shadow:0 6px 0 #4a7a2e,0 8px 16px #0006;
          opacity:0;transition:transform .12s,box-shadow .12s,filter .2s;}
        .ov-on #ov-btn{animation:ovpop .45s cubic-bezier(.2,1.5,.4,1) 1.05s both,
          ovbreathe 2.2s ease-in-out 1.5s infinite;}
        #ov-btn:hover{filter:brightness(1.12);transform:translateY(-2px);box-shadow:0 8px 0 #4a7a2e,0 12px 22px #0007;}
        #ov-btn:active{transform:translateY(3px);box-shadow:0 3px 0 #4a7a2e;}
        .ov-defeat #ov-btn{background:linear-gradient(90deg,#ff8a5a,#ff5a4a);box-shadow:0 6px 0 #7a2a1e,0 8px 16px #0006;}
        .ov-defeat #ov-btn:hover{box-shadow:0 8px 0 #7a2a1e,0 12px 22px #0007;}
        .ov-defeat #ov-btn:active{box-shadow:0 3px 0 #7a2a1e;}
        @keyframes ovbreathe{0%,100%{box-shadow:0 6px 0 #4a7a2e,0 8px 16px #0006,0 0 0 #a8e06300;}
          50%{box-shadow:0 6px 0 #4a7a2e,0 8px 24px #0007,0 0 26px #a8e06366;}}

        /* entrance / defeat motion on the wrapper */
        .ov-victory.ov-on #ov-wrap{animation:ovslam .55s cubic-bezier(.2,.8,.3,1.2) both;}
        .ov-defeat.ov-on #ov-wrap{animation:ovcrash .5s ease both,ovshake .5s ease .5s;}
        @keyframes ovslam{0%{transform:translateY(-120%) scale(.6);}60%{transform:translateY(8%) scale(1.04);}
          80%{transform:translateY(-2%) scale(.99);}100%{transform:translateY(0) scale(1);}}
        @keyframes ovcrash{0%{transform:scale(1.6);opacity:0;}55%{transform:scale(.94);opacity:1;}100%{transform:scale(1);}}
        @keyframes ovshake{0%,100%{transform:translateX(0);}15%{transform:translateX(-9px);}
          30%{transform:translateX(8px);}45%{transform:translateX(-6px);}60%{transform:translateX(4px);}75%{transform:translateX(-2px);}}

        /* confetti + sparkle particles */
        #ov-confetti{position:absolute;inset:0;overflow:hidden;pointer-events:none;}
        .ov-confetti{position:absolute;top:-12px;width:9px;height:14px;border-radius:2px;opacity:0;
          will-change:transform,opacity;}
        @keyframes ovfall{0%{opacity:0;transform:translateY(-10vh) rotate(0);}
          8%{opacity:1;}100%{opacity:.9;transform:translateY(108vh) rotate(720deg);}}
        .ov-spark{position:absolute;width:6px;height:6px;border-radius:50%;background:#fff;
          box-shadow:0 0 8px #ffe08a;pointer-events:none;opacity:0;}
        @keyframes ovsparkle{0%{opacity:1;transform:scale(.2);}100%{opacity:0;transform:scale(2.4);}}

        @media (prefers-reduced-motion:reduce){
          #ov-bg,#ov-wrap,#ov-panel h1,#ov-stars span,.ov-stat,#ov-rank,#ov-btn,#ov-wrap::before,#ov-rays{
            animation-duration:.01ms!important;animation-iteration-count:1!important;}
        }
      </style>
      <div id="ov-bg"></div>
      <div id="ov-rays"></div>
      <div id="ov-confetti"></div>
      <div id="ov-wrap">
        <div id="ov-panel">
          <h1 id="ov-title">LEVEL 1 CLEAR!</h1>
          <div id="ov-stars"></div>
          <div id="ov-body"></div>
          <div id="ov-rank"></div>
          <div id="ov-levelup"></div>
          <div id="ov-btns">
            <button id="ov-shop">🦉 VISIT SHOP</button>
            <button id="ov-btn">CONTINUE</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(this.root);
    this.panel = this.root.querySelector('#ov-panel');
    this.title = this.root.querySelector('#ov-title');
    this.stars = this.root.querySelector('#ov-stars');
    this.body = this.root.querySelector('#ov-body');
    this.rankEl = this.root.querySelector('#ov-rank');
    this.levelupEl = this.root.querySelector('#ov-levelup');
    this.btn = this.root.querySelector('#ov-btn');
    this.shopBtn = this.root.querySelector('#ov-shop');
    this.confetti = this.root.querySelector('#ov-confetti');
    this.btn.addEventListener('click', () => { this.hide(); this.onRestart?.(); });
    // Shop opens over the victory screen and stays up until the player closes it.
    this.shopBtn.addEventListener('click', () => this.onShop?.());
  }

  _show(kind) {
    this.root.style.display = 'flex';
    // Restart every CSS animation by reflowing with the mode classes off → on.
    this.root.classList.remove('ov-on', 'ov-victory', 'ov-defeat');
    void this.root.offsetWidth;
    this.root.classList.add('ov-on', kind === 'victory' ? 'ov-victory' : 'ov-defeat');
  }

  hide() {
    this.root.style.display = 'none';
    this.root.classList.remove('ov-on', 'ov-victory', 'ov-defeat');
    this.confetti.innerHTML = '';
  }

  // Stagger the stat rows so they cascade in beneath the title.
  _staggerBody() {
    [...this.body.children].forEach((el, i) => { el.style.animationDelay = (0.55 + i * 0.12) + 's'; });
  }

  // Pop the stars in one at a time, firing a sparkle burst as each lights up.
  _renderStars(count) {
    this.stars.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      const lit = i < count;
      s.textContent = lit ? '★' : '☆';
      s.className = lit ? 'lit' : 'dim';
      if (lit) {
        s.style.animationDelay = (0.6 + i * 0.22) + 's';
        setTimeout(() => this._sparkle(s), (600 + i * 220 + 120));
      }
      this.stars.appendChild(s);
    }
  }

  // A small ring of fading sparks around an element's centre.
  _sparkle(target) {
    const tr = target.getBoundingClientRect();
    const rr = this.root.getBoundingClientRect();
    const cx = tr.left + tr.width / 2 - rr.left, cy = tr.top + tr.height / 2 - rr.top;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2, dist = 22 + Math.random() * 14;
      const p = document.createElement('div');
      p.className = 'ov-spark';
      p.style.left = cx + 'px'; p.style.top = cy + 'px';
      p.style.transform = `translate(${Math.cos(a) * dist}px,${Math.sin(a) * dist}px)`;
      p.style.animation = 'ovsparkle .55s ease-out forwards';
      this.confetti.appendChild(p);
      setTimeout(() => p.remove(), 600);
    }
  }

  // Rain a burst of confetti from the top of the screen.
  _confettiBurst(n = 90) {
    const colors = ['#a8e063', '#49e8ff', '#ffd24a', '#ff7a9a', '#b48aff', '#76d35a'];
    for (let i = 0; i < n; i++) {
      const c = document.createElement('div');
      c.className = 'ov-confetti';
      c.style.left = Math.random() * 100 + '%';
      c.style.background = colors[(Math.random() * colors.length) | 0];
      if (Math.random() < 0.4) c.style.borderRadius = '50%';
      const dur = 2.4 + Math.random() * 2.2, delay = Math.random() * 0.9;
      c.style.animation = `ovfall ${dur}s linear ${delay}s forwards`;
      c.style.transform = `scale(${0.7 + Math.random() * 0.8})`;
      this.confetti.appendChild(c);
      setTimeout(() => c.remove(), (dur + delay) * 1000 + 200);
    }
  }

  showVictory(s) {
    this.title.textContent = 'LEVEL 1 CLEAR!';
    this.title.style.color = '#a8e063';
    this._renderStars(s.stars);
    this.body.innerHTML =
      `<div class="ov-stat">Animals saved <b>${s.saved}/${s.total}</b></div>` +
      `<div class="ov-stat">Enemies defeated <b>${s.kills}</b></div>` +
      `<div class="ov-stat">Gold <b>${s.gold}</b> &nbsp;(+${s.bonus} rescue bonus)</div>`;
    this._staggerBody();
    this.rankEl.innerHTML = `RANK <span style="color:#ffd24a">${s.rank}</span>`;
    this.levelupEl.textContent = s.leveledUp ? `⬆ LEVEL UP! You are now level ${s.playerLevel}` : '';
    this.levelupEl.classList.toggle('show', !!s.leveledUp);
    this.btn.textContent = 'PLAY AGAIN';
    this._show('victory');
    this.confetti.innerHTML = '';
    this._confettiBurst();
  }

  showDefeat(s) {
    this.title.textContent = '💀 DEFEATED';
    this.title.style.color = '#ff6a5a';
    this.stars.innerHTML = '';
    this.body.innerHTML =
      `<div class="ov-stat">You reached wave <b>${s.wave}/${s.total}</b></div>` +
      `<div class="ov-stat">Enemies defeated <b>${s.kills}</b></div>`;
    this._staggerBody();
    this.rankEl.textContent = '';
    this.levelupEl.textContent = ''; this.levelupEl.classList.remove('show');
    this.btn.textContent = 'RETRY';
    this._show('defeat');
    this.confetti.innerHTML = '';
  }
}

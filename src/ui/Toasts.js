// Lightweight toast queue for achievement unlocks + weapon unlocks (HUD_SPEC).
// Stacks cards top-centre that slide in, glow, and auto-dismiss. Pointer-none so
// it never eats clicks. Kept separate from the combat HUD to avoid bloating it.
export class Toasts {
  constructor() {
    const root = document.createElement('div');
    root.id = 'fd-toasts';
    root.innerHTML = `
      <style>
        #fd-toasts{position:fixed;top:84px;left:50%;transform:translateX(-50%);z-index:30;
          display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;
          font-family:"Rajdhani","Trebuchet MS",system-ui,sans-serif;}
        .fd-toast{display:flex;align-items:center;gap:12px;min-width:280px;max-width:380px;
          padding:11px 18px;border-radius:13px;color:#eaf7df;
          background:linear-gradient(160deg,#16281df2,#0b1610f6);
          border:1px solid var(--tc,#ffd24a);
          box-shadow:0 8px 30px #000a, 0 0 24px -6px var(--tc,#ffd24a);
          text-shadow:0 1px 3px #000c;opacity:0;transform:translateY(-16px) scale(.92);
          animation:fdtin .4s cubic-bezier(.2,1.3,.4,1) forwards;}
        .fd-toast.out{animation:fdtout .35s ease forwards;}
        @keyframes fdtin{to{opacity:1;transform:none;}}
        @keyframes fdtout{to{opacity:0;transform:translateY(-12px) scale(.94);}}
        .fd-toast .ic{font-size:28px;filter:drop-shadow(0 0 8px var(--tc,#ffd24a));flex:none;}
        .fd-toast .tx{display:flex;flex-direction:column;line-height:1.2;}
        .fd-toast .kicker{font-size:10px;letter-spacing:2.5px;font-weight:800;text-transform:uppercase;
          color:var(--tc,#ffd24a);opacity:.95;}
        .fd-toast .name{font-size:17px;font-weight:800;color:#fff;}
        .fd-toast .desc{font-size:12px;opacity:.8;}
        @media (prefers-reduced-motion:reduce){.fd-toast,.fd-toast.out{animation-duration:.01ms!important;}}
      </style>`;
    document.body.appendChild(root);
    this.root = root;
  }

  // kind: { kicker, name, desc, icon, color }
  show({ kicker = 'UNLOCKED', name, desc = '', icon = '⭐', color = '#ffd24a', ttl = 4200 }) {
    const el = document.createElement('div');
    el.className = 'fd-toast';
    el.style.setProperty('--tc', color);
    el.innerHTML =
      `<span class="ic">${icon}</span>` +
      `<span class="tx"><span class="kicker">${kicker}</span>` +
      `<span class="name">${name}</span>${desc ? `<span class="desc">${desc}</span>` : ''}</span>`;
    this.root.appendChild(el);
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 400);
    }, ttl);
  }

  achievement(a) {
    this.show({ kicker: 'Achievement', name: a.name, desc: a.desc, icon: a.icon, color: a.color });
  }
  weapon(name, hint = '') {
    this.show({ kicker: 'Weapon Unlocked', name, desc: hint, icon: '🔫', color: '#9fe35a' });
  }
  levelUp(level) {
    this.show({ kicker: 'Level Up', name: `Level ${level}`, desc: '+20 max HP · +15% damage · full heal', icon: '⬆', color: '#49e8ff' });
  }
}

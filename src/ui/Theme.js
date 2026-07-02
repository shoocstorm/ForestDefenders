// Shared sci-fi UI theme (skin layer). The in-game screens (Overlays, Shop,
// PauseMenu, Settings, AchievementViewer, Backpack) were each authored with a
// forest-green glass look. Rather than rewrite every bespoke style block, this
// module injects ONE stylesheet that re-skins them to match the arena's sci-fi
// tech reskin: dark metallic blue-black panels, holographic cyan energy accents,
// amber credits and red danger. Overrides are `body`-prefixed so they out-rank
// each component's own id/class rules regardless of injection order.
//
// Design tokens live on :root so future screens can opt in with var(--fd-*).
// The skin adds three reusable tech flourishes to every panel: subtle CRT
// scanlines (baked into the panel background), a glowing top edge line, and
// crisp cyan corner brackets (panel ::before).

let injected = false;

export function injectTheme() {
  if (injected) return;
  injected = true;
  const style = document.createElement('style');
  style.id = 'fd-theme';
  style.textContent = CSS;
  document.head.appendChild(style);
}

const CSS = `
:root{
  --fd-font:"Rajdhani","Trebuchet MS",system-ui,sans-serif;
  --fd-ink:#d6ecff;            /* primary text */
  --fd-ink-dim:#86a8c6;        /* muted labels */
  --fd-cyan:#4fe3ff;           /* primary energy accent */
  --fd-cyan-2:#1f8fcf;         /* gradient end / darker cyan */
  --fd-cyan-deep:#0a4a63;      /* chunky button drop-shadow */
  --fd-cyan-ink:#042430;       /* dark text on a cyan button */
  --fd-gold:#ffd24a;           /* currency / credits */
  --fd-gold-2:#ffb347;
  --fd-gold-ink:#3a2400;
  --fd-danger:#ff4d5e;
  --fd-danger-deep:#5e0f1a;
  --fd-backdrop:radial-gradient(circle at 50% 36%,#0a1726ee,#02060cf6);
  --fd-panel:repeating-linear-gradient(0deg,#7fd8ff07 0 1px,#0000 1px 3px),
             linear-gradient(158deg,#0f1d2cf6,#060d17fb);
  --fd-panel-2:linear-gradient(158deg,#0e1b29cc,#070f19bb);
  --fd-sunk:#06121d;           /* sunken slot / track bg */
  --fd-edge:#4fe3ff3a;         /* hairline border */
  --fd-edge-soft:#4fe3ff1f;
  --fd-glow:#4fe3ff;
}

/* ---- holographic grid + scan, reusable by any screen ---- */
@keyframes fd-grid-pan{to{background-position:0 44px,44px 0;}}
@keyframes fd-scan{to{transform:translateY(100%);}}
@keyframes fd-flicker{0%,100%{opacity:1;}48%{opacity:1;}50%{opacity:.72;}52%{opacity:1;}}

/* ===================================================================
   Generic skin shared by every overlay screen
   =================================================================== */
body #ov-bg,body #shop-bg,body #pause-bg,
body #stg-bg,body #ach-bg,body #bp-bg{
  background:var(--fd-backdrop)!important;}

/* full-screen holo grid behind the panels (drawn on each backdrop) */
body #shop-bg::after,body #pause-bg::after,body #stg-bg::after,
body #ach-bg::after,body #bp-bg::after{
  content:"";position:absolute;inset:0;pointer-events:none;opacity:.5;
  background:
    linear-gradient(#4fe3ff14 1px,#0000 1px) 0 0/44px 44px,
    linear-gradient(90deg,#4fe3ff14 1px,#0000 1px) 0 0/44px 44px;
  -webkit-mask-image:radial-gradient(circle at 50% 42%,#000 0,#0000 72%);
  mask-image:radial-gradient(circle at 50% 42%,#000 0,#0000 72%);
  animation:fd-grid-pan 9s linear infinite;}

/* panels: metal-glass + scanlines + cyan rim + inner glow */
body #shop-panel,body #pause-panel,body #stg-panel,
body #ach-panel,body #bp-panel,body #ov-panel{
  background:var(--fd-panel)!important;
  border:1px solid var(--fd-edge)!important;
  border-radius:4px!important;
  box-shadow:0 30px 80px #000d,0 0 0 1px #4fe3ff10,
    0 0 34px -6px #4fe3ff40,inset 0 0 44px #03111c90,
    inset 0 1px 0 #8fe6ff33!important;}

/* glowing top edge bar */
body #shop-panel,body #pause-panel,body #stg-panel,
body #ach-panel,body #bp-panel{position:relative;}
body #shop-panel::after,body #stg-panel::after,
body #ach-panel::after,body #bp-panel::after{
  content:"";position:absolute;top:0;left:18%;right:18%;height:2px;pointer-events:none;
  background:linear-gradient(90deg,#0000,#4fe3ff,#0000);
  box-shadow:0 0 12px #4fe3ffaa;z-index:5;}

/* cyan corner brackets on every panel */
body #shop-panel::before,body #pause-panel::before,body #stg-panel::before,
body #ach-panel::before,body #bp-panel::before,body #ov-panel::before{
  content:"";position:absolute;inset:7px;pointer-events:none;z-index:4;opacity:.85;
  background:
    linear-gradient(#4fe3ff,#4fe3ff) left top/16px 2px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) left top/2px 16px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) right top/16px 2px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) right top/2px 16px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) left bottom/16px 2px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) left bottom/2px 16px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) right bottom/16px 2px no-repeat,
    linear-gradient(#4fe3ff,#4fe3ff) right bottom/2px 16px no-repeat;
  filter:drop-shadow(0 0 4px #4fe3ff88);}

/* section dividers + inner section cards → cool steel */
body #shop-head,body #stg-head,body #ach-head,body #bp-head,
body #shop-foot,body #stg-foot,body #ach-foot,body #bp-foot,
body #stg-foot,body #shop-foot{border-color:#4fe3ff24!important;}
body .bp-section{background:var(--fd-panel-2)!important;border-color:#4fe3ff22!important;}
body .ach-card{background:var(--fd-panel-2)!important;border-color:#4fe3ff20!important;}

/* titles */
body #shop-title,body #pause-title,body #stg-title,
body #ach-title,body #bp-title{
  color:var(--fd-cyan)!important;
  text-shadow:0 2px 0 #0008,0 0 20px #4fe3ff66!important;
  text-transform:uppercase!important;}
body #pause-title{animation:fd-flicker 5s steps(1) infinite;}
body #shop-title small,body #ach-summary{color:#7fd8ff!important;}

/* muted label text → cool steel */
body .stg-label,body .stg-row-name,body .stg-hint,
body .bp-section-title,body .bp-stat-label,body .bp-upgrade-name,
body .bp-res-label,body .bp-progress-label,body .pause-stat,
body .ach-desc{color:var(--fd-ink-dim)!important;}

/* ---- primary (cyan) buttons shared across screens ---- */
body #shop-close,body #stg-save,body #ach-close-btn,
body #bp-close-btn,body #ov-btn,body .pause-btn.primary{
  color:var(--fd-cyan-ink)!important;
  background:linear-gradient(90deg,#7defff,#1f9fdf)!important;
  box-shadow:0 5px 0 var(--fd-cyan-deep),0 7px 16px #0007,
    0 0 20px -4px #4fe3ff88!important;
  border:none!important;}
body #shop-close:active,body #stg-save:active,body #ach-close-btn:active,
body #bp-close-btn:active{box-shadow:0 2px 0 var(--fd-cyan-deep)!important;}

/* close "✕" glyphs */
body #stg-close,body #ach-close,body #bp-close{color:#7fd8ff!important;}

/* ===================================================================
   Per-screen accents
   =================================================================== */

/* --- Shop --- */
body .shop-card{background:var(--fd-panel-2)!important;border-color:#4fe3ff20!important;}
body .shop-card:hover{border-color:#4fe3ff99!important;
  box-shadow:0 12px 28px -8px #000b,0 0 22px -4px #4fe3ff77!important;}
body .shop-card .nm{color:#eaffff!important;}
body .shop-card .tier{color:#9fd8ff!important;}
body .shop-tab{background:#0a1622aa!important;border-color:#4fe3ff1c!important;color:#7fa6c8!important;}
body .shop-tab.active{background:#10283a!important;color:#fff!important;
  box-shadow:0 -2px 16px -4px #4fe3ffaa!important;}

/* --- Pause menu --- */
body .pause-btn{background:#0a1726cc!important;border:1px solid #4fe3ff2a!important;
  color:var(--fd-ink)!important;border-radius:3px!important;
  clip-path:polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)!important;}
body .pause-btn:hover{background:#102536!important;border-color:#4fe3ff99!important;
  box-shadow:inset 0 0 18px -6px #4fe3ffaa!important;}
body .pause-btn.primary{border:none!important;}
body .pause-btn.primary:hover{color:var(--fd-cyan-ink)!important;
  background:linear-gradient(90deg,#9df3ff,#37b0ec)!important;
  box-shadow:0 5px 0 var(--fd-cyan-deep),0 7px 16px #0007,
    0 0 24px -3px #4fe3ffaa!important;}
body .pause-btn.warn{border-color:#ffb34766!important;}
body .pause-btn.warn:hover{border-color:#ffb347!important;background:#ffb34714!important;}
body .pause-btn.danger{border-color:#ff4d5e66!important;}
body .pause-btn.danger:hover{border-color:#ff4d5e!important;background:#ff4d5e14!important;}
body #pause-hint{color:#7fa6c8!important;}

/* --- Settings --- */
body .stg-slider{background:var(--fd-sunk)!important;}
body .stg-slider::-webkit-slider-thumb{background:linear-gradient(135deg,#7defff,#1f9fdf)!important;
  box-shadow:0 0 10px #4fe3ffaa!important;}
body .stg-slider::-moz-range-thumb{background:linear-gradient(135deg,#7defff,#1f9fdf)!important;}
body .stg-toggle{background:#0a1726cc!important;border-color:#4fe3ff2a!important;color:#7fa6c8!important;}
body .stg-toggle.on{background:linear-gradient(90deg,#7defff,#1f9fdf)!important;
  border-color:#4fe3ff!important;color:var(--fd-cyan-ink)!important;}
body .stg-val{color:var(--fd-gold)!important;}

/* --- Achievements --- */
body .ach-cat{background:#0a1622aa!important;border-color:#4fe3ff14!important;color:#7fa6c8!important;}
body .ach-cat.active{background:#10283a!important;color:#fff!important;
  box-shadow:0 -2px 14px -4px #4fe3ff88!important;}
body .ach-card.unlocked{border-color:#4fe3ff55!important;box-shadow:0 0 18px -6px #4fe3ff44!important;}
body .ach-bar{background:var(--fd-sunk)!important;}
body .ach-fill{background:linear-gradient(90deg,#4fe3ff,#1f8fcf)!important;}
body .ach-check{color:var(--fd-cyan)!important;}
body .ach-text{color:var(--fd-gold)!important;}

/* --- Backpack --- */
body .bp-stat,body .bp-upgrade,body .bp-weapon,
body .bp-resource,body .bp-progress-item{background:#0a1726aa!important;}
body .bp-weapon{border-color:#4fe3ff1c!important;}
body .bp-weapon.unlocked{border-color:#4fe3ff55!important;}
body .bp-wpn-check{color:var(--fd-cyan)!important;}
body .bp-upgrade-tier{color:var(--fd-gold)!important;}
body .bp-stat-value,body .bp-progress-value,body .bp-res-value,
body .bp-wpn-name{color:#eaffff!important;}

/* --- Overlays (victory / defeat) --- */
body #ov-panel{padding:30px 38px!important;}
/* recolour the rotating glow ring + button to energy cyan (victory) */
body .ov-on #ov-wrap::before{
  background:conic-gradient(from 0deg,#4fe3ff,#7defff,#1f8fcf,#4fe3ff)!important;}
body #ov-btn{background:linear-gradient(90deg,#7defff,#1f9fdf)!important;}
body #ov-btn:hover{box-shadow:0 8px 0 var(--fd-cyan-deep),0 12px 22px #0007!important;}
body #ov-btn:active{box-shadow:0 3px 0 var(--fd-cyan-deep)!important;}
body #ov-shop{color:var(--fd-gold-ink)!important;
  background:linear-gradient(90deg,#ffd98a,#f0a93a)!important;
  box-shadow:0 6px 0 #8a5e12,0 8px 16px #0006!important;}
body #ov-stat b,body #ov-rank span{color:var(--fd-gold)!important;}
body #ov-levelup{color:#7fe3ff!important;text-shadow:0 0 12px #4fe3ff77!important;}
/* victory light rays → cool cyan */
body #ov-rays{background:repeating-conic-gradient(from 0deg,#4fe3ff16 0deg 7deg,#0000 7deg 18deg)!important;}
`;

// Auto-inject on import so a bare `import './ui/Theme.js'` is enough.
injectTheme();

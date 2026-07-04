// On-screen touch controls for phones/tablets. A DOM overlay that translates
// finger gestures into the same virtual input the rest of the game already
// reads through `Input` (see Input.addLook / pressVirtual / touchAxis):
//   • left half  → dynamic-origin virtual joystick  → input.touchAxis (movement)
//   • right half → drag-to-look                       → input.addLook (camera)
//   • button cluster → one-shot taps                  → input.pressVirtual(code)
//   • fire button    → hold-to-fire (tap still fires) → input.setVirtualMouseDown/Up(0)
// Aim-assist auto-fires whenever an enemy is in the cone (input.autoFire);
// holding the fire button ORs on top of that, so charge/beam/rapid weapons
// still work under a thumb without fighting the auto-aim. The fire button is
// fire-only — it never triggers jump.
//
// Vitals (HP/Shield) are merged into a ring wrapped around the fire button
// instead of separate on-screen bars — see setVitals() — to keep the play
// area clear of chrome. HUD.js hides its own bars on touch to match.
//
// Multi-touch is tracked by Touch.identifier so moving, looking and tapping a
// button all work at the same time. Created only on touch devices via
// TouchControls.maybeCreate().

import { PLAYER } from '../config/Constants.js';

const LOOK_SENS = 1.3;     // multiplier on top of CAMERA.MOUSE_SENS (downstream)
const STICK_RADIUS = 56;   // px travel for full deflection
const TAIL_COOLDOWN_MS = PLAYER.TAIL_COOLDOWN * 1000;
const PRESS_FLASH_MS = 120; // minimum visible time for the tap "pressed" flash

export class TouchControls {
  // Returns a TouchControls on touch-capable devices, else null.
  static maybeCreate(input, callbacks) {
    const touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
    if (!touch) return null;
    return new TouchControls(input, callbacks);
  }

  constructor(input, callbacks = {}) {
    this.input = input;
    this.callbacks = callbacks;
    this.input.autoFire = true;

    this._stickId = null;     // touch id steering the joystick
    this._stickOrigin = { x: 0, y: 0 };
    this._lookId = null;      // touch id driving camera look
    this._lookLast = { x: 0, y: 0 };

    this._fireTouches = new Set(); // active touch ids currently holding the fire button
    this._lastHpDeg = -1; this._lastShDeg = -1; this._lastShActive = null;

    this._tailReadyAt = 0;    // performance.now() timestamp when the tail cooldown clears
    this._tailCdShown = -1;   // last drawn cooldown degrees (change-gated like the vitals rings)
    this._freeShown = null;   // last written FREE-button visibility (change-gated)

    this._build();
    this._bind();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'tc-root';
    root.innerHTML = `
      <style>
        #tc-root{position:fixed;inset:0;z-index:30;pointer-events:none;
          font-family:"Rajdhani","Trebuchet MS",system-ui,sans-serif;
          -webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent;}
        /* Full-screen gesture surface: joystick (left) + look (right). */
        #tc-surface{position:absolute;inset:0;pointer-events:auto;touch-action:none;}
        /* Joystick visuals (hidden until a finger lands). */
        #tc-stick{position:absolute;width:${STICK_RADIUS * 2}px;height:${STICK_RADIUS * 2}px;
          margin-left:-${STICK_RADIUS}px;margin-top:-${STICK_RADIUS}px;border-radius:50%;
          border:2px solid #cdebb655;background:radial-gradient(circle,#0e1a1255,#0e1a1222);
          opacity:0;transition:opacity .12s;pointer-events:none;}
        #tc-thumb{position:absolute;left:50%;top:50%;width:54px;height:54px;
          margin-left:-27px;margin-top:-27px;border-radius:50%;
          background:radial-gradient(circle,#a8e063cc,#5d8f3acc);
          box-shadow:0 2px 10px #000a;}
        /* Action buttons (bottom-right cluster + top-right utilities). Sized
           well above the ~44px touch-target minimum since these get tapped
           mid-combat, under thumb, without looking down. */
        .tc-btn{position:absolute;pointer-events:auto;touch-action:none;
          display:flex;align-items:center;justify-content:center;text-align:center;
          border-radius:50%;border:1px solid #ffffff2a;color:#eaf7df;
          background:linear-gradient(160deg,#0e1a12cc,#070d0aaa);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          box-shadow:0 4px 16px #0008, inset 0 1px 0 #ffffff18;
          font-weight:700;text-shadow:0 1px 3px #000c;line-height:1.05;}
        /* .pressed is a JS-driven twin of :active — touch-action:none can make
           :active fire late or not at all on some mobile browsers, so taps
           (Kick in particular) got no visible feedback. Toggled explicitly on
           touchstart with a minimum-visible timeout below. */
        .tc-btn:active,.tc-btn.pressed{transform:scale(.92);background:linear-gradient(160deg,#1c3a26ee,#0e1a12cc);}
        .tc-btn .lab{font-size:12px;letter-spacing:.5px;opacity:.85;}
        .tc-btn .ico{font-size:26px;}
        .tc-big{width:100px;height:100px;}
        .tc-big .ico{font-size:36px;}
        .tc-small{width:74px;height:74px;}
        .tc-med{width:92px;height:92px;flex-direction:column;gap:2px;}
        .tc-med .ico{font-size:34px;}
        .tc-med .lab{font-size:13px;}
        .tc-med.on-cooldown{pointer-events:none;}
        /* Icons carry their own fill color (set per-<path>, see markup below);
           currentColor here is just a harmless fallback. Size is contextual —
           each button tier gets a proportionate icon. */
        .ico-svg{fill:currentColor;display:block;}
        .tc-util .ico-svg{width:24px;height:24px;}
        .tc-big .ico-svg{width:40px;height:40px;}
        .tc-med .ico-svg{width:34px;height:34px;}
        .tc-small .ico-svg{width:28px;height:28px;}
        .tc-util{width:58px;height:58px;font-size:22px;}
        /* Fire button glows and holds a pressed look while a finger is on it
           (as opposed to the generic .tc-btn:active flash-on-tap above). */
        #tc-fire.firing{transform:scale(.94);
          background:linear-gradient(160deg,#3a1c1cee,#1a0e0ecc);
          box-shadow:0 4px 16px #0008, inset 0 1px 0 #ffffff18, 0 0 22px #ff5a3a55;}
        /* HP (outer) / Shield (inner) rings wrapped around the fire button —
           vitals merged into a control instead of separate HUD bars. */
        #tc-vitals{position:absolute;width:132px;height:132px;
          right:calc(20px + env(safe-area-inset-right));bottom:calc(30px + env(safe-area-inset-bottom));}
        #tc-vitals .tc-btn{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);}
        .tc-ring{position:absolute;inset:0;border-radius:50%;pointer-events:none;
          -webkit-mask:radial-gradient(closest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));
          mask:radial-gradient(closest-side,transparent calc(100% - 4px),#000 calc(100% - 4px));}
        #tc-ring-hp{background:conic-gradient(#7fe04a 360deg, #ffffff26 0);
          filter:drop-shadow(0 0 5px #6fe04a88);}
        #tc-ring-sh{inset:10px;opacity:0;transition:opacity .25s;
          -webkit-mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));
          mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));
          background:conic-gradient(#7fd4ff 0deg, transparent 0);
          filter:drop-shadow(0 0 4px #6fd4ff88);}
        /* Rest of the bottom-right action cluster, arranged around the fire
           button; lifted for the safe area. Tail/Kick grew from .tc-small to
           .tc-med — same right/bottom anchor (that's the button's bottom-right
           corner), so the extra size only grows the button up-left into the
           gaps the original layout already left for this. */
        #tc-tail{right:calc(164px + env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom));}
        #tc-kick{right:calc(52px + env(safe-area-inset-right));bottom:calc(172px + env(safe-area-inset-bottom));}
        /* Hidden until AnimalManager reports a caged animal in reach (see
           setFreePrompt(), driven from Game._updateHud) — only takes up
           screen space when there's actually something to free. */
        #tc-free{right:calc(37px + env(safe-area-inset-right));bottom:calc(276px + env(safe-area-inset-bottom));
          flex-direction:column;gap:2px;display:none;}
        #tc-free.show{display:flex;}
        /* Radial cooldown wipe over the Tail button — dark pie that shrinks as
           the cooldown clears, driven every frame from _updateTailCooldown(). */
        #tc-tail-cd{position:absolute;inset:0;border-radius:50%;pointer-events:none;
          background:conic-gradient(#000000b0 0deg, transparent 0deg);opacity:0;}
        /* Top-right utilities. */
        #tc-util-row{position:absolute;top:calc(18px + env(safe-area-inset-top));
          right:calc(18px + env(safe-area-inset-right));display:flex;gap:10px;}
        /* .tc-btn defaults to position:absolute for the freestanding action
           buttons below, which would pull these out of flex flow entirely
           (collapsing the row to 0×0 and stacking every icon on top of the
           other) — put them back in normal flow so the row actually lays
           out left-to-right. */
        #tc-util-row .tc-btn{position:relative;}
      </style>
      <div id="tc-surface"></div>
      <div id="tc-stick"><div id="tc-thumb"></div></div>
      <div id="tc-util-row">
        <div class="tc-btn tc-util" data-tap="cam">
          <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#7fd4ff" d="M41 122.496v14h62v-14zm154.73 0-32 32H137v46h30.682C192.4 159.898 237.08 132.738 288 132.738s95.6 27.16 120.318 67.758H487v-46h-74.73l-32-32c-92.27-9-92.27-9-184.54 0zM288 150.738c-67.903 0-122.758 54.855-122.758 122.758 0 67.903 54.855 122.758 122.758 122.758 67.903 0 122.758-54.855 122.758-122.758 0-67.903-54.855-122.758-122.758-122.758zm-263 3.758v46h94v-46zm263 14.713c57.49 0 104.287 46.796 104.287 104.286S345.49 377.783 288 377.783c-57.49 0-104.287-46.797-104.287-104.287 0-57.49 46.797-104.287 104.287-104.287zm-21.787 22.042c-12.173.42-25.717 6.526-36.78 16.578-20.025 18.19-26.342 43.853-14.11 57.318 12.232 13.465 38.38 9.634 58.406-8.558 20.023-18.192 26.34-43.855 14.108-57.32-5-5.504-12.62-8.33-21.625-8.018zM25 218.496v142h94v-142zm112 0v142h40.412c-18.888-23.96-30.17-54.183-30.17-87 0-19.507 3.988-38.096 11.188-55zm280.57 0c7.2 16.904 11.188 35.493 11.188 55 0 32.817-11.282 63.04-30.17 87H487v-142zM25 378.496v14h94v-14zm112 0v14h75.89a141.492 141.492 0 0 1-18.536-14zm244.646 0a141.616 141.616 0 0 1-18.535 14H487v-14z"/></svg>
        </div>
        <div class="tc-btn tc-util" id="tc-weapon" data-code="KeyQ">
          <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#ffb347" d="m79.238 115.768-28.51 67.863h406.15l-.273-67.862h-263.83v55.605h-15v-55.605h-16.68v55.605H146.1v-55.605h-17.434v55.605h-15v-55.605H79.238zm387.834 15.96v40.66h18.688v-40.66h-18.688zM56.768 198.63l20.566 32.015L28.894 406.5l101.68 7.174 21.54-97.996h115.74l14.664-80.252 174.55-3.873-.13-32.922H56.767zm206.672 37.22-11.17 61.142h-96.05l12.98-59.05 12.53-.278-2.224 35.5 14.262 13.576 1.003-33.65 24.69-16.264 43.98-.976z"/></svg>
        </div>
        <div class="tc-btn tc-util" data-tap="pause">
          <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#cdebb6" d="M120.16 45A20.162 20.162 0 0 0 100 65.16v381.68A20.162 20.162 0 0 0 120.16 467h65.68A20.162 20.162 0 0 0 206 446.84V65.16A20.162 20.162 0 0 0 185.84 45h-65.68zm206 0A20.162 20.162 0 0 0 306 65.16v381.68A20.162 20.162 0 0 0 326.16 467h65.68A20.162 20.162 0 0 0 412 446.84V65.16A20.162 20.162 0 0 0 391.84 45h-65.68z"/></svg>
        </div>
      </div>
      <div id="tc-vitals">
        <div class="tc-ring" id="tc-ring-hp"></div>
        <div class="tc-ring" id="tc-ring-sh"></div>
        <div class="tc-btn tc-big" id="tc-fire" data-tap="fire">
          <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#ff5a3a" d="m226.063 24.22-9.782 32.624c12.992-2.652 26.423-4.032 40.19-4.032 10.475 0 20.766.82 30.81 2.376l-9.405-30.97h-51.813zm30.406 48.843c-99.627 0-180.19 80.53-180.19 180.156 0 99.624 80.563 180.155 180.19 180.155 99.624 0 180.155-80.53 180.155-180.156 0-99.627-80.53-180.157-180.156-180.157zm0 41.687c76.482 0 138.467 61.985 138.467 138.47 0 76.482-61.985 138.5-138.468 138.5-76.485 0-138.5-62.018-138.5-138.5 0-76.485 62.015-138.47 138.5-138.47zm-.033 38.938c-54.96 0-99.53 44.54-99.53 99.5s44.57 99.5 99.53 99.5 99.5-44.54 99.5-99.5-44.54-99.5-99.5-99.5zm.032 39.687c33.052 0 59.842 26.79 59.842 59.844 0 33.052-26.79 59.843-59.843 59.843-33.055 0-59.845-26.79-59.845-59.844 0-33.055 26.79-59.845 59.844-59.845zm0 30.906c-15.993 0-28.97 12.947-28.97 28.94 0 15.99 12.977 28.968 28.97 28.968 15.99 0 28.936-12.977 28.936-28.97 0-15.99-12.945-28.937-28.937-28.937zM114.905 395l-27.844 92.875h46.876l20.28-62.313A201.753 201.753 0 0 1 114.905 395zm277.188 5.688a201.306 201.306 0 0 1-39.72 28.468l19.25 58.72h46.907l-26.436-87.188zm-165.03 50.78v36.407h52.092v-35.53a202.36 202.36 0 0 1-22.687 1.28c-9.99 0-19.81-.74-29.408-2.156z"/></svg>
        </div>
      </div>
      <div class="tc-btn tc-med" id="tc-tail" data-code="KeyR">
        <div id="tc-tail-cd"></div>
        <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#b39ddb" d="M144.734 22.04a246.41 246.41 0 0 0-16.634.456c-43.77 2.7-82.904 17.003-103.862 44.996-7.506 10.027-5.682 23.91 2.95 31.42 8.635 7.51 23.004 8.053 36.234-.52 22.84-14.805 47.933-9.572 64.27 6.172 16.34 15.745 23.736 41.453 7.54 71.145-19.17 35.143-32.716 96.153-20.146 156.526 12.57 60.374 52.968 119.76 139.728 145.772 33.476 10.036 78.825 16.75 121.645 7.666 44.507-8.788 95.85-34.758 106.892-63.11-9.25 8.885-19.44 15.14-30.202 19.79 18.306-20.92 31.735-49.732 36.79-88.174l2.53-19.24-16.322 10.496c-10.503 6.755-20.585 13.403-30.093 18.396 2.638-5.872 5.038-13.22 7.73-22.777-11.097 15.19-23.73 25.355-38.598 31.472-9.234-.503-18.353-4.867-29.21-16.097-11.358-11.747-18.12-32.095-22.463-57.666-4.344-25.572-6.46-55.927-10.668-86.877-8.42-61.902-25.912-127.873-89.74-161.035-36.955-19.2-79.092-28.577-118.372-28.813zm-.123 18.01c36.462.255 76.11 9.065 110.197 26.774 56.393 29.3 71.994 87.14 80.203 147.488 4.104 30.175 6.186 60.554 10.758 87.465 1.316 7.753 2.835 15.242 4.693 22.385-15.448.04-27.254-8.307-41.704-24.717 7.385 30.41 11.99 36.534 25.705 55.55-28.22-8.235-60.64-34.74-80.95-64.063-3.274 40.047 20.223 71.574 33.275 83.93-25.176-14.196-60.713-41.536-84.623-88.655-1.016 41.426 11.93 87.732 36.45 116.465-34.515-11.536-64.97-99.472-85.42-127.633-13.04 33.217-2.948 89.085 16.072 130.122-19.628-22.838-30.887-49.375-36.555-76.596-11.524-55.342 1.75-113.847 18.325-144.238 19.55-35.842 10.915-71.75-10.85-92.726-21.768-20.976-56.854-27.564-86.554-8.315-8.56 5.55-12.688 3.732-14.626 2.045-1.94-1.687-2.76-3.84-.356-7.053 16.106-21.514 50.135-35.324 90.56-37.817 5.052-.312 10.195-.45 15.403-.414z"/></svg>
        <span class="lab">TAIL</span>
      </div>
      <div class="tc-btn tc-med" id="tc-kick" data-code="KeyV">
        <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#ff7b54" d="M117.842 26.268a15.25 15.25 0 0 0-4.418.76c-5.625 1.858-10.165 7.048-12.6 15.701-2.435 8.653-2.255 20.27 1.668 32.045 3.923 11.775 10.754 21.198 17.9 26.686 7.147 5.488 13.9 6.946 19.526 5.088 5.625-1.858 10.163-7.046 12.597-15.7 2.435-8.653 2.256-20.271-1.668-32.046-3.923-11.776-10.753-21.196-17.9-26.684-5.36-4.116-10.498-5.966-15.105-5.85zm183.933 12.373c-3.461.157-6.505 1.749-8.25 5.344L279.89 68.73l-26.733 32.309s-53.832-9.528-72.039-6.863a518.655 518.655 0 0 0-11.318 1.767c-3.614 12.656-11.809 23.592-24.192 27.682-11.513 3.803-23.674.702-33.761-6.178-4.565 3.511-8.787 7.581-12.557 12.33-18.674 14.66-26.385 24.747-42.1 34.92 3.083-14.864 10.683-29.677 19.026-41.879 1.37-2.003 11.495-10.555 12.888-12.406 7.48-14.706-8.464-41.216-23.476-15.86-1.425 1.979-7.346 18.877-8.817 21.096-14.574 28.867-23.676 47.817-15.474 76.325 2.756 9.578 30.91-4.905 55.23-22.159 26.469 37.34 59.364 48.604 78.373 63.078-23.266 83.384 10.267 147.263 29.276 207.721l-29.149 36.086c-8.868 10.627 48.711 13.113 52.412.75l7.71-33.84c-28.831-90.508-3.142-157.686 17.62-207.722 55.208-59.043 115.23-82.304 168.9-128.791l45.302-9.635c10.848-19.916 10.236-29.748-13.854-30.697l-44.924 17.595c-56.586 31.807-146.01 53.348-186.496 97.99-.897-14.045-17.4-47.3-20.902-58.437 19.373 2.573 45.668 4.223 60.642-2.682 16.005-7.38 33.63-40.796 33.63-40.796l19.663-14.551c17.065-10.058-.63-27.798-12.994-27.24z"/></svg>
        <span class="lab">KICK</span>
      </div>
      <div class="tc-btn tc-small" id="tc-free" data-code="KeyE">
        <svg class="ico-svg" viewBox="0 0 512 512"><path fill="#c9a06a" d="M119 75v64H55v346h402V139h-64V75H128zm18 18h46v46h-46zm64 0h46v46h-46zm64 0h46v46h-46zm64 0h46v46h-46zM73 157h46v18H73zm64 0h46v18h-46zm64 0h46v18h-46zm64 0h46v18h-46zm64 0h46v18h-46zm64 0h46v18h-46zM73 193h46v46H73zm64 0h46v46h-46zm64 0h46v46h-46zm64 0h46v46h-46zm64 0h46v46h-46zm64 0h46v46h-46zM73 257h46v46H73zm64 0h46v46h-46zm64 0h46v46h-46zm70.508 0h96.984l-26.287 46h20.73L375 281.889v156.22L362.937 417h-20.732l26.287 50h-96.984l26.287-50h-20.733L265 438.11V281.888L277.064 303h20.73zM393 257h46v46h-46zM73 321h46v46H73zm64 0h46v46h-46zm64 0h46v46h-46zm88 0v78h62v-78zm104 0h46v46h-46zm-73 10.043c7.732 0 14 6.268 14 14a14 14 0 0 1-5.19 10.87l5.19 31.13h-28l5.19-31.135a14 14 0 0 1-5.19-10.865c0-7.732 6.268-14 14-14zM73 385h46v46H73zm64 0h46v46h-46zm64 0h46v46h-46zm192 0h46v46h-46zM73 449h46v18H73zm64 0h46v18h-46zm64 0h46v18h-46zm192 0h46v18h-46z"/></svg>
        <span class="lab">FREE</span>
      </div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.surface = root.querySelector('#tc-surface');
    this.stick = root.querySelector('#tc-stick');
    this.thumb = root.querySelector('#tc-thumb');
    this.fireBtn = root.querySelector('#tc-fire');
    this.ringHp = root.querySelector('#tc-ring-hp');
    this.ringSh = root.querySelector('#tc-ring-sh');
    this.tailBtn = root.querySelector('#tc-tail');
    this.tailCd = root.querySelector('#tc-tail-cd');
    this.freeBtn = root.querySelector('#tc-free');
  }

  _bind() {
    // --- Action buttons: one-shot taps (fire button is bound separately below —
    // it needs hold-to-fire semantics rather than a single virtual key press). ---
    for (const btn of this.root.querySelectorAll('.tc-btn')) {
      if (btn === this.fireBtn) continue;
      // Tail gets its own handler: gated by TAIL_COOLDOWN so a tap mid-cooldown
      // is silently ignored instead of queuing a virtual press Player.js would
      // drop anyway — keeps the on-screen cooldown ring honest about tappability.
      if (btn === this.tailBtn) {
        btn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (performance.now() < this._tailReadyAt) return;
          this._tailReadyAt = performance.now() + TAIL_COOLDOWN_MS;
          this.input.pressVirtual('KeyR');
          this._flashPress(btn);
        }, { passive: false });
        continue;
      }
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // keep the surface from treating this as look/joystick
        this._flashPress(btn);
        const code = btn.dataset.code;
        if (code) { this.input.pressVirtual(code); return; }
        switch (btn.dataset.tap) {
          // Matches Game._raf's own camera-cycle key (KeyC) so the on-screen
          // button drives the same cycleMode() the desktop hotkey does — it
          // used to press Digit1/2/3 instead, which Player.js reads as direct
          // weapon-select and silently swapped weapons on every camera tap.
          case 'cam': this.input.pressVirtual('KeyC'); break;
          case 'pause': this.callbacks.togglePause?.(); break;
        }
      }, { passive: false });
    }

    // --- Fire button: held virtual mouse-0 for as long as a finger is on it
    // (works for tap-fire single shots, rapid/beam auto weapons, and
    // hold-to-charge weapons alike). Fire-only — never triggers jump. ---
    this.fireBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      for (const t of e.changedTouches) this._fireTouches.add(t.identifier);
      this.input.setVirtualMouseDown(0);
      this.fireBtn.classList.add('firing');
    }, { passive: false });
    const endFire = (e) => {
      for (const t of e.changedTouches) this._fireTouches.delete(t.identifier);
      if (this._fireTouches.size === 0) {
        this.input.setVirtualMouseUp(0);
        this.fireBtn.classList.remove('firing');
      }
    };
    this.fireBtn.addEventListener('touchend', endFire, { passive: false });
    this.fireBtn.addEventListener('touchcancel', endFire, { passive: false });

    // --- Gesture surface: joystick (left) + look (right). ---
    const half = () => window.innerWidth / 2;

    this.surface.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.clientX < half() && this._stickId === null) {
          this._stickId = t.identifier;
          this._stickOrigin.x = t.clientX;
          this._stickOrigin.y = t.clientY;
          this.stick.style.left = `${t.clientX}px`;
          this.stick.style.top = `${t.clientY}px`;
          this.stick.style.opacity = '1';
          this._moveThumb(0, 0);
        } else if (this._lookId === null) {
          this._lookId = t.identifier;
          this._lookLast.x = t.clientX;
          this._lookLast.y = t.clientY;
        }
      }
    }, { passive: false });

    this.surface.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === this._stickId) {
          let dx = t.clientX - this._stickOrigin.x;
          let dy = t.clientY - this._stickOrigin.y;
          const len = Math.hypot(dx, dy);
          if (len > STICK_RADIUS) { dx = dx / len * STICK_RADIUS; dy = dy / len * STICK_RADIUS; }
          this._moveThumb(dx, dy);
          // y inverted: dragging up (−screenY) is forward (+y).
          this.input.touchAxis.x = dx / STICK_RADIUS;
          this.input.touchAxis.y = -dy / STICK_RADIUS;
        } else if (t.identifier === this._lookId) {
          this.input.addLook((t.clientX - this._lookLast.x) * LOOK_SENS,
                             (t.clientY - this._lookLast.y) * LOOK_SENS);
          this._lookLast.x = t.clientX;
          this._lookLast.y = t.clientY;
        }
      }
    }, { passive: false });

    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this._stickId) {
          this._stickId = null;
          this.input.touchAxis.x = 0;
          this.input.touchAxis.y = 0;
          this.stick.style.opacity = '0';
          this._moveThumb(0, 0);
        } else if (t.identifier === this._lookId) {
          this._lookId = null;
        }
      }
    };
    this.surface.addEventListener('touchend', onEnd, { passive: false });
    this.surface.addEventListener('touchcancel', onEnd, { passive: false });
  }

  // Guaranteed tap feedback for one-shot buttons (Kick, Cam, Pause, Weapon,
  // Tail): touch-action:none can suppress the synthetic mouse events :active
  // relies on, so a fast tap sometimes drew nothing at all — button felt dead
  // even though the game registered it. A fixed-timeout class sidesteps both
  // that unreliability and taps quick enough to touchend before :active paints.
  _flashPress(btn) {
    btn.classList.add('pressed');
    setTimeout(() => btn.classList.remove('pressed'), PRESS_FLASH_MS);
  }

  _moveThumb(dx, dy) {
    this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Drive the HP (outer) / Shield (inner) rings wrapped around the fire
  // button — called every frame from Game._updateHud() with the same values
  // it feeds HUD.update(), so the two stay in lock-step. Change-gated like
  // HUD's own caches to avoid rewriting style strings every frame.
  setVitals(hp, maxHp, shield, maxShield) {
    this._updateTailCooldown();
    const hpPct = maxHp ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const hpDeg = Math.round(hpPct * 3600) / 10; // 0.1° resolution, cheap to compare
    if (hpDeg !== this._lastHpDeg) {
      const color = hpPct > 0.5 ? '#7fe04a' : hpPct > 0.25 ? '#f0d24a' : '#ff5a4a';
      this.ringHp.style.background = `conic-gradient(${color} ${hpDeg}deg, #ffffff26 ${hpDeg}deg 360deg)`;
      this._lastHpDeg = hpDeg;
    }
    const shPct = maxShield ? Math.max(0, Math.min(1, shield / maxShield)) : 0;
    const shDeg = Math.round(shPct * 3600) / 10;
    if (shDeg !== this._lastShDeg) {
      this.ringSh.style.background = `conic-gradient(#7fd4ff ${shDeg}deg, transparent ${shDeg}deg 360deg)`;
      this._lastShDeg = shDeg;
    }
    const shActive = shield > 0;
    if (shActive !== this._lastShActive) {
      this.ringSh.style.opacity = shActive ? '1' : '0';
      this._lastShActive = shActive;
    }
  }

  // Show/hide the FREE button — only relevant while a caged animal is in
  // reach (mirrors HUD.js's #fd-free prompt), so it doesn't eat screen space
  // the rest of the time. Called every frame from Game._updateHud() alongside
  // setVitals(); change-gated like the rest of this file's per-frame writes.
  setFreePrompt(visible) {
    if (visible === this._freeShown) return;
    this.freeBtn.classList.toggle('show', visible);
    this._freeShown = visible;
  }

  // Radial "pie" wipe over the Tail button: a dark sector shrinks from 360°
  // to 0° as the cooldown clears. Riding setVitals()'s per-frame call instead
  // of its own requestAnimationFrame loop keeps this tied to Game's render
  // loop, so it stops when the game does (no independent RAF to leak).
  _updateTailCooldown() {
    const remaining = this._tailReadyAt - performance.now();
    if (remaining <= 0) {
      if (this._tailCdShown !== 0) {
        this.tailCd.style.opacity = '0';
        this.tailBtn.classList.remove('on-cooldown');
        this._tailCdShown = 0;
      }
      return;
    }
    const deg = Math.round(Math.min(1, remaining / TAIL_COOLDOWN_MS) * 360);
    if (deg !== this._tailCdShown) {
      this.tailCd.style.background = `conic-gradient(#000000b0 ${deg}deg, transparent ${deg}deg)`;
      this.tailCd.style.opacity = '1';
      this.tailBtn.classList.add('on-cooldown');
      this._tailCdShown = deg;
    }
  }
}

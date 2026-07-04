// On-screen touch controls for phones/tablets. A DOM overlay that translates
// finger gestures into the same virtual input the rest of the game already
// reads through `Input` (see Input.addLook / pressVirtual / touchAxis):
//   • left half  → dynamic-origin virtual joystick  → input.touchAxis (movement)
//   • right half → drag-to-look                       → input.addLook (camera)
//   • button cluster → one-shot taps                  → input.pressVirtual(code)
//   • fire button    → hold-to-fire (tap still fires) → input.setVirtualMouseDown/Up(0)
// Aim-assist auto-fires whenever an enemy is in the cone (input.autoFire);
// holding the fire button ORs on top of that, so charge/beam/rapid weapons
// still work under a thumb without fighting the auto-aim. A quick double-tap
// on the fire button still triggers a jump, since the button it replaced
// (Space) is no longer reachable directly.
//
// Vitals (HP/Shield) are merged into a ring wrapped around the fire button
// instead of separate on-screen bars — see setVitals() — to keep the play
// area clear of chrome. HUD.js hides its own bars on touch to match.
//
// Multi-touch is tracked by Touch.identifier so moving, looking and tapping a
// button all work at the same time. Created only on touch devices via
// TouchControls.maybeCreate().

const LOOK_SENS = 1.3;     // multiplier on top of CAMERA.MOUSE_SENS (downstream)
const STICK_RADIUS = 56;   // px travel for full deflection
const DOUBLE_TAP_MS = 280; // max gap between taps on the fire button to count as a jump

// Camera-mode cycle order matches Digit1/2/3 in Game._raf.
const CAMERA_CYCLE = ['Digit1', 'Digit2', 'Digit3'];

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
    this._camIndex = 1;       // start in third-person (Digit2), matching default

    this._fireTouches = new Set(); // active touch ids currently holding the fire button
    this._lastFireTap = 0;         // performance.now() of the last fire touchstart (double-tap→jump)
    this._lastHpDeg = -1; this._lastShDeg = -1; this._lastShActive = null;

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
        .tc-btn:active{transform:scale(.92);background:linear-gradient(160deg,#1c3a26ee,#0e1a12cc);}
        .tc-btn .lab{font-size:12px;letter-spacing:.5px;opacity:.85;}
        .tc-btn .ico{font-size:26px;}
        .tc-big{width:100px;height:100px;}
        .tc-big .ico{font-size:36px;}
        .tc-small{width:74px;height:74px;}
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
          -webkit-mask:radial-gradient(closest-side,transparent calc(100% - 8px),#000 calc(100% - 8px));
          mask:radial-gradient(closest-side,transparent calc(100% - 8px),#000 calc(100% - 8px));}
        #tc-ring-hp{background:conic-gradient(#7fe04a 360deg, #ffffff26 0);
          filter:drop-shadow(0 0 5px #6fe04a88);}
        #tc-ring-sh{inset:10px;opacity:0;transition:opacity .25s;
          -webkit-mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));
          mask:radial-gradient(closest-side,transparent calc(100% - 6px),#000 calc(100% - 6px));
          background:conic-gradient(#7fd4ff 0deg, transparent 0);
          filter:drop-shadow(0 0 4px #6fd4ff88);}
        /* Rest of the bottom-right action cluster, arranged around the fire
           button; lifted for the safe area. */
        #tc-tail{right:calc(164px + env(safe-area-inset-right));bottom:calc(76px + env(safe-area-inset-bottom));}
        #tc-kick{right:calc(52px + env(safe-area-inset-right));bottom:calc(172px + env(safe-area-inset-bottom));}
        #tc-weapon{right:calc(169px + env(safe-area-inset-right));bottom:calc(193px + env(safe-area-inset-bottom));}
        #tc-free{right:calc(37px + env(safe-area-inset-right));bottom:calc(276px + env(safe-area-inset-bottom));}
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
        <div class="tc-btn tc-util" data-tap="cam">🎥</div>
        <div class="tc-btn tc-util" data-tap="shop">🛒</div>
        <div class="tc-btn tc-util" data-tap="gallery">🖼️</div>
        <div class="tc-btn tc-util" data-tap="settings">⚙️</div>
        <div class="tc-btn tc-util" data-tap="achievements">🏆</div>
        <div class="tc-btn tc-util" data-tap="backpack">🎒</div>
        <div class="tc-btn tc-util" data-tap="pause">⏸</div>
      </div>
      <div id="tc-vitals">
        <div class="tc-ring" id="tc-ring-hp"></div>
        <div class="tc-ring" id="tc-ring-sh"></div>
        <div class="tc-btn tc-big" id="tc-fire" data-tap="fire"><span class="ico">🎯</span></div>
      </div>
      <div class="tc-btn tc-small" id="tc-tail"   data-code="KeyR"><span class="lab">TAIL</span></div>
      <div class="tc-btn tc-small" id="tc-kick"   data-code="KeyV"><span class="lab">KICK</span></div>
      <div class="tc-btn tc-small" id="tc-weapon" data-code="KeyQ"><span class="lab">WEAP</span></div>
      <div class="tc-btn tc-small" id="tc-free"   data-code="KeyE"><span class="lab">FREE</span></div>
    `;
    document.body.appendChild(root);
    this.root = root;
    this.surface = root.querySelector('#tc-surface');
    this.stick = root.querySelector('#tc-stick');
    this.thumb = root.querySelector('#tc-thumb');
    this.fireBtn = root.querySelector('#tc-fire');
    this.ringHp = root.querySelector('#tc-ring-hp');
    this.ringSh = root.querySelector('#tc-ring-sh');
  }

  _bind() {
    // --- Action buttons: one-shot taps (fire button is bound separately below —
    // it needs hold-to-fire semantics rather than a single virtual key press). ---
    for (const btn of this.root.querySelectorAll('.tc-btn')) {
      if (btn === this.fireBtn) continue;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation(); // keep the surface from treating this as look/joystick
        const code = btn.dataset.code;
        if (code) { this.input.pressVirtual(code); return; }
        switch (btn.dataset.tap) {
          case 'cam':
            this._camIndex = (this._camIndex + 1) % CAMERA_CYCLE.length;
            this.input.pressVirtual(CAMERA_CYCLE[this._camIndex]);
            break;
          case 'shop':    this.callbacks.toggleShop?.(); break;
          case 'gallery': this.callbacks.toggleGallery?.(); break;
          case 'settings':    this.callbacks.toggleSettings?.(); break;
          case 'achievements': this.callbacks.toggleAchievements?.(); break;
          case 'backpack':    this.callbacks.toggleBackpack?.(); break;
          case 'pause':       this.callbacks.togglePause?.(); break;
        }
      }, { passive: false });
    }

    // --- Fire button: held virtual mouse-0 for as long as a finger is on it
    // (works for tap-fire single shots, rapid/beam auto weapons, and
    // hold-to-charge weapons alike). A quick double-tap also jumps, since
    // Space no longer has its own button. ---
    this.fireBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const now = performance.now();
      if (now - this._lastFireTap < DOUBLE_TAP_MS) this.input.pressVirtual('Space');
      this._lastFireTap = now;
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

  _moveThumb(dx, dy) {
    this.thumb.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  // Drive the HP (outer) / Shield (inner) rings wrapped around the fire
  // button — called every frame from Game._updateHud() with the same values
  // it feeds HUD.update(), so the two stay in lock-step. Change-gated like
  // HUD's own caches to avoid rewriting style strings every frame.
  setVitals(hp, maxHp, shield, maxShield) {
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
}

// On-screen touch controls for phones/tablets. A DOM overlay that translates
// finger gestures into the same virtual input the rest of the game already
// reads through `Input` (see Input.addLook / pressVirtual / touchAxis):
//   • left half  → dynamic-origin virtual joystick  → input.touchAxis (movement)
//   • right half → drag-to-look                       → input.addLook (camera)
//   • button cluster → one-shot taps                  → input.pressVirtual(code)
// Firing is automatic on touch builds (input.autoFire), so there is no fire
// button — the existing aim-assist fires whenever an enemy is in the cone.
//
// Multi-touch is tracked by Touch.identifier so moving, looking and tapping a
// button all work at the same time. Created only on touch devices via
// TouchControls.maybeCreate().

const LOOK_SENS = 1.3;     // multiplier on top of CAMERA.MOUSE_SENS (downstream)
const STICK_RADIUS = 56;   // px travel for full deflection

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
        /* Action buttons (bottom-right cluster + top-right utilities). */
        .tc-btn{position:absolute;pointer-events:auto;touch-action:none;
          display:flex;align-items:center;justify-content:center;text-align:center;
          border-radius:50%;border:1px solid #ffffff2a;color:#eaf7df;
          background:linear-gradient(160deg,#0e1a12cc,#070d0aaa);
          backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          box-shadow:0 4px 16px #0008, inset 0 1px 0 #ffffff18;
          font-weight:700;text-shadow:0 1px 3px #000c;line-height:1.05;}
        .tc-btn:active{transform:scale(.92);background:linear-gradient(160deg,#1c3a26ee,#0e1a12cc);}
        .tc-btn .lab{font-size:10px;letter-spacing:.5px;opacity:.85;}
        .tc-btn .ico{font-size:20px;}
        .tc-big{width:78px;height:78px;}
        .tc-small{width:58px;height:58px;}
        .tc-util{width:46px;height:46px;font-size:18px;}
        /* Bottom-right action cluster, lifted for the safe area. */
        #tc-jump{right:calc(28px + env(safe-area-inset-right));bottom:calc(36px + env(safe-area-inset-bottom));}
        #tc-tail{right:calc(118px + env(safe-area-inset-right));bottom:calc(58px + env(safe-area-inset-bottom));}
        #tc-kick{right:calc(40px + env(safe-area-inset-right));bottom:calc(132px + env(safe-area-inset-bottom));}
        #tc-weapon{right:calc(130px + env(safe-area-inset-right));bottom:calc(148px + env(safe-area-inset-bottom));}
        #tc-free{right:calc(28px + env(safe-area-inset-right));bottom:calc(212px + env(safe-area-inset-bottom));}
        /* Top-right utilities. */
        #tc-util-row{position:absolute;top:calc(14px + env(safe-area-inset-top));
          right:calc(14px + env(safe-area-inset-right));display:flex;gap:8px;}
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
      <div class="tc-btn tc-big"   id="tc-jump"   data-code="Space"><span class="ico">⤒</span></div>
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
  }

  _bind() {
    // --- Action buttons: one-shot taps. ---
    for (const btn of this.root.querySelectorAll('.tc-btn')) {
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
}

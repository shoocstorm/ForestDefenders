// Keyboard + mouse input with pointer-lock mouse-look.
// Exposes per-frame "pressed this frame" edges plus held state and accumulated mouse delta.

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.held = new Set();        // currently-down key codes
    this.pressed = new Set();     // went down since last endFrame() (realtime edge)
    // Sim edge: like `pressed`, but consumed on read by the fixed sim step
    // (wasPressedSim deletes the code) instead of being cleared every frame.
    // The render loop can outrun the 60Hz fixed step on high-refresh displays —
    // on frames where no fixed step runs, the press stays queued instead of
    // being dropped, so the next step reads it. Clearing on a per-frame heuristic
    // (did *any* step run) raced the press and ate it: that's why weapon
    // switching / tail swing sometimes needed a second key press.
    this.simPressed = new Set();
    this.released = new Set();    // went up since last endFrame()
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.wheel = 0;
    this.pointerLocked = false;

    // --- Virtual (touch) input, fed by TouchControls. Merged into the getters
    // below so the rest of the game is agnostic to the input source. ---
    this.touchAxis = { x: 0, y: 0 };   // movement from the on-screen joystick
    this.virtualHeld = new Set();      // virtual key codes down this frame
    this.virtualPressed = new Set();   // virtual key codes tapped this frame
    this.virtualMouse = new Set();     // virtual mouse buttons held
    this.autoFire = false;             // touch build: fire when a target is in cone

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
      this.simPressed.add(e.code);
      // Stop the page from scrolling on space/arrows during play.
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => { this.held.delete(e.code); this.released.add(e.code); };
    this._onMouseDown = (e) => { this.mouseButtons.add(e.button); this.mousePressed.add(e.button); };
    this._onMouseUp = (e) => { this.mouseButtons.delete(e.button); };
    this._onMouseMove = (e) => {
      if (this.pointerLocked) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    };
    this._onWheel = (e) => { this.wheel += Math.sign(e.deltaY); };
    this._onPointerLockChange = () => {
      this.pointerLocked = document.pointerLockElement === this.dom;
    };
    this._relockTimer = null;
    this._requestLock = () => {
      if (this.pointerLocked) return;
      // requestPointerLock returns a Promise in modern browsers. It rejects with
      // a SecurityError if called during the browser's post-ESC cooldown
      // (~1.25s in Chrome). Swallow that and retry once after the cooldown so a
      // quick click after ESC still re-captures the mouse.
      const p = this.dom.requestPointerLock?.();
      if (p && typeof p.catch === 'function') {
        p.catch(() => {
          if (this._relockTimer) return;
          this._relockTimer = setTimeout(() => {
            this._relockTimer = null;
            if (!this.pointerLocked) this.dom.requestPointerLock?.().catch(() => {});
          }, 1300);
        });
      }
    };
    this._onClickToLock = () => { this._requestLock(); };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.addEventListener('click', this._onClickToLock);
  }

  isDown(code) { return this.held.has(code) || this.virtualHeld.has(code); }
  wasPressed(code) { return this.pressed.has(code) || this.virtualPressed.has(code); }
  // Sim-side edge: read from the fixed-step loop. Consumed on read so a press
  // fires exactly once — it survives render frames where no fixed step ran (so
  // presses are never dropped on high-refresh displays), then is removed once a
  // step actually reads it so later steps in the same frame don't re-trigger.
  wasPressedSim(code) {
    if (this.simPressed.delete(code)) return true;
    return this.virtualPressed.has(code);
  }
  wasReleased(code) { return this.released.has(code); }
  mouseDown(btn = 0) { return this.mouseButtons.has(btn) || this.virtualMouse.has(btn); }
  mouseWasPressed(btn = 0) { return this.mousePressed.has(btn); }

  // Movement vector in local space: x = strafe (+right), y = forward (+forward).
  // Touch joystick (if active) takes priority over the keyboard.
  moveAxis() {
    if (this.touchAxis.x !== 0 || this.touchAxis.y !== 0) {
      return { x: this.touchAxis.x, y: this.touchAxis.y };
    }
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    return { x, y };
  }

  // --- Virtual input injection (called by TouchControls) ---
  // Feed camera-look delta, bypassing the pointer-lock guard used for the mouse.
  addLook(dx, dy) { this.mouseDelta.x += dx; this.mouseDelta.y += dy; }
  // Register a one-frame virtual tap for an edge-triggered action (jump, etc.).
  pressVirtual(code) { this.virtualHeld.add(code); this.virtualPressed.add(code); }

  consumeMouseDelta() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0; this.mouseDelta.y = 0;
    return d;
  }

  // Read + clear the wheel accumulator (sign: +1 down / -1 up). Consumed so it
  // can't double-fire across multiple fixed sim steps in one frame.
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  // Call at the end of each frame to clear edge-triggered state. Realtime edges
  // (read in the render loop) clear every frame. Sim edges (read in the fixed-step
  // loop) are consumed on read, so while the sim is active we leave any still-queued
  // press alone — it just means no fixed step ran this frame, and next frame's step
  // will read it. When the sim is inactive (paused/overlay) nothing consumes them,
  // so drop them here to avoid a stale press firing on resume. `simStepped` gates
  // the one-frame lifetime of virtual (touch) taps.
  endFrame(simActive = true, simStepped = true) {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.wheel = 0;
    if (!simActive) this.simPressed.clear();
    if (simStepped) {
      // Virtual taps last exactly one frame (movement uses touchAxis, not held keys).
      for (const code of this.virtualPressed) this.virtualHeld.delete(code);
      this.virtualPressed.clear();
    }
  }
}

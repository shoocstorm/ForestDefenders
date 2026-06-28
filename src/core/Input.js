// Keyboard + mouse input with pointer-lock mouse-look.
// Exposes per-frame "pressed this frame" edges plus held state and accumulated mouse delta.

export class Input {
  constructor(domElement) {
    this.dom = domElement;
    this.held = new Set();        // currently-down key codes
    this.pressed = new Set();     // went down since last endFrame()
    this.released = new Set();    // went up since last endFrame()
    this.mouseDelta = { x: 0, y: 0 };
    this.mouseButtons = new Set();
    this.mousePressed = new Set();
    this.wheel = 0;
    this.pointerLocked = false;

    this._onKeyDown = (e) => {
      if (e.repeat) return;
      this.held.add(e.code);
      this.pressed.add(e.code);
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
    this._onClickToLock = () => {
      if (!this.pointerLocked) this.dom.requestPointerLock?.();
    };

    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('mousedown', this._onMouseDown);
    window.addEventListener('mouseup', this._onMouseUp);
    window.addEventListener('mousemove', this._onMouseMove);
    window.addEventListener('wheel', this._onWheel, { passive: true });
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
    this.dom.addEventListener('click', this._onClickToLock);
  }

  isDown(code) { return this.held.has(code); }
  wasPressed(code) { return this.pressed.has(code); }
  wasReleased(code) { return this.released.has(code); }
  mouseDown(btn = 0) { return this.mouseButtons.has(btn); }
  mouseWasPressed(btn = 0) { return this.mousePressed.has(btn); }

  // Movement vector in local space: x = strafe (+right), y = forward (+forward).
  moveAxis() {
    let x = 0, y = 0;
    if (this.isDown('KeyW') || this.isDown('ArrowUp')) y += 1;
    if (this.isDown('KeyS') || this.isDown('ArrowDown')) y -= 1;
    if (this.isDown('KeyD') || this.isDown('ArrowRight')) x += 1;
    if (this.isDown('KeyA') || this.isDown('ArrowLeft')) x -= 1;
    return { x, y };
  }

  consumeMouseDelta() {
    const d = { x: this.mouseDelta.x, y: this.mouseDelta.y };
    this.mouseDelta.x = 0; this.mouseDelta.y = 0;
    return d;
  }

  // Read + clear the wheel accumulator (sign: +1 down / -1 up). Consumed so it
  // can't double-fire across multiple fixed sim steps in one frame.
  consumeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  // Call at the end of each frame to clear edge-triggered state.
  endFrame() {
    this.pressed.clear();
    this.released.clear();
    this.mousePressed.clear();
    this.wheel = 0;
  }
}

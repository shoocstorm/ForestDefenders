// Procedural audio engine (AUDIO_SPEC §1). 3-bus architecture: a master gain
// sums three independent sub-buses (SFX / Music / Ambient), each with its own
// volume control. All sound is synthesized via the Web Audio API — no external
// asset files. The AudioContext is created lazily and resumed on the first user
// gesture (browsers block autoplay until interaction).
//
// SFX one-shots, generative music, and ambient beds are owned by their own
// modules (SFX.js / Music.js / Ambient.js) but route through this engine's buses.

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buses = null;          // { sfx, music, ambient } GainNodes
    this.enabled = false;
    // Persisted volume settings (AUDIO_SPEC §5). Defaults match the spec.
    this.settings = { master: 0.9, sfx: 0.9, music: 0.4, ambient: 0.55 };
    this._sfx = null;
    this._music = null;
    this._ambient = null;
    this._duckAmount = 0;       // 0..1 music duck (boss intro / victory / defeat)
    this._duckTarget = 0;
    this._noiseBuffer = null;   // shared white-noise source for SFX + wind
  }

  // Lazily create the AudioContext + buses. Called on the first user gesture so
  // audio respects browser autoplay policies. Idempotent — safe to call repeatedly.
  resume() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.settings.master;
    this.master.connect(ctx.destination);

    const mkBus = (vol) => {
      const g = ctx.createGain();
      g.gain.value = vol;
      g.connect(this.master);
      return g;
    };
    this.buses = {
      sfx: mkBus(this.settings.sfx),
      music: mkBus(this.settings.music),
      ambient: mkBus(this.settings.ambient),
    };

    // Pre-render a 2s white-noise buffer reused by noise-based SFX + wind beds.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noiseBuffer = buf;

    // Wire sub-controllers now that buses exist.
    this._sfx?.init(this);
    this._music?.init(this);
    this._ambient?.init(this);
    this.enabled = true;
  }

  setSFX(s) { this._sfx = s; }
  setMusic(m) { this._music = m; }
  setAmbient(a) { this._ambient = a; }

  // --- Volume settings (persisted in the save via GameManager) -------------
  setVolumes(v) {
    Object.assign(this.settings, v);
    if (!this.ctx) return;
    this.master.gain.value = this.settings.master;
    this.buses.sfx.gain.value = this.settings.sfx;
    this.buses.music.gain.value = this.settings.music * (1 - this._duckAmount);
    this.buses.ambient.gain.value = this.settings.ambient;
  }

  loadSettings(d) {
    if (!d) return;
    const s = d.settings;
    if (s) {
      if (s.vol_master != null) this.settings.master = s.vol_master;
      if (s.vol_sfx != null) this.settings.sfx = s.vol_sfx;
      if (s.vol_music != null) this.settings.music = s.vol_music;
      if (s.vol_ambient != null) this.settings.ambient = s.vol_ambient;
    }
  }

  // --- Music ducking (AUDIO_SPEC §3.2): -6dB dip on boss/victory/defeat. ---
  duck(on) {
    this._duckTarget = on ? 0.5 : 0;
  }

  // Per-frame: ease the duck toward target + drive the music look-ahead
  // scheduler + ambient event timer. All three are no-ops until resume().
  update(dt) {
    if (!this.ctx) return;
    if (this._duckAmount !== this._duckTarget) {
      const speed = 4; // seconds to fully transition
      this._duckAmount += (this._duckTarget - this._duckAmount) * Math.min(1, dt * speed);
      this.buses.music.gain.value = this.settings.music * (1 - this._duckAmount * 0.5);
    }
    this._music?.update(dt);
    this._ambient?.update(dt);
  }

  // --- Generative music (AUDIO_SPEC §3) -------------------------------------
  // Both sub-controllers gate on `this.ctx` themselves, so it's safe to forward
  // even before the first user gesture (they'll just no-op until resume()).
  startMusic(trackKey) { this._music?.start(trackKey); }
  stopMusic() { this._music?.stop(); }
  setMusicIntensity(intense) { this._music?.setIntensity(intense); }

  // --- Ambient beds (AUDIO_SPEC §4) -----------------------------------------
  startAmbient(biomeKey) { this._ambient?.start(biomeKey); }
  stopAmbient() { this._ambient?.stop(); }

  // --- SFX convenience pass-throughs (one-shots) ----------------------------
  shoot(weaponId, element) { this._sfx?.shoot(weaponId, element); }
  hit(element, effective) { this._sfx?.hit(element, effective); }
  hurt() { this._sfx?.hurt(); }
  pickup() { this._sfx?.pickup(); }
  coin() { this._sfx?.coin(); }
  coinCascade(n) { this._sfx?.coinCascade(n); }
  death(element) { this._sfx?.death(element); }
  explosion() { this._sfx?.explosion(); }
  zap() { this._sfx?.zap(); }
  ui(kind) { this._sfx?.ui(kind); }
  starChime(idx) { this._sfx?.starChime(idx); }
  jump() { this._sfx?.jump(); }
  melee(kind) { this._sfx?.melee(kind); }
  rescue() { this._sfx?.rescue(); }
  levelUp() { this._sfx?.levelUp(); }
  achievement() { this._sfx?.achievement(); }
  powerUp(kind) { this._sfx?.powerUp(kind); }
  
  // Disable music for now
  startMusic(levelKey) { /* disabled */ }
  stopMusic() { /* disabled */ }
  setMusicIntensity(intense) { /* disabled */ }

  startAmbient(biomeKey) { /* disabled */ }
  stopAmbient() { /* disabled */ }
}

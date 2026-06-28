// Synthesized one-shot sound effects (AUDIO_SPEC §2). Each effect is a short
// generator function that builds oscillators / noise bursts with envelopes on
// the SFX bus. No external audio files — everything is real-time Web Audio.
//
// The voice pool is generous but bounded: short sounds auto-stop via envelope
// decay, so we never accumulate live nodes. A master compressor on the bus
// keeps rapid-fire (machine gun) from clipping.

// Per-weapon shoot character (AUDIO_SPEC §2: "per-weapon pitch/tone").
const SHOOT_VOICE = {
  ACORN:      { freq: 620, type: 'square',   dur: 0.10, sweep: -180, noise: 0.0 },
  GANON:      { freq: 880, type: 'sine',     dur: 0.18, sweep: 320,  noise: 0.0 },
  MACHINE:    { freq: 240, type: 'sawtooth', dur: 0.06, sweep: -60,  noise: 0.3 },
  BOOM:       { freq: 90,  type: 'sine',     dur: 0.30, sweep: -40,  noise: 0.6 },
  LASER:      { freq: 1200,type: 'sine',     dur: 0.12, sweep: -500, noise: 0.1 },
  SHOTGUN:    { freq: 160, type: 'sawtooth', dur: 0.14, sweep: -80,  noise: 0.5 },
  FIRE_BULLET:{ freq: 220, type: 'triangle', dur: 0.16, sweep: -120, noise: 0.4 },
  BOW:        { freq: 520, type: 'triangle', dur: 0.12, sweep: -200, noise: 0.15 },
  TOROID:     { freq: 700, type: 'sine',     dur: 0.22, sweep: 400,  noise: 0.2 },
};

// Element-themed death accents (AUDIO_SPEC §2: "element-themed explosion").
const DEATH_VOICE = {
  WOOD:  { freq: 180, sweep: -100, noise: 0.5 },
  FIRE:  { freq: 140, sweep: 60,   noise: 0.7 },
  ICE:   { freq: 900, sweep: -700, noise: 0.3 },
  WATER: { freq: 300, sweep: -150, noise: 0.5 },
  METAL: { freq: 500, sweep: -200, noise: 0.4 },
  EARTH: { freq: 80,  sweep: -30,  noise: 0.7 },
};

export class SFX {
  init(audio) {
    this.audio = audio;
    const ctx = audio.ctx;
    // A gentle compressor keeps the SFX bus from clipping during rapid fire.
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -10;
    this.comp.knee.value = 12;
    this.comp.ratio.value = 6;
    this.comp.attack.value = 0.002;
    this.comp.release.value = 0.12;
    this.comp.connect(audio.buses.sfx);
  }

  // Core tone helper: an oscillator with a frequency sweep + ADSR-style gain.
  _tone({ freq, type = 'sine', dur = 0.15, sweep = 0, gain = 0.4, dest }) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.004);       // fast attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);  // exp decay
    osc.connect(g).connect(dest || this.comp);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise burst (impacts, explosions, smoke).
  _noise({ dur = 0.2, gain = 0.4, filter = 'lowpass', freq = 1000, q = 1, dest }) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.audio._noiseBuffer;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.comp);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot(weaponId, _element) {
    if (!this.audio?.ctx) return;
    const v = SHOOT_VOICE[weaponId] || SHOOT_VOICE.ACORN;
    this._tone({ ...v, gain: 0.28 });
    if (v.noise > 0) this._noise({ dur: v.dur * 0.8, gain: 0.18 * v.noise, filter: 'highpass', freq: 800 });
  }

  // Hit feedback: zing for WEAK!, thud for RESIST, neutral click otherwise.
  hit(element, effective) {
    if (!this.audio?.ctx) return;
    if (effective === 'weak') {
      this._tone({ freq: 1400, type: 'sine', dur: 0.08, sweep: 600, gain: 0.18 });
    } else if (effective === 'resist') {
      this._tone({ freq: 120, type: 'sine', dur: 0.12, sweep: -40, gain: 0.22 });
      this._noise({ dur: 0.08, gain: 0.12, filter: 'lowpass', freq: 400 });
    } else {
      this._tone({ freq: 600, type: 'square', dur: 0.05, sweep: -200, gain: 0.12 });
    }
  }

  hurt() {
    if (!this.audio?.ctx) return;
    this._tone({ freq: 200, type: 'sawtooth', dur: 0.25, sweep: -120, gain: 0.3 });
    this._noise({ dur: 0.15, gain: 0.2, filter: 'lowpass', freq: 800 });
  }

  pickup() {
    if (!this.audio?.ctx) return;
    // Rising arpeggio (AUDIO_SPEC §2: "rising arpeggio for gold").
    const base = 523; // C5
    [0, 4, 7].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: base * Math.pow(2, semi / 12), type: 'triangle', dur: 0.12, gain: 0.16 });
      }, i * 50);
    });
  }

  coin() {
    if (!this.audio?.ctx) return;
    this._tone({ freq: 988, type: 'square', dur: 0.06, sweep: 200, gain: 0.1 });
  }

  // Multiple staccato escalating tones for a burst of collected coins.
  coinCascade(n) {
    if (!this.audio?.ctx) return;
    const count = Math.min(n, 8);
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 700 + i * 90, type: 'square', dur: 0.05, gain: 0.1 });
      }, i * 45);
    }
  }

  death(element) {
    if (!this.audio?.ctx) return;
    const v = DEATH_VOICE[element] || DEATH_VOICE.WOOD;
    this._tone({ ...v, type: 'sawtooth', gain: 0.28 });
    this._noise({ dur: 0.3, gain: 0.25 * v.noise, filter: 'lowpass', freq: 1200 });
  }

  explosion() {
    if (!this.audio?.ctx) return;
    this._tone({ freq: 80, type: 'sine', dur: 0.4, sweep: -50, gain: 0.35 });
    this._noise({ dur: 0.35, gain: 0.3, filter: 'lowpass', freq: 600, q: 2 });
  }

  // Electric zap (Toroid Cannon).
  zap() {
    if (!this.audio?.ctx) return;
    this._tone({ freq: 1800, type: 'sawtooth', dur: 0.15, sweep: -1000, gain: 0.15 });
    this._noise({ dur: 0.1, gain: 0.15, filter: 'highpass', freq: 2000 });
  }

  ui(kind) {
    if (!this.audio?.ctx) return;
    if (kind === 'click') this._tone({ freq: 440, type: 'square', dur: 0.04, gain: 0.08 });
    else if (kind === 'confirm') {
      this._tone({ freq: 523, type: 'square', dur: 0.06, gain: 0.1 });
      setTimeout(() => this.audio?.ctx && this._tone({ freq: 784, type: 'square', dur: 0.08, gain: 0.1 }), 50);
    } else if (kind === 'cancel') {
      this._tone({ freq: 330, type: 'square', dur: 0.08, gain: 0.08 });
    } else if (kind === 'error') {
      this._tone({ freq: 200, type: 'sawtooth', dur: 0.12, gain: 0.1 });
    }
  }

  // Bright rising bell arpeggio for victory stars (AUDIO_SPEC §2). Escalating
  // pitch_base per star so the 3rd star rings higher than the 1st.
  starChime(idx) {
    if (!this.audio?.ctx) return;
    const base = 659 * Math.pow(2, idx / 12); // E5, climbing per star
    [0, 7, 12, 16].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: base * Math.pow(2, semi / 12), type: 'sine', dur: 0.4, gain: 0.14 });
      }, i * 80);
    });
  }

  jump() {
    if (!this.audio?.ctx) return;
    this._tone({ freq: 300, type: 'sine', dur: 0.10, sweep: 200, gain: 0.1 });
  }

  melee(kind) {
    if (!this.audio?.ctx) return;
    if (kind === 'kick') {
      this._noise({ dur: 0.1, gain: 0.2, filter: 'bandpass', freq: 600, q: 2 });
    } else { // tail
      this._tone({ freq: 220, type: 'triangle', dur: 0.18, sweep: -80, gain: 0.14 });
      this._noise({ dur: 0.12, gain: 0.12, filter: 'bandpass', freq: 800, q: 1.5 });
    }
  }

  rescue() {
    if (!this.audio?.ctx) return;
    [0, 4, 7, 12].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 587 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.2, gain: 0.13 });
      }, i * 70);
    });
  }

  levelUp() {
    if (!this.audio?.ctx) return;
    [0, 4, 7, 12, 16].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 523 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.3, gain: 0.16 });
      }, i * 90);
    });
  }

  achievement() {
    if (!this.audio?.ctx) return;
    [0, 7, 12].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 880 * Math.pow(2, semi / 12), type: 'sine', dur: 0.25, gain: 0.12 });
      }, i * 100);
    });
  }
}

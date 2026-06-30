// Synthesized one-shot sound effects (AUDIO_SPEC §2). Each effect is a short
// generator function that builds oscillators / noise bursts with envelopes on
// the SFX bus. No external audio files — everything is real-time Web Audio.
//
// The voice pool is generous but bounded: short sounds auto-stop via envelope
// decay, so we never accumulate live nodes. A master compressor on the bus
// keeps rapid-fire (machine gun) from clipping.

// Per-weapon shoot character (AUDIO_SPEC §2: "per-weapon pitch/tone"). Each
// voice is layered in shoot(): a tonal `body`, an optional `sub` octave thump
// for weight, and a tuned `noise` transient. Optional fields:
//   sub      — gain of a half-pitch triangle thump (body weight). 0 = none.
//   nfilter / nfreq / nq / nsweep — noise-burst tone (texture/whoosh).
//   detune   — per-shot pitch jitter in cents (liveliness on rapid fire).
//   vibrato  — { rate, depth } warble on the body (electric/energetic feel).
const SHOOT_VOICE = {
  // Woody "thock" — crisp square pluck with a short bright tick.
  ACORN:   { freq: 660, type: 'square',   dur: 0.09, sweep: -240, gain: 0.26, detune: 50,
             sub: 0.10, noise: 0.5, nfilter: 'bandpass', nfreq: 1400, nq: 1.4 },
  // Energetic upward "pew" with a bit of body.
  GANON:   { freq: 760, type: 'sine',     dur: 0.16, sweep: 420,  gain: 0.24, detune: 45,
             sub: 0.12, noise: 0.25, nfilter: 'highpass', nfreq: 1200, nq: 0.8 },
  // Punchy rapid rattle — tight saw with a bandpass spit.
  MACHINE: { freq: 250, type: 'sawtooth', dur: 0.055,sweep: -80,  gain: 0.22, detune: 70,
             sub: 0.08, noise: 0.45, nfilter: 'bandpass', nfreq: 1700, nq: 2.2 },
  // Deep cannon boom — low sine drop with a fat lowpass blast.
  BOOM:    { freq: 95,  type: 'sine',     dur: 0.30, sweep: -45,  gain: 0.34, detune: 30,
             sub: 0.0,  noise: 0.7, nfilter: 'lowpass', nfreq: 700, nq: 1.2, nsweep: -300 },
  // Sci-fi laser zap — fast descending whistle with a sparkle.
  LASER:   { freq: 1300,type: 'sine',     dur: 0.12, sweep: -560, gain: 0.18, detune: 25,
             sub: 0.0,  noise: 0.2, nfilter: 'highpass', nfreq: 2600, nq: 0.7 },
  // Chunky shotgun blast — big lowpass spread over a low thump.
  SHOTGUN: { freq: 150, type: 'sawtooth', dur: 0.14, sweep: -90,  gain: 0.26, detune: 40,
             sub: 0.14, noise: 0.7, nfilter: 'lowpass', nfreq: 1600, nq: 0.8, nsweep: -900 },
  // Twangy bow release — soft triangle pluck + string brush.
  BOW:     { freq: 540, type: 'triangle', dur: 0.13, sweep: -240, gain: 0.20, detune: 35,
             sub: 0.0,  noise: 0.25, nfilter: 'bandpass', nfreq: 2200, nq: 1.6 },
  // Electric toroid — rising warble with a fizzy top.
  TOROID:  { freq: 680, type: 'sine',     dur: 0.22, sweep: 460,  gain: 0.20, detune: 20,
             sub: 0.0,  noise: 0.3, nfilter: 'highpass', nfreq: 2400, nq: 0.9,
             vibrato: { rate: 34, depth: 90 } },
  // FIRE_BULLET is hand-synthesized in _fireShot() for extra juice.
  FIRE_BULLET:{ freq: 220, type: 'triangle', dur: 0.16, sweep: -120, gain: 0.24, noise: 0.4 },
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

  // Small symmetric random jitter in cents, returned as a frequency multiplier.
  // Sprinkled on repeated one-shots so rapid fire / cascades feel alive instead
  // of machine-perfect — the secret sauce behind "playful".
  _wobble(cents) {
    return Math.pow(2, ((Math.random() * 2 - 1) * cents) / 1200);
  }

  // Core tone helper: an oscillator with a pitch envelope + ADSR-style gain.
  //   sweep   — linear-ish target offset (exp ramp to freq + sweep)
  //   curve   — array of freq *multipliers* shaped over dur (overrides sweep);
  //             e.g. [1, 1.5, 1.1] gives a springy "boing" overshoot.
  //   vibrato — { rate, depth } cents of LFO warble for a cartoony wobble.
  //   detune  — random cents of per-call pitch jitter (liveliness).
  _tone({ freq, type = 'sine', dur = 0.15, sweep = 0, gain = 0.4,
          curve = null, vibrato = null, detune = 0, attack = 0.004, dest }) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    if (detune) freq *= this._wobble(detune);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    if (curve) {
      const f = new Float32Array(curve.length);
      for (let i = 0; i < curve.length; i++) f[i] = Math.max(20, freq * curve[i]);
      osc.frequency.setValueCurveAtTime(f, t, dur);
    } else {
      osc.frequency.setValueAtTime(freq, t);
      if (sweep) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freq + sweep), t + dur);
    }
    // Vibrato LFO modulating oscillator frequency (depth in cents → Hz at freq).
    if (vibrato) {
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = vibrato.rate;
      lfoGain.gain.value = freq * (Math.pow(2, vibrato.depth / 1200) - 1);
      lfo.connect(lfoGain).connect(osc.frequency);
      lfo.start(t);
      lfo.stop(t + dur + 0.02);
    }
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);      // attack
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);  // exp decay
    osc.connect(g).connect(dest || this.comp);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  // Filtered noise burst (impacts, explosions, smoke).
  //   sweep  — ramp the filter cutoff to `freq + sweep` over dur (whoosh/sizzle).
  //   attack — fade-in time; 0 = instant transient. A short attack softens the
  //            click into a "fwoomp" for whooshy layers like the fire bullet.
  _noise({ dur = 0.2, gain = 0.4, filter = 'lowpass', freq = 1000, q = 1, sweep = 0, attack = 0, dest }) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.audio._noiseBuffer;
    src.loop = true;
    src.playbackRate.value = 0.8 + Math.random() * 0.4; // vary grain so repeats differ
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.linearRampToValueAtTime(Math.max(40, freq + sweep), t + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    if (attack > 0) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain, t + attack);
    } else {
      g.gain.setValueAtTime(gain, t);
    }
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(dest || this.comp);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  shoot(weaponId, _element) {
    if (!this.audio?.ctx) return;
    if (weaponId === 'FIRE_BULLET') { this._fireShot(); return; }
    const v = SHOOT_VOICE[weaponId] || SHOOT_VOICE.ACORN;

    // Tonal body — per-shot pitch jitter so repeated fire dances, not stutters.
    this._tone({
      freq: v.freq, type: v.type, dur: v.dur, sweep: v.sweep,
      gain: v.gain ?? 0.26, detune: v.detune ?? 40, vibrato: v.vibrato || null,
    });

    // Sub-octave thump adds weight/punch for the heavier weapons.
    if (v.sub) {
      this._tone({ freq: v.freq * 0.5, type: 'triangle', dur: v.dur * 0.7,
        sweep: -v.freq * 0.18, gain: v.sub, detune: 50 });
    }

    // Tuned noise transient — the "spit"/crack texture, tonally per weapon.
    if (v.noise > 0) {
      this._noise({
        dur: v.dur * 0.85, gain: 0.2 * v.noise,
        filter: v.nfilter || 'highpass', freq: v.nfreq ?? 800,
        q: v.nq ?? 0.8, sweep: v.nsweep || 0,
      });
    }
  }

  // FIRE_BULLET — a juicy four-layer "FWOOSH": an air-ignition swell, a launch
  // thump, a fluttering flame body, and a crackling ember sizzle. Per-shot
  // randomness keeps rapid fire alive.
  _fireShot() {
    const ctx = this.audio.ctx;
    // 1. Ignition whoosh — bandpass noise cutoff sweeps upward into the shot.
    this._noise({ dur: 0.24, gain: 0.24, filter: 'bandpass', freq: 380, q: 0.7,
      sweep: 2200, attack: 0.018 });
    // 2. Launch thump — low body punch so it lands with weight.
    this._tone({ freq: 130, type: 'sine', dur: 0.18, sweep: -70, gain: 0.22, detune: 25 });
    // 3. Flame body — warm triangle with a fast wide vibrato = roaring flutter.
    this._tone({ freq: 300, type: 'triangle', dur: 0.20, gain: 0.16, detune: 40,
      curve: [1.0, 1.25, 0.9], vibrato: { rate: 32, depth: 110 } });
    // 4. Ember crackle — two staggered highpass sizzle bursts, lightly random.
    this._noise({ dur: 0.10, gain: 0.12, filter: 'highpass', freq: 3200, q: 0.9 });
    setTimeout(() => this.audio?.ctx && this._noise({
      dur: 0.13, gain: 0.1, filter: 'highpass', freq: 4200, q: 1.0,
    }), 35 + Math.random() * 25);
  }

  // Hit feedback: zing for WEAK!, thud for RESIST, neutral click otherwise.
  hit(element, effective) {
    if (!this.audio?.ctx) return;
    if (effective === 'weak') {
      // Bright two-note "sparkle" — feels rewarding and a little cheeky.
      this._tone({ freq: 1320, type: 'triangle', dur: 0.07, sweep: 500, gain: 0.18, detune: 30 });
      setTimeout(() => this.audio?.ctx && this._tone({ freq: 1976, type: 'sine', dur: 0.09, gain: 0.14, detune: 30 }), 40);
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
    // Bubbly rising arpeggio (AUDIO_SPEC §2: "rising arpeggio for gold").
    // Each blip pops upward like a bubble — triangle body + tiny pitch bend.
    const base = 523; // C5
    [0, 4, 7].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({
          freq: base * Math.pow(2, semi / 12), type: 'triangle',
          dur: 0.12, gain: 0.16, detune: 25, curve: [0.8, 1.06, 1.0],
        });
      }, i * 45);
    });
  }

  coin() {
    if (!this.audio?.ctx) return;
    // A little "blip" + a shimmering octave on top — classic coin sparkle.
    this._tone({ freq: 988, type: 'triangle', dur: 0.07, sweep: 240, gain: 0.1, detune: 50 });
    this._tone({ freq: 1976, type: 'sine', dur: 0.05, gain: 0.05, detune: 50 });
  }

  // A cheerful pentatonic run for a burst of collected coins — no sour notes,
  // gentle swing in the timing keeps it bouncy rather than mechanical.
  coinCascade(n) {
    if (!this.audio?.ctx) return;
    const count = Math.min(n, 8);
    const penta = [0, 2, 4, 7, 9, 12, 14, 16]; // C major pentatonic, ascending
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({
          freq: 660 * Math.pow(2, penta[i] / 12), type: 'triangle',
          dur: 0.07, gain: 0.1, detune: 20, curve: [0.85, 1.04, 1.0],
        });
      }, i * 40 + Math.random() * 12);
    }
  }

  death(element) {
    if (!this.audio?.ctx) return;
    const v = DEATH_VOICE[element] || DEATH_VOICE.WOOD;
    // Comedic descending "wah" — a slide down with a wobble, plus the original
    // element-tinted noise puff, so deaths read goofy rather than grim.
    this._tone({
      ...v, type: 'triangle', gain: 0.28, dur: 0.24,
      curve: [1.0, 0.78, 0.55], vibrato: { rate: 14, depth: 50 }, detune: 30,
    });
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
        this._tone({ freq: base * Math.pow(2, semi / 12), type: 'sine', dur: 0.4, gain: 0.14, detune: 8, vibrato: { rate: 5.5, depth: 14 } });
      }, i * 80);
    });
  }

  jump() {
    if (!this.audio?.ctx) return;
    // Springy "boing": pitch overshoots up then settles, with a fast wobble.
    this._tone({
      freq: 320, type: 'triangle', dur: 0.16, gain: 0.12, detune: 40,
      curve: [1.0, 1.9, 1.5, 1.7], vibrato: { rate: 26, depth: 35 },
    });
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
        this._tone({ freq: 587 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.2, gain: 0.13, detune: 12, vibrato: { rate: 6, depth: 18 } });
      }, i * 70);
    });
  }

  levelUp() {
    if (!this.audio?.ctx) return;
    [0, 4, 7, 12, 16].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 523 * Math.pow(2, semi / 12), type: 'triangle', dur: 0.3, gain: 0.16, detune: 10, vibrato: { rate: 7, depth: 16 } });
      }, i * 90);
    });
  }

  achievement() {
    if (!this.audio?.ctx) return;
    [0, 7, 12].forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({ freq: 880 * Math.pow(2, semi / 12), type: 'sine', dur: 0.25, gain: 0.12, detune: 8, vibrato: { rate: 6, depth: 16 } });
      }, i * 100);
    });
  }

  // Exciting fanfare when the hero grabs a magic item / power-up plant. An
  // upward "whoosh" launches it, then a bright arpeggio lands on a sparkling
  // octave chord — a little "ta-da!". `kind` tints the flavour:
  //   'heal'   — warm, round, comforting (HP fruit)
  //   'shield' — shimmering protective swell (fifths)
  //   'buff'   — triumphant major fanfare (default: speed, ammo, etc.)
  powerUp(kind = 'buff') {
    if (!this.audio?.ctx) return;

    // Rising whoosh: a quick pitch-swept noise sweep that "lifts" into the chime.
    this._noise({ dur: 0.14, gain: 0.1, filter: 'bandpass', freq: 1800, q: 0.7 });
    this._tone({ freq: 320, type: 'triangle', dur: 0.16, gain: 0.08, curve: [1, 2.4, 3.2], attack: 0.02 });

    // Arpeggio shape + base pitch per flavour.
    let base, steps, type, top;
    if (kind === 'heal') {
      base = 523; steps = [0, 4, 7, 12]; type = 'triangle'; top = [12, 16, 19]; // C major, warm
    } else if (kind === 'shield') {
      base = 392; steps = [0, 7, 12, 19]; type = 'sine'; top = [12, 19, 24];     // open fifths, airy
    } else {
      base = 587; steps = [0, 4, 7, 11, 14]; type = 'triangle'; top = [12, 16, 19, 24]; // bright major
    }

    // Quick ascending run.
    steps.forEach((semi, i) => {
      setTimeout(() => {
        if (!this.audio?.ctx) return;
        this._tone({
          freq: base * Math.pow(2, semi / 12), type,
          dur: 0.16, gain: 0.16, detune: 10,
          curve: [0.9, 1.05, 1.0], vibrato: { rate: 6, depth: 14 },
        });
      }, i * 55);
    });

    // "Ta-da!" — a sparkling stacked chord lands just after the run resolves.
    const landAt = steps.length * 55 + 30;
    setTimeout(() => {
      if (!this.audio?.ctx) return;
      top.forEach((semi) => {
        this._tone({
          freq: base * Math.pow(2, semi / 12), type: 'sine',
          dur: 0.5, gain: 0.12, detune: 8, vibrato: { rate: 5.5, depth: 16 },
        });
      });
    }, landAt);
  }
}

// Ambient soundscapes (AUDIO_SPEC §4). Each biome gets a continuous bed built
// from three layers routed through the ambient bus:
//   • drone  — a low sustained oscillator bed (the biome's "mood" tone)
//   • wind   — filtered white noise with a slow LFO on the filter (gusts)
//   • events — randomized one-shots (bird chirps L1, fire crackle L2, chimes L3)
//
// Start/stop cross-fades so biome transitions are seamless. The ambient bus is
// independent of music so both can play simultaneously.

// Per-biome ambient config.
const BEDS = {
  menu:   { drone: 110, droneType: 'sine', wind: 0.4, windFreq: 500, event: 'bird',  eventRate: 6 },
  L1:     { drone: 130, droneType: 'sine', wind: 0.5, windFreq: 600, event: 'bird',  eventRate: 5 },
  L2:     { drone: 90,  droneType: 'sawtooth', wind: 0.7, windFreq: 400, event: 'crackle', eventRate: 3 },
  L3:     { drone: 75,  droneType: 'sine', wind: 0.4, windFreq: 800, event: 'chime', eventRate: 7 },
  victory:{ drone: 196, droneType: 'sine', wind: 0.2, windFreq: 900, event: null, eventRate: 99 },
  defeat: { drone: 65,  droneType: 'sine', wind: 0.3, windFreq: 300, event: null, eventRate: 99 },
};

export class Ambient {
  init(audio) {
    this.audio = audio;
    this._nodes = null;       // active bed nodes (drone osc, wind src, lfo)
    this._gain = null;
    this._key = null;
    this._eventTimer = 0;
  }

  start(key) {
    if (!this.audio?.ctx) return;
    if (this._key === key && this._nodes) return;
    this._key = key;
    // Cross-fade: stop old bed over 1s, start new one.
    this._fadeOutAndStop(1.0);
    this._startBed(BEDS[key] || BEDS.L1);
  }

  stop() {
    this._key = null;
    this._fadeOutAndStop(1.0);
  }

  _fadeOutAndStop(dur) {
    if (!this._nodes) return;
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const g = this._gain;
    if (g) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(g.gain.value, t);
      g.gain.linearRampToValueAtTime(0, t + dur);
    }
    const old = this._nodes;
    setTimeout(() => this._dispose(old), dur * 1000 + 100);
    this._nodes = null;
    this._gain = null;
  }

  _startBed(cfg) {
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5, t + 1.5);
    g.connect(this.audio.buses.ambient);
    this._gain = g;

    // Drone: two detuned oscillators for a richer pad.
    const droneFreq = cfg.drone;
    const oscs = [];
    for (const det of [0, 4]) {
      const osc = ctx.createOscillator();
      osc.type = cfg.droneType;
      osc.frequency.value = droneFreq * (1 + det * 0.01);
      const dg = ctx.createGain();
      dg.gain.value = 0.08;
      osc.connect(dg).connect(g);
      osc.start(t);
      oscs.push(osc);
    }

    // Wind: looping noise through a lowpass with an LFO sweeping the cutoff.
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = this.audio._noiseBuffer;
    windSrc.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = cfg.windFreq;
    windFilter.Q.value = 0.8;
    const windGain = ctx.createGain();
    windGain.gain.value = cfg.wind * 0.06;
    windSrc.connect(windFilter).connect(windGain).connect(g);
    windSrc.start(t);

    // LFO modulating the wind filter cutoff (gusts).
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = cfg.windFreq * 0.4;
    lfo.connect(lfoGain).connect(windFilter.frequency);
    lfo.start(t);

    this._nodes = { oscs, windSrc, lfo, windFilter, windGain };
    this._eventTimer = cfg.eventRate;
  }

  _dispose(nodes) {
    try {
      nodes.oscs?.forEach((o) => o.stop());
      nodes.windSrc?.stop();
      nodes.lfo?.stop();
    } catch { /* already stopped */ }
  }

  // Per-frame: fire randomized ambient events on a timer.
  update(dt) {
    if (!this._nodes || !this._key) return;
    const cfg = BEDS[this._key];
    if (!cfg?.event) return;
    this._eventTimer -= dt;
    if (this._eventTimer > 0) return;
    this._eventTimer = cfg.eventRate * (0.6 + Math.random() * 0.8);
    this._playEvent(cfg.event);
  }

  _playEvent(kind) {
    const ctx = this.audio.ctx;
    if (!ctx) return;
    if (kind === 'bird') {
      // Quick chirp: two fast rising sines.
      const base = 1800 + Math.random() * 1200;
      for (const [semi, delay] of [[0, 0], [5, 0.08], [3, 0.16]]) {
        const t = ctx.currentTime + delay;
        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = base * Math.pow(2, semi / 12);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.03, t + 0.01);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(g).connect(this.audio.buses.ambient);
        osc.start(t);
        osc.stop(t + 0.15);
      }
    } else if (kind === 'crackle') {
      // Fire crackle: short filtered noise pops.
      for (let i = 0; i < 4; i++) {
        const t = ctx.currentTime + Math.random() * 0.3;
        const src = ctx.createBufferSource();
        src.buffer = this.audio._noiseBuffer;
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 800 + Math.random() * 2000;
        f.Q.value = 3;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.04, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        src.connect(f).connect(g).connect(this.audio.buses.ambient);
        src.start(t);
        src.stop(t + 0.05);
      }
    } else if (kind === 'chime') {
      // Crystal chime: a single bright bell.
      const base = 1200 + Math.random() * 1600;
      const t = ctx.currentTime;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = base;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.5);
      osc.connect(g).connect(this.audio.buses.ambient);
      osc.start(t);
      osc.stop(t + 1.6);
    }
  }
}

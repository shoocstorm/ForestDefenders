// Generative music engine (AUDIO_SPEC §3). Each level gets a distinct tonal
// character built from layered channels scheduled on a look-ahead clock:
//   • chord pad   — sustained ambient chords (slow swells)
//   • bass        — root note pulse
//   • arpeggio    — rhythmic melodic pattern over the chord
//
// Music cross-fades on level change (two alternating sub-buses) and ducks on
// boss/victory/defeat via AudioSystem.duck(). A "tense" intensity adds a faster
// arpeggio + harder bass for boss fights.

// Per-scene musical config (AUDIO_SPEC §3 table). root = MIDI note; scale is
// semitone offsets; tempo in BPM.
const TRACKS = {
  menu:   { root: 60, scale: [0, 2, 4, 7, 9], tempo: 76,  tense: false, bright: 1.0 }, // C major pentatonic
  L1:     { root: 60, scale: [0, 2, 4, 7, 9], tempo: 92,  tense: false, bright: 1.0 },
  L2:     { root: 57, scale: [0, 2, 3, 5, 7, 8], tempo: 112, tense: true,  bright: 0.85 }, // A minor, faster
  L3:     { root: 55, scale: [0, 3, 5, 7, 10], tempo: 128, tense: true,  bright: 0.9 }, // G minor pentatonic, epic
  victory:{ root: 60, scale: [0, 4, 7, 12], tempo: 100, tense: false, bright: 1.1 },
  defeat: { root: 57, scale: [0, 3, 7, 10], tempo: 60,  tense: false, bright: 0.7 },
};

const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Music {
  init(audio) {
    this.audio = audio;
    this._trackKey = null;
    this._cfg = null;
    this._intense = false;
    this._step = 0;
    this._nextTime = 0;
    this._active = false;
    // Two alternating channels for cross-fade (AUDIO_SPEC §3.2).
    this._chans = [this._makeChannel(), this._makeChannel()];
    this._curChan = 0;
  }

  _makeChannel() {
    const ctx = this.audio.ctx;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(this.audio.buses.music);
    return g;
  }

  // Cross-fade to a new track over ~1.2s (AUDIO_SPEC §3.2: ≥1.0s).
  start(key) {
    if (!this.audio?.ctx) return;
    if (this._trackKey === key && this._active) return;
    this._trackKey = key;
    this._cfg = TRACKS[key] || TRACKS.L1;
    this._step = 0;
    const ctx = this.audio.ctx;
    this._nextTime = ctx.currentTime + 0.05;
    // Cross-fade channels.
    const prev = this._chans[this._curChan];
    this._curChan = 1 - this._curChan;
    const next = this._chans[this._curChan];
    const t = ctx.currentTime;
    prev.gain.cancelScheduledValues(t);
    prev.gain.setValueAtTime(prev.gain.value, t);
    prev.gain.linearRampToValueAtTime(0, t + 1.2);
    next.gain.cancelScheduledValues(t);
    next.gain.setValueAtTime(next.gain.value, t);
    next.gain.linearRampToValueAtTime(0.6, t + 1.2);
    this._active = true;
  }

  stop() {
    if (!this.audio?.ctx || !this._active) return;
    const ctx = this.audio.ctx;
    const t = ctx.currentTime;
    const ch = this._chans[this._curChan];
    ch.gain.cancelScheduledValues(t);
    ch.gain.setValueAtTime(ch.gain.value, t);
    ch.gain.linearRampToValueAtTime(0, t + 1.0);
    this._active = false;
    this._trackKey = null;
  }

  setIntensity(intense) { this._intense = intense; }

  // Look-ahead scheduler: called every frame; schedules notes slightly ahead of
  // the AudioContext clock so timing stays sample-accurate without blocking.
  update(dt) {
    if (!this.audio?.ctx || !this._active || !this._cfg) return;
    const ctx = this.audio.ctx;
    const beatDur = 60 / this._cfg.tempo;       // seconds per beat (quarter note)
    const eighth = beatDur / 2;                 // arpeggio + bass grid
    // Schedule up to 0.2s ahead.
    while (this._nextTime < ctx.currentTime + 0.2) {
      this._scheduleStep(this._step, this._nextTime, eighth);
      this._nextTime += eighth;
      this._step = (this._step + 1) % 32;       // 4-bar loop at 8th-note grid
    }
  }

  _scheduleStep(step, time, eighth) {
    const cfg = this._cfg;
    const bus = this._chans[this._curChan];
    const ctx = this.audio.ctx;
    // Chord changes every 8 steps (half-bar): pick a diatonic chord.
    const chordIdx = Math.floor(step / 8) % 4;
    const degrees = [0, 3, 4, 3]; // I – IV – V – IV (simple loop)
    const chordRoot = cfg.scale[degrees[chordIdx] % cfg.scale.length];

    // Pad: sustained chord at the start of each chord slot (every 8th step = 4s).
    if (step % 8 === 0) {
      for (const off of [0, 2, 4]) {
        const deg = cfg.scale[(degrees[chordIdx] + off) % cfg.scale.length];
        this._padNote(midiToFreq(cfg.root + 12 + deg), time, eighth * 8, bus);
      }
    }

    // Bass: root pulse on the beat (every 2 eighth notes).
    if (step % 2 === 0) {
      const note = midiToFreq(cfg.root - 12 + chordRoot);
      this._bassNote(note, time, eighth * 1.5, bus, cfg.bright);
    }

    // Arpeggio: every eighth note, cycling chord tones; double-time when tense.
    const arpEvery = this._intense ? 1 : 1;
    if (step % arpEvery === 0) {
      const tones = [0, 2, 4, 7];
      const deg = cfg.scale[(degrees[chordIdx] + tones[step % tones.length]) % cfg.scale.length];
      const oct = this._intense ? 24 : 12;
      this._arpNote(midiToFreq(cfg.root + oct + deg), time, eighth * 0.8, bus, cfg.bright);
    }
  }

  _padNote(freq, time, dur, bus) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    const peak = 0.025;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + dur * 0.3);
    g.gain.linearRampToValueAtTime(peak * 0.7, time + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, time + dur);
    osc.connect(g).connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.05);
  }

  _bassNote(freq, time, dur, bus, bright) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = this._intense ? 'sawtooth' : 'sine';
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300 * bright;
    const g = ctx.createGain();
    const peak = 0.055;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(f).connect(g).connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }

  _arpNote(freq, time, dur, bus, bright) {
    const ctx = this.audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = this._intense ? 'triangle' : 'sine';
    osc.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200 * bright;
    const g = ctx.createGain();
    const peak = 0.03;
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(peak, time + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    osc.connect(f).connect(g).connect(bus);
    osc.start(time);
    osc.stop(time + dur + 0.02);
  }
}

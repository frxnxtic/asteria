// Генеративная музыка и звуки на Web Audio: тёплые пэды, челеста-мелодия,
// реверб, шаги, колокольчики событий. Оркестрово-волшебное настроение.
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this._chordI = 0;
    this._nextMelody = 0;
    this._nextChord = 0;
    this.stepAcc = 0;
  }

  init() {
    if (this.ctx) return;
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();

    this.master = ctx.createGain();
    this.master.gain.value = 0.55;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);

    // реверб: шумовой импульс с экспоненциальным спадом
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) {
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
      }
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain();
    this.revGain.gain.value = .5;
    this.reverb.connect(this.revGain).connect(this.master);

    this.musBus = ctx.createGain(); this.musBus.gain.value = .8;
    this.musBus.connect(this.master); this.musBus.connect(this.reverb);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = .9;
    this.sfxBus.connect(this.master); this.sfxBus.connect(this.reverb);

    this._nextChord = ctx.currentTime + .3;
    this._nextMelody = ctx.currentTime + 2.5;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, .1);
  }

  /* ── примитивы ── */
  _note(freq, t0, dur, { type = "sine", gain = .1, att = .01, bus = null, pan = 0, detune = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + att);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + dur);
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(bus || this.musBus); }
    else o.connect(g).connect(bus || this.musBus);
    o.start(t0); o.stop(t0 + dur + .05);
  }

  /* ── музыка ── */
  // Am — F — C — G, тёплые неспешные пэды
  static CHORDS = [
    [220.0, 261.63, 329.63],   // Am
    [174.61, 220.0, 261.63],   // F
    [196.0, 261.63, 329.63],   // C (G-C-E)
    [196.0, 246.94, 293.66],   // G
  ];
  static PENTA = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  _pads(now) {
    while (this._nextChord < now + 1.2) {
      const t0 = this._nextChord;
      const ch = AudioEngine.CHORDS[this._chordI % AudioEngine.CHORDS.length];
      this._chordI++;
      for (const f of ch) {
        this._note(f / 2, t0, 9.5, { type: "triangle", gain: .045, att: 2.4, detune: (Math.random() - .5) * 8 });
        this._note(f / 2, t0 + .05, 9.2, { type: "sine", gain: .035, att: 2.8, detune: 6 });
      }
      // глубокий бас
      this._note(ch[0] / 4, t0, 8, { type: "sine", gain: .06, att: .8 });
      this._nextChord += 8;
    }
  }

  _melody(now, nightF) {
    const ctx = this.ctx;
    while (this._nextMelody < now + 1.2) {
      const t0 = this._nextMelody;
      const density = .42 - nightF * .16;           // ночью реже и мягче
      if (Math.random() < density) {
        const notes = AudioEngine.PENTA;
        const f = notes[(Math.random() * notes.length) | 0];
        // «челеста»: тон + октава, быстрая атака, длинный хвост
        this._note(f, t0, 2.4, { gain: .075, att: .008, pan: (Math.random() - .5) * .8 });
        this._note(f * 2, t0, 1.4, { gain: .02, att: .008, pan: (Math.random() - .5) * .8 });
        // редкая «звёздная» высокая нота ночью
        if (Math.random() < .16) {
          this._note(f * 4, t0 + .35, 2.8, { gain: .014, att: .01 });
        }
        if (Math.random() < .3) {
          this._note(notes[(Math.random() * notes.length) | 0], t0 + .55, 1.6, { gain: .05, att: .008, pan: (Math.random() - .5) * .9 });
        }
      }
      this._nextMelody += 1.1;
    }
  }

  /* ── звуки ── */
  step() {
    if (!this.ctx || this.muted) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const b = ctx.createBuffer(1, 1100, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2.2);
    const src = ctx.createBufferSource(); src.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = "bandpass"; f.frequency.value = 320 + Math.random() * 160; f.Q.value = 1.2;
    const g = ctx.createGain(); g.gain.value = .10;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
  }

  jump() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(340, t0);
    o.frequency.exponentialRampToValueAtTime(660, t0 + .18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.06, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + .25);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + .3);
  }

  collect() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this._note(1318.5, t0, .8, { gain: .09, att: .005, bus: this.sfxBus, pan: .2 });
    this._note(1760, t0 + .07, 1.1, { gain: .06, att: .005, bus: this.sfxBus, pan: -.2 });
  }

  lantern() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const arp = [440, 554.4, 659.3, 880, 1108.7];
    arp.forEach((f, i) => this._note(f, t0 + i * .09, 1.6, { gain: .09, att: .006, bus: this.sfxBus, pan: (i % 2 ? .3 : -.3) }));
  }

  shoot() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(760, t0);
    o.frequency.exponentialRampToValueAtTime(1480, t0 + .1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.05, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + .16);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + .2);
    this._note(2960, t0, .1, { gain: .014, att: .004, bus: this.sfxBus });
  }

  blink() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(1100, t0);
    o.frequency.exponentialRampToValueAtTime(320, t0 + .22);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.07, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + .26);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + .3);
  }

  hitEnemy() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const b = ctx.createBuffer(1, 1600, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 1.6);
    const src = ctx.createBufferSource(); src.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = .16;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
    this._note(196, t0, .12, { type: "triangle", gain: .07, att: .004, bus: this.sfxBus });
  }

  enemyDie() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    const ctx = this.ctx;
    const o = ctx.createOscillator(); o.type = "sawtooth";
    o.frequency.setValueAtTime(300, t0);
    o.frequency.exponentialRampToValueAtTime(60, t0 + .3);
    const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = 700;
    const g = ctx.createGain();
    g.gain.setValueAtTime(.08, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + .34);
    o.connect(f).connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + .4);
    this._note(1174, t0 + .05, .5, { gain: .03, att: .005, bus: this.sfxBus });
  }

  hurt() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = "triangle";
    o.frequency.setValueAtTime(180, t0);
    o.frequency.exponentialRampToValueAtTime(70, t0 + .25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(.14, t0);
    g.gain.exponentialRampToValueAtTime(.0001, t0 + .3);
    o.connect(g).connect(this.sfxBus);
    o.start(t0); o.stop(t0 + .35);
  }

  herb() {
    if (!this.ctx) return;
    const ctx = this.ctx, t0 = ctx.currentTime;
    const b = ctx.createBuffer(1, 700, ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    const src = ctx.createBufferSource(); src.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = 1800;
    const g = ctx.createGain(); g.gain.value = .09;
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t0);
    this._note(1568, t0 + .03, .35, { gain: .03, att: .005, bus: this.sfxBus });
  }

  brew() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [523.3, 659.3, 784, 1046.5].forEach((f, i) =>
      this._note(f, t0 + i * .13, .9, { gain: .07, att: .008, bus: this.sfxBus, pan: (i % 2 ? .25 : -.25) }));
  }

  questDone() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    [659.3, 784, 987.8, 1318.5, 1568].forEach((f, i) =>
      this._note(f, t0 + i * .1, 1.8, { gain: .08, att: .008, bus: this.sfxBus, pan: (i % 2 ? .3 : -.3) }));
  }

  blip() {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime;
    this._note(880, t0, .12, { gain: .04, att: .004, bus: this.sfxBus });
  }

  /* ── вызывать каждый кадр ── */
  update(dt, elapsed, speed2d, onGround, nightF) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    this._pads(now);
    this._melody(now, nightF);
    // шаги
    if (speed2d > 1.2 && onGround) {
      this.stepAcc += dt * speed2d;
      if (this.stepAcc > 1.55) { this.stepAcc = 0; this.step(); }
    }
  }
}

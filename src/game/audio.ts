// 8-bit 風格音效與背景音樂 (全部用 WebAudio 即時合成,不需要音檔)

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

const LEAD = [
  76, 0, 79, 0, 84, 0, 79, 76, 77, 0, 81, 0, 86, 0, 81, 77,
  79, 0, 83, 0, 86, 88, 86, 83, 84, 0, 79, 0, 76, 0, 72, 0,
  81, 0, 84, 0, 88, 0, 84, 81, 77, 0, 81, 0, 84, 0, 81, 77,
  79, 0, 83, 0, 86, 0, 83, 79, 84, 88, 91, 88, 84, 0, 0, 0,
];
const ROOTS = [48, 53, 55, 48, 57, 53, 55, 48];

export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  muted = false;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private noiseBuf: AudioBuffer | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === "suspended") this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.9;
    this.sfxGain.connect(this.master);

    const len = this.ctx.sampleRate * 0.2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx.currentTime, 0.02);
    }
  }

  private tone(
    freq: number,
    dur: number,
    type: OscillatorType = "square",
    vol = 0.15,
    when = 0,
    slideTo?: number,
    dest?: AudioNode,
  ) {
    if (!this.ctx || !this.sfxGain) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(dest ?? this.sfxGain);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  jump() {
    this.tone(260, 0.22, "square", 0.12, 0, 800);
  }
  land() {
    this.tone(140, 0.07, "triangle", 0.12, 0, 80);
  }
  step_() {
    this.tone(180 + Math.random() * 40, 0.04, "triangle", 0.05, 0, 120);
  }
  coin() {
    this.tone(988, 0.08, "square", 0.12);
    this.tone(1319, 0.4, "square", 0.12, 0.07);
  }
  bump() {
    this.tone(160, 0.12, "square", 0.16, 0, 60);
  }
  blockHit() {
    this.bump();
    this.tone(523, 0.08, "square", 0.1, 0.08);
    this.tone(784, 0.08, "square", 0.1, 0.16);
    this.tone(1047, 0.25, "square", 0.1, 0.24);
  }
  pipe() {
    this.tone(500, 0.5, "square", 0.14, 0, 70);
    this.tone(250, 0.5, "triangle", 0.12, 0, 40);
  }
  zone() {
    this.tone(659, 0.15, "sine", 0.18);
    this.tone(880, 0.35, "sine", 0.18, 0.12);
  }
  oneUp() {
    [659, 784, 1319, 1047, 1175, 1568].forEach((f, i) => this.tone(f, 0.12, "square", 0.12, i * 0.1));
  }
  flag() {
    for (let i = 0; i < 10; i++) this.tone(1200 - i * 90, 0.08, "square", 0.1, i * 0.06);
    [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => this.tone(f, 0.16, "square", 0.12, 0.7 + i * 0.14));
  }
  click() {
    this.tone(880, 0.05, "square", 0.08);
  }

  private hat(when: number) {
    if (!this.ctx || !this.noiseBuf || !this.musicGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.05, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + 0.05);
    src.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    src.start(when);
    src.stop(when + 0.06);
  }

  private note(freq: number, when: number, dur: number, type: OscillatorType, vol: number) {
    if (!this.ctx || !this.musicGain) return;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g);
    g.connect(this.musicGain);
    osc.start(when);
    osc.stop(when + dur + 0.02);
  }

  startMusic() {
    if (!this.ctx || this.timer !== null) return;
    this.step = 0;
    this.nextTime = this.ctx.currentTime + 0.1;
    const stepDur = 60 / 150 / 2;
    this.timer = window.setInterval(() => {
      if (!this.ctx) return;
      while (this.nextTime < this.ctx.currentTime + 0.25) {
        const s = this.step % LEAD.length;
        const bar = Math.floor(s / 8);
        const inBar = s % 8;
        const n = LEAD[s];
        if (n) this.note(midi(n), this.nextTime, stepDur * 1.7, "square", 0.045);
        const root = ROOTS[bar];
        if (inBar % 2 === 0) {
          const bn = inBar % 4 === 0 ? root : root + 7;
          this.note(midi(bn - 12), this.nextTime, stepDur * 1.6, "triangle", 0.13);
        }
        if (inBar % 2 === 1) this.hat(this.nextTime);
        this.nextTime += stepDur;
        this.step++;
      }
    }, 30);
  }

  stopMusic() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }
}

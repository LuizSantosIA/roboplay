/** Sons sintetizados com WebAudio (sem arquivos). */
export class Audio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  muted = false;
  private rainGain: GainNode | null = null;
  private rainSrc: AudioBufferSourceNode | null = null;
  private lastStep = 0;

  constructor() {
    try {
      this.muted = localStorage.getItem('roboplay.mudo') === '1';
    } catch {
      /* sem storage */
    }
  }

  /** Precisa ser chamado após um gesto do usuário. */
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    try {
      localStorage.setItem('roboplay.mudo', m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
  }

  private tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.2, slideTo?: number, delay = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, filterFreq: number, type: BiquadFilterType = 'lowpass') {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
  }

  select() {
    this.tone(880, 0.08, 'square', 0.06);
    this.tone(1320, 0.1, 'square', 0.05, undefined, 0.07);
  }
  step(_who?: unknown) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - this.lastStep < 0.09) return;
    this.lastStep = now;
    this.tone(140 + Math.random() * 40, 0.05, 'triangle', 0.05);
  }
  kick() {
    this.tone(180, 0.12, 'sine', 0.35, 60);
    this.noise(0.06, 0.25, 1200);
  }
  bounce(v = 0.5) {
    this.tone(260, 0.08, 'sine', 0.15 * v + 0.03, 140);
  }
  thud(v = 0.5) {
    this.tone(110, 0.14, 'triangle', 0.2 * v + 0.04, 55);
    this.noise(0.08, 0.12 * v, 500);
  }
  pickup() {
    this.tone(520, 0.08, 'square', 0.06, 780);
  }
  drop() {
    this.tone(600, 0.09, 'square', 0.05, 380);
  }
  splash() {
    this.noise(0.35, 0.3, 1800, 'bandpass');
  }
  pop() {
    this.tone(700, 0.08, 'sine', 0.15, 1200);
  }
  good() {
    [660, 880, 1100].forEach((f, i) => this.tone(f, 0.15, 'triangle', 0.12, undefined, i * 0.08));
  }
  bad() {
    this.tone(220, 0.25, 'sawtooth', 0.07, 150);
  }
  fanfare() {
    [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'triangle', 0.13, undefined, i * 0.11));
  }
  charge() {
    this.tone(400, 0.25, 'sine', 0.06, 900);
  }
  bird() {
    this.tone(2200, 0.06, 'sine', 0.05, 3200);
    this.tone(2600, 0.07, 'sine', 0.05, 2000, 0.08);
  }
  /** Latido robótico: dois "au" curtos. */
  bark() {
    this.tone(520, 0.09, 'sawtooth', 0.07, 260);
    this.tone(560, 0.1, 'sawtooth', 0.07, 280, 0.14);
  }
  beep(f = 700) {
    this.tone(f, 0.07, 'square', 0.05);
  }
  danceBeat(i: number) {
    const notes = [392, 494, 587, 494, 440, 523, 659, 523];
    this.tone(notes[i % notes.length], 0.12, 'square', 0.05);
    if (i % 2 === 0) this.tone(90, 0.1, 'sine', 0.2, 50);
  }

  /** Chuva contínua (0 = desligada). */
  setRain(intensity: number) {
    if (!this.ctx || !this.master) return;
    if (!this.rainSrc) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.rainSrc = this.ctx.createBufferSource();
      this.rainSrc.buffer = buf;
      this.rainSrc.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 2500;
      f.Q.value = 0.4;
      this.rainGain = this.ctx.createGain();
      this.rainGain.gain.value = 0;
      this.rainSrc.connect(f).connect(this.rainGain).connect(this.master);
      this.rainSrc.start();
    }
    this.rainGain!.gain.setTargetAtTime(intensity * 0.12, this.ctx.currentTime, 0.5);
  }
}

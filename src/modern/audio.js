// Every sound is synthesised with WebAudio, so there are no audio files:
// a rumbling engine that follows the throttle, guns, explosions, warnings
// and interface blips. The context starts on the first user gesture.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
  }

  // Call from a click or key handler; browsers only allow audio after one
  start() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(ctx.destination);
    this.noise = this.makeNoise();

    // Engine: filtered noise for the roar plus a low hum
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    this.engineFilter = ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 300;
    this.engineGain = ctx.createGain();
    this.engineGain.gain.value = 0;
    src.connect(this.engineFilter).connect(this.engineGain).connect(this.master);
    src.start();
    const hum = ctx.createOscillator();
    hum.type = 'sawtooth';
    hum.frequency.value = 48;
    this.humGain = ctx.createGain();
    this.humGain.gain.value = 0;
    const humFilter = ctx.createBiquadFilter();
    humFilter.type = 'lowpass';
    humFilter.frequency.value = 180;
    hum.connect(humFilter).connect(this.humGain).connect(this.master);
    hum.start();
    this.hum = hum;

    // Wind that rises with speed
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 800;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();
  }

  makeNoise() {
    const ctx = this.ctx;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i++) {
      // Slightly brown noise: warmer than white
      last = (last + 0.04 * (Math.random() * 2 - 1)) / 1.04;
      data[i] = last * 3.5 + (Math.random() * 2 - 1) * 0.15;
    }
    return buffer;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  // Called every frame with throttle 0..1 and airspeed in m/s
  engine(throttle, speed, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    this.engineGain.gain.setTargetAtTime(on * throttle * 0.55, t, 0.05);
    this.engineFilter.frequency.setTargetAtTime(220 + throttle * 900, t, 0.08);
    this.humGain.gain.setTargetAtTime(on * (0.04 + throttle * 0.08), t, 0.1);
    this.hum.frequency.setTargetAtTime(42 + throttle * 30, t, 0.1);
    this.windGain.gain.setTargetAtTime(on * Math.min(speed / 90, 1) * 0.25, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + speed * 12, t, 0.2);
  }

  envelope(node, peak, attack, decay) {
    const t = this.ctx.currentTime;
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(peak, t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  noiseBurst(peak, decay, freq, type = 'lowpass', delay = 0) {
    if (!this.ctx) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.6 + Math.random() * 0.8;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.ctx.createGain();
    src.connect(f).connect(g).connect(this.master);
    this.envelope(g, peak, 0.005, decay);
    src.start(this.ctx.currentTime + delay, Math.random());
    src.stop(this.ctx.currentTime + delay + decay + 0.1);
  }

  tone(freq, peak, decay, type = 'square', slide = 0, delay = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.ctx.currentTime + delay;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(freq * slide, 20), t + decay);
    const g = this.ctx.createGain();
    o.connect(g).connect(this.master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    o.start(t);
    o.stop(t + decay + 0.05);
  }

  gun() { this.tone(900 + Math.random() * 200, 0.06, 0.07, 'square', 0.3); this.noiseBurst(0.08, 0.05, 3000, 'highpass'); }
  enemyGun() { this.tone(300, 0.05, 0.18, 'sawtooth', 0.5); }
  explosion(size = 1) { this.noiseBurst(Math.min(0.3 + size * 0.25, 1), 0.6 + size * 0.5, 600); this.tone(70, 0.3, 0.5 + size * 0.3, 'sine', 0.5); }
  hit() { this.noiseBurst(0.25, 0.15, 1500, 'bandpass'); }
  scrape() { this.noiseBurst(0.3, 0.25, 900, 'bandpass'); }
  land() { this.tone(520, 0.08, 0.12, 'triangle'); this.tone(780, 0.08, 0.18, 'triangle', 1, 0.1); }
  pickup() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.08, 0.12, 'triangle', 1, i * 0.07)); }
  success() { [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.1, 0.25, 'triangle', 1, i * 0.1)); }
  failure() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, 0.1, 0.3, 'sawtooth', 1, i * 0.15)); }
  warning() { this.tone(880, 0.06, 0.12, 'square'); this.tone(660, 0.06, 0.12, 'square', 1, 0.15); }
  ring() { this.tone(1200, 0.08, 0.2, 'sine', 1.5); }
  blip() { this.tone(1400, 0.04, 0.05, 'square'); }
  select() { this.tone(700, 0.06, 0.09, 'triangle', 1.6); }
}

export class SoundEngine {
  private ctx: AudioContext | null = null;
  private muted = false;
  private engineOsc: OscillatorNode | null = null;
  private engineSubOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.engineGain && this.ctx) {
      this.engineGain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  public unlock(): void {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      this.setupEngineLoop(this.ctx);
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = ctx.sampleRate * 1.5;
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private setupEngineLoop(ctx: AudioContext): void {
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.value = 62;

    subOsc.type = 'triangle';
    subOsc.frequency.value = 31;

    filter.type = 'lowpass';
    filter.frequency.value = 240;
    filter.Q.value = 1.6;

    gain.gain.value = 0;

    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    subOsc.start();

    this.engineOsc = osc;
    this.engineSubOsc = subOsc;
    this.engineFilter = filter;
    this.engineGain = gain;
  }

  public updateEngine(active: boolean, throttleNorm: number, boost: boolean): void {
    if (!this.ctx || !this.engineGain || !this.engineOsc || !this.engineSubOsc || !this.engineFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    if (!active || this.muted || this.ctx.state !== 'running') {
      this.engineGain.gain.setTargetAtTime(0, now, 0.08);
      return;
    }
    const baseFreq = 54 + throttleNorm * 42 + (boost ? 26 : 0);
    this.engineOsc.frequency.setTargetAtTime(baseFreq, now, 0.06);
    this.engineSubOsc.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.06);
    this.engineFilter.frequency.setTargetAtTime(
      210 + throttleNorm * 320 + (boost ? 240 : 0),
      now,
      0.06,
    );
    this.engineGain.gain.setTargetAtTime(boost ? 0.065 : 0.042, now, 0.08);
  }

  public playShoot(isBlaster = false): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = isBlaster ? 'sine' : 'triangle';
    const startFreq = isBlaster ? 680 : 490;
    const endFreq = isBlaster ? 210 : 150;
    osc.frequency.setValueAtTime(startFreq + Math.random() * 45, now);
    osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.09);

    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playHit(heavy = false): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    osc.frequency.setValueAtTime(heavy ? 180 : 280, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.08);

    gain.gain.setValueAtTime(heavy ? 0.12 : 0.07, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.095);
  }

  public playExplosion(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;

    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(900, now);
      filter.frequency.exponentialRampToValueAtTime(140, now + 0.45);
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(0.22, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(this.ctx.destination);
      noise.start(now);
      noise.stop(now + 0.46);
    }

    const thump = this.ctx.createOscillator();
    const thumpGain = this.ctx.createGain();
    thump.type = 'sine';
    thump.frequency.setValueAtTime(140, now);
    thump.frequency.exponentialRampToValueAtTime(38, now + 0.28);
    thumpGain.gain.setValueAtTime(0.2, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    thump.connect(thumpGain);
    thumpGain.connect(this.ctx.destination);
    thump.start(now);
    thump.stop(now + 0.31);
  }

  public playSplash(big = false): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(big ? 1100 : 1500, now);
    filter.frequency.exponentialRampToValueAtTime(420, now + (big ? 0.38 : 0.18));
    filter.Q.value = 1.2;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(big ? 0.16 : 0.06, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (big ? 0.4 : 0.2));

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + (big ? 0.42 : 0.22));
  }

  public playEject(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(240, now);
    osc.frequency.exponentialRampToValueAtTime(620, now + 0.18);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.23);
  }

  public playWhoosh(isLoop = false): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running' || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const dur = isLoop ? 0.55 : 0.32;
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 2.0;
    filter.frequency.setValueAtTime(isLoop ? 320 : 480, now);
    filter.frequency.exponentialRampToValueAtTime(isLoop ? 1150 : 920, now + dur * 0.45);
    filter.frequency.exponentialRampToValueAtTime(280, now + dur);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.14, now + dur * 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    noise.start(now);
    noise.stop(now + dur + 0.02);
  }

  public playBoard(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [330, 440, 587].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.045);
      gain.gain.setValueAtTime(0.09, now + i * 0.045);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.045 + 0.14);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.045);
      osc.stop(now + i * 0.045 + 0.15);
    });
  }

  public playPickup(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.055);
      gain.gain.setValueAtTime(0.1, now + i * 0.055);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.055 + 0.18);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.055);
      osc.stop(now + i * 0.055 + 0.2);
    });
  }

  public playWaveClear(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [392, 493.88, 587.33, 783.99].forEach((freq, i) => {
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.08);
      gain.gain.setValueAtTime(0.11, now + i * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.08 + 0.28);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(now + i * 0.08);
      osc.stop(now + i * 0.08 + 0.3);
    });
  }

  public dispose(): void {
    try {
      this.engineOsc?.stop();
      this.engineSubOsc?.stop();
      void this.ctx?.close();
    } catch {
      // ignore cleanup errors
    }
    this.ctx = null;
  }
}

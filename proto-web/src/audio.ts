import type { MapTheme, SoundEvent } from './types';

export type { SoundEvent };

/** Cooldowns in milliseconds per event type to prevent audio spam */
export const SOUND_COOLDOWNS: Record<SoundEvent, number> = {
  'shot-pulse': 55,
  'shot-overcharge': 65,
  'shot-plasma': 90,
  'shot-stasis': 120,
  'shot-rail': 100,
  'shot-swarm': 80,
  'shot-mine': 90,
  'impact-plasma': 85,
  'impact-missile': 75,
  'impact-mine': 85,
  'sonar-ping': 120,
  'dust-storm': 100,
  'enrage': 90,
  'fridge-open': 120,
  'centipede-split': 90,
  'mole-flush': 100,
  'meteor-warn': 200,
  'meteor-impact': 120,
  'dragon-breath': 350,
  'knight-charge': 250,
  'knight-clash': 90,
  'roomba-deploy': 250,
  'roomba-sweep': 90,
  'kill': 60,
  'boss-phase': 25,
  'leak': 25,
  'ui-place': 25,
  'ui-upgrade': 25,
  'ui-repair': 80,
  'ui-sell': 25,
  'ui-error': 25,
  'ui-share': 25,
  'ui-wave': 25,
  'ui-win': 25,
  'ui-lose': 25,
};

export type AudioContextFactory = () => AudioContext;

export type AudioTheme = MapTheme;

export class SoundEngine {
  public muted = false;
  public theme: AudioTheme = 'space';
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private lastPlayed: Partial<Record<SoundEvent, number>> = {};
  private activeVoices = 0;
  private readonly maxActiveVoices = 24;
  private readonly createCtx?: AudioContextFactory;

  constructor(createCtx?: AudioContextFactory) {
    this.createCtx = createCtx;
  }

  public setMuted(m: boolean): void {
    this.muted = m;
  }

  public setTheme(t: AudioTheme): void {
    this.theme = t;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  public unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        try {
          this.ctx.resume().catch(() => {});
        } catch {
          // ignore error in non-standard environments
        }
      }
      return;
    }

    try {
      if (this.createCtx) {
        this.ctx = this.createCtx();
      } else if (typeof window !== 'undefined') {
        const AudioContextClass =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (AudioContextClass) {
          this.ctx = new AudioContextClass();
        }
      }

      if (this.ctx) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume().catch(() => {});
        }
        this.initGraph(this.ctx);
      }
    } catch {
      // Gracefully handle environments without Web Audio or security restrictions
      this.ctx = null;
    }
  }

  private initGraph(ctx: AudioContext): void {
    try {
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.setValueAtTime(-18, ctx.currentTime);
      this.compressor.knee.setValueAtTime(12, ctx.currentTime);
      this.compressor.ratio.setValueAtTime(12, ctx.currentTime);
      this.compressor.attack.setValueAtTime(0.003, ctx.currentTime);
      this.compressor.release.setValueAtTime(0.15, ctx.currentTime);

      this.masterGain = ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.22, ctx.currentTime);

      this.compressor.connect(this.masterGain);
      this.masterGain.connect(ctx.destination);
    } catch {
      // In mock contexts, createDynamicsCompressor might be partial
    }
  }

  public play(ev: SoundEvent, nowMs?: number): boolean {
    if (this.muted) return false;

    const now = nowMs ?? (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const cooldown = SOUND_COOLDOWNS[ev] ?? 50;
    const last = this.lastPlayed[ev] ?? -Infinity;

    if (now - last < cooldown) {
      return false;
    }

    if (!this.ctx || !this.compressor) {
      this.unlock();
      if (!this.ctx || !this.compressor) {
        return false;
      }
    }

    if (this.ctx.state === 'suspended') {
      try {
        this.ctx.resume().catch(() => {});
      } catch {
        // ignore
      }
    }

    // Global voice throttling to prevent saturation
    if (this.activeVoices >= this.maxActiveVoices) {
      // Drop combat sound if voice limit exceeded, allow UI/match events
      if (ev.startsWith('shot-') || ev.startsWith('impact-') || ev === 'kill') {
        return false;
      }
    }

    this.lastPlayed[ev] = now;
    if (this.theme === 'military') {
      this.synthesizeMilitary(ev);
    } else if (this.theme === 'naval') {
      this.synthesizeNaval(ev);
    } else if (this.theme === 'mars' || this.theme === 'volcano') {
      this.synthesizeMars(ev);
    } else if (this.theme === 'medieval') {
      this.synthesizeMedieval(ev);
    } else if (this.theme === 'kitchen' || this.theme === 'office') {
      this.synthesizeKitchen(ev);
    } else if (this.theme === 'lawn' || this.theme === 'biolab' || this.theme === 'zoo') {
      this.synthesizeLawn(ev);
    } else {
      this.synthesize(ev);
    }
    return true;
  }

  private synthesize(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // crisp short high-to-mid triangle/sine laser chirp (880 -> 340 Hz, 65ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(340, t + 0.065);

          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.07);
          setTimeout(releaseVoice, 70);
          break;
        }

        case 'shot-overcharge': {
          // richer dual-detuned beam zap (1040 -> 280 Hz, 95ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(1040, t);
          osc1.frequency.exponentialRampToValueAtTime(280, t + 0.095);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1055, t);
          osc2.frequency.exponentialRampToValueAtTime(270, t + 0.095);

          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.1);
          osc2.stop(t + 0.1);
          setTimeout(releaseVoice, 100);
          break;
        }

        case 'shot-plasma': {
          // deep warm mortar thump (190 -> 65 Hz, 130ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(190, t);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.13);

          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.14);
          setTimeout(releaseVoice, 140);
          break;
        }

        case 'shot-stasis': {
          // ethereal shimmering resonant pulse (320 -> 240 Hz sine + harmonic, 180ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();

          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(320, t);
          osc1.frequency.linearRampToValueAtTime(240, t + 0.18);

          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(640, t);
          osc2.frequency.linearRampToValueAtTime(480, t + 0.18);

          gain.gain.setValueAtTime(0.28, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.19);
          osc2.stop(t + 0.19);
          setTimeout(releaseVoice, 190);
          break;
        }

        case 'shot-rail': {
          // sharp electric crack + sub-bass punch (1600 -> 140 Hz sawtooth + low sine, 160ms)
          const oscHigh = ctx.createOscillator();
          const oscLow = ctx.createOscillator();
          const gainHigh = ctx.createGain();
          const gainLow = ctx.createGain();

          oscHigh.type = 'sawtooth';
          oscHigh.frequency.setValueAtTime(1600, t);
          oscHigh.frequency.exponentialRampToValueAtTime(140, t + 0.08);

          gainHigh.gain.setValueAtTime(0.35, t);
          gainHigh.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

          oscLow.type = 'sine';
          oscLow.frequency.setValueAtTime(160, t);
          oscLow.frequency.exponentialRampToValueAtTime(40, t + 0.16);

          gainLow.gain.setValueAtTime(0.6, t);
          gainLow.gain.exponentialRampToValueAtTime(0.001, t + 0.16);

          oscHigh.connect(gainHigh);
          gainHigh.connect(destination);

          oscLow.connect(gainLow);
          gainLow.connect(destination);

          oscHigh.start(t);
          oscLow.start(t);
          oscHigh.stop(t + 0.09);
          oscLow.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'shot-swarm': {
          // soft fast micro-missile whoosh (filtered noise sweep + 620 -> 920 Hz chirp, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(620, t);
          osc.frequency.exponentialRampToValueAtTime(920, t + 0.08);

          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

          osc.connect(gain);
          gain.connect(destination);

          // Add subtle noise if buffer creation is available
          this.playNoiseBurst(ctx, destination, t, 0.08, 1200, 0.15);

          osc.start(t);
          osc.stop(t + 0.09);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'impact-plasma': {
          // filtered low-pass noise boom + sub punch (180ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.18);

          gain.gain.setValueAtTime(0.6, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);

          osc.connect(gain);
          gain.connect(destination);

          this.playNoiseBurst(ctx, destination, t, 0.18, 450, 0.4);

          osc.start(t);
          osc.stop(t + 0.19);
          setTimeout(releaseVoice, 190);
          break;
        }

        case 'impact-missile': {
          // quick pop burst (75ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(380, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.075);

          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);

          osc.connect(gain);
          gain.connect(destination);

          this.playNoiseBurst(ctx, destination, t, 0.075, 800, 0.25);

          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'kill': {
          // subtle crisp sci-fi pop/shimmer (520 -> 780 Hz soft decay, 70ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(780, t + 0.07);

          gain.gain.setValueAtTime(0.28, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'boss-phase': {
          // dramatic low warning horn/sweep (150 -> 95 Hz dual sawtooth filtered, 380ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const filter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(150, t);
          osc1.frequency.exponentialRampToValueAtTime(95, t + 0.38);

          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(147, t);
          osc2.frequency.exponentialRampToValueAtTime(93, t + 0.38);

          gain.gain.setValueAtTime(0.5, t);
          gain.gain.linearRampToValueAtTime(0.5, t + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

          if (filter) {
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(600, t);
            filter.frequency.linearRampToValueAtTime(300, t + 0.38);
            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
          } else {
            osc1.connect(gain);
            osc2.connect(gain);
          }

          gain.connect(destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.4);
          osc2.stop(t + 0.4);
          setTimeout(releaseVoice, 400);
          break;
        }

        case 'leak': {
          // tense descending alert buzz (380 -> 180 Hz, 200ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(380, t);
          osc.frequency.linearRampToValueAtTime(180, t + 0.2);

          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.21);
          setTimeout(releaseVoice, 210);
          break;
        }

        case 'ui-place': {
          // clean rising tech click (440 -> 660 Hz, 70ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(660, t + 0.07);

          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'ui-upgrade': {
          // bright ascending triad arpeggio (523 -> 659 -> 784 Hz, 180ms)
          const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
          const step = 0.06;
          for (let i = 0; i < notes.length; i++) {
            const noteOsc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            const noteT = t + i * step;

            noteOsc.type = 'triangle';
            noteOsc.frequency.setValueAtTime(notes[i], noteT);

            noteGain.gain.setValueAtTime(0.28, noteT);
            noteGain.gain.exponentialRampToValueAtTime(0.001, noteT + step * 1.2);

            noteOsc.connect(noteGain);
            noteGain.connect(destination);

            noteOsc.start(noteT);
            noteOsc.stop(noteT + step * 1.3);
          }
          setTimeout(releaseVoice, 200);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // soft coin downward-upward chime (587 -> 440 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, t);
          osc.frequency.exponentialRampToValueAtTime(440, t + 0.09);

          gain.gain.setValueAtTime(0.25, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);

          osc.connect(gain);
          gain.connect(destination);

          osc.start(t);
          osc.stop(t + 0.1);
          setTimeout(releaseVoice, 100);
          break;
        }

        case 'ui-error': {
          // muted low double-thud (190 -> 140 Hz, 100ms)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(190, t);
          osc1.frequency.linearRampToValueAtTime(140, t + 0.045);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.05);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          const t2 = t + 0.055;
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(170, t2);
          osc2.frequency.linearRampToValueAtTime(120, t2 + 0.045);
          gain2.gain.setValueAtTime(0.35, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-share': {
          // joyful sparkling 2-note transfer chime (660 -> 990 Hz, 140ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'sine';
          n1.frequency.setValueAtTime(659.25, t);
          g1.gain.setValueAtTime(0.28, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.075);

          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          const t2 = t + 0.065;
          n2.type = 'sine';
          n2.frequency.setValueAtTime(987.77, t2);
          g2.gain.setValueAtTime(0.28, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.075);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.08);

          setTimeout(releaseVoice, 150);
          break;
        }

        case 'ui-wave': {
          // tactical radar ping + low swell (440 -> 880 Hz, 220ms)
          const oscPing = ctx.createOscillator();
          const gainPing = ctx.createGain();
          oscPing.type = 'sine';
          oscPing.frequency.setValueAtTime(440, t);
          oscPing.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gainPing.gain.setValueAtTime(0.35, t);
          gainPing.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          oscPing.connect(gainPing);
          gainPing.connect(destination);
          oscPing.start(t);
          oscPing.stop(t + 0.23);

          setTimeout(releaseVoice, 230);
          break;
        }

        case 'ui-win': {
          // triumphant major fanfare chord (523 / 659 / 784 / 1046 Hz, 500ms)
          const chord = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[i], t);

            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

            osc.connect(gain);
            gain.connect(destination);

            osc.start(t);
            osc.stop(t + 0.52);
          }
          setTimeout(releaseVoice, 520);
          break;
        }

        case 'ui-lose': {
          // somber descending minor tones (392 -> 311 -> 261 Hz, 480ms)
          const notes = [392.0, 311.13, 261.63]; // G4, Eb4, C4
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);

            gain.gain.setValueAtTime(0.25, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);

            osc.connect(gain);
            gain.connect(destination);

            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        case 'shot-mine': {
          // space mine deploy: magnetic arm chirp + deployment thud (480 -> 180 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(480, t);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'impact-mine': {
          // space mine detonation: resonant concussion boom (120 -> 30 Hz sine, 160ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.16);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.16, 500, 0.4);
          osc.start(t);
          osc.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'sonar-ping': {
          // space sensor ping: crystalline pulse (1480 Hz pure sine chime, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1480, t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // space ion surge: low drone sweep (110 -> 80 Hz, 250ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.25);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.25, 300, 0.35);
          osc.start(t);
          osc.stop(t + 0.26);
          setTimeout(releaseVoice, 260);
          break;
        }

        case 'enrage': {
          // space overdrive surge: aggressive rising sawtooth (140 -> 320 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.24);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'fridge-open': {
          // icy chime + cool air whoosh (high crystalline sine 1760 Hz + airy lowpass noise, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 700, 0.28, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // crisp double-snap pop (dual quick noise snaps + high frequency chirp, 90ms)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // earthen thump + pop-up chirp (low frequency thump 130->45 Hz + rising sine 280->640 Hz, 180ms)
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private playNoiseBurst(
    ctx: AudioContext,
    destination: AudioNode,
    startTime: number,
    duration: number,
    filterFreq: number,
    volume: number,
    filterType: BiquadFilterType = 'lowpass',
    filterQ?: number,
  ): void {
    try {
      if (!ctx.createBuffer || !ctx.createBufferSource) return;

      const sampleRate = ctx.sampleRate || 44100;
      const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
      const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
      const output = buffer.getChannelData(0);

      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = buffer;

      const filter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
      const gain = ctx.createGain();

      gain.gain.setValueAtTime(volume, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      if (filter) {
        filter.type = filterType;
        filter.frequency.setValueAtTime(filterFreq, startTime);
        if (filterQ !== undefined && filter.Q) {
          filter.Q.setValueAtTime(filterQ, startTime);
        }
        whiteNoise.connect(filter);
        filter.connect(gain);
      } else {
        whiteNoise.connect(gain);
      }

      gain.connect(destination);

      whiteNoise.start(startTime);
      whiteNoise.stop(startTime + duration);
    } catch {
      // Noise synthesis fallback for minimal test mocks
    }
  }

  private synthesizeMeteorWarn(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(720, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.35);

    gain.gain.setValueAtTime(0.24, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(destination);

    this.playNoiseBurst(ctx, destination, t, 0.35, 850, 0.22, 'bandpass', 1.5);

    osc.start(t);
    osc.stop(t + 0.36);
    setTimeout(releaseVoice, 360);
  }

  private synthesizeMeteorImpact(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(36, t + 0.32);

    gain.gain.setValueAtTime(0.55, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);

    osc.connect(gain);
    gain.connect(destination);

    this.playNoiseBurst(ctx, destination, t, 0.32, 750, 0.48, 'bandpass', 1.8);

    osc.start(t);
    osc.stop(t + 0.33);
    setTimeout(releaseVoice, 330);
  }

  private synthesizeRepairChime(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
    // Metallic wrench clicks
    this.playNoiseBurst(ctx, destination, t, 0.025, 3400, 0.28, 'bandpass', 2.5);
    this.playNoiseBurst(ctx, destination, t + 0.045, 0.03, 3800, 0.32, 'bandpass', 2.5);

    // Ascending repair chime
    const notes = [520, 780, 1040];
    const step = 0.055;
    for (let i = 0; i < notes.length; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const noteT = t + 0.04 + i * step;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(notes[i], noteT);

      gain.gain.setValueAtTime(0.28, noteT);
      gain.gain.exponentialRampToValueAtTime(0.001, noteT + step * 1.2);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(noteT);
      osc.stop(noteT + step * 1.3);
    }
    setTimeout(releaseVoice, 230);
  }

  private synthesizeDragonBreath(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // deep roaring dragon flame whoosh (bandpass-filtered noise sweeping 900Hz -> 280Hz + low growling sawtooth 95Hz -> 60Hz over ~0.48s)
    const duration = 0.48;

    // Low growling sawtooth 95Hz -> 60Hz
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(95, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + duration);

    oscGain.gain.setValueAtTime(0.38, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(oscGain);
    oscGain.connect(destination);

    osc.start(t);
    osc.stop(t + duration + 0.02);

    // Bandpass-filtered noise sweeping 900Hz -> 280Hz
    try {
      if (ctx.createBuffer && ctx.createBufferSource) {
        const sampleRate = ctx.sampleRate || 44100;
        const bufferSize = Math.max(1, Math.floor(sampleRate * duration));
        const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
        const output = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          output[i] = Math.random() * 2 - 1;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = buffer;

        const filter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
        const noiseGain = ctx.createGain();

        noiseGain.gain.setValueAtTime(0.45, t);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        if (filter) {
          filter.type = 'bandpass';
          filter.frequency.setValueAtTime(900, t);
          filter.frequency.exponentialRampToValueAtTime(280, t + duration);
          if (filter.Q) {
            filter.Q.setValueAtTime(1.8, t);
          }
          whiteNoise.connect(filter);
          filter.connect(noiseGain);
        } else {
          whiteNoise.connect(noiseGain);
        }

        noiseGain.connect(destination);
        whiteNoise.start(t);
        whiteNoise.stop(t + duration);
      }
    } catch {
      // Noise fallback
    }

    setTimeout(releaseVoice, 500);
  }

  private synthesizeKnightCharge(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // crisp brass warhorn fifth (330Hz -> 495Hz) + 3 quick rhythmic hoofbeat taps (~0.32s)
    const hornDuration = 0.28;
    const horn = ctx.createOscillator();
    const hornGain = ctx.createGain();
    horn.type = 'sawtooth';
    horn.frequency.setValueAtTime(330, t);
    horn.frequency.exponentialRampToValueAtTime(495, t + 0.08);

    hornGain.gain.setValueAtTime(0.001, t);
    hornGain.gain.linearRampToValueAtTime(0.35, t + 0.02);
    hornGain.gain.exponentialRampToValueAtTime(0.001, t + hornDuration);

    const hornFilter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
    if (hornFilter) {
      hornFilter.type = 'lowpass';
      hornFilter.frequency.setValueAtTime(1400, t);
      horn.connect(hornFilter);
      hornFilter.connect(hornGain);
    } else {
      horn.connect(hornGain);
    }
    hornGain.connect(destination);

    horn.start(t);
    horn.stop(t + hornDuration + 0.01);

    // 3 quick rhythmic hoofbeat taps (~0.32s)
    const tapOffsets = [0.08, 0.17, 0.26];
    for (let i = 0; i < tapOffsets.length; i++) {
      const tapT = t + tapOffsets[i];
      const tapOsc = ctx.createOscillator();
      const tapGain = ctx.createGain();
      tapOsc.type = 'sine';
      tapOsc.frequency.setValueAtTime(140, tapT);
      tapOsc.frequency.exponentialRampToValueAtTime(45, tapT + 0.045);

      tapGain.gain.setValueAtTime(0.35, tapT);
      tapGain.gain.exponentialRampToValueAtTime(0.001, tapT + 0.045);

      tapOsc.connect(tapGain);
      tapGain.connect(destination);
      tapOsc.start(tapT);
      tapOsc.stop(tapT + 0.05);

      this.playNoiseBurst(ctx, destination, tapT, 0.028, 550, 0.22, 'bandpass', 1.5);
    }

    setTimeout(releaseVoice, 340);
  }

  private synthesizeKnightClash(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // sharp metallic steel sword ring (high-Q triangle/sine harmonic ping 1450Hz & 2200Hz + short metallic noise burst ~0.12s)
    const duration = 0.12;

    // Harmonic ping 1 (1450 Hz, high-Q triangle)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(1450, t);
    gain1.gain.setValueAtTime(0.38, t);
    gain1.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc1.connect(gain1);
    gain1.connect(destination);
    osc1.start(t);
    osc1.stop(t + duration + 0.01);

    // Harmonic ping 2 (2200 Hz, sine)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(2200, t);
    gain2.gain.setValueAtTime(0.30, t);
    gain2.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.9);
    osc2.connect(gain2);
    gain2.connect(destination);
    osc2.start(t);
    osc2.stop(t + duration + 0.01);

    // Short metallic noise burst ~0.12s
    this.playNoiseBurst(ctx, destination, t, duration, 3200, 0.35, 'bandpass', 3.0);

    setTimeout(releaseVoice, 130);
  }

  private synthesizeRoombaDeploy(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // iconic cheerful 3-note robotic startup beep (523Hz -> 659Hz -> 784Hz quick sine arpeggio) + soft low electric motor hum (140Hz -> 180Hz over ~0.28s)
    const notes = [
      { freq: 523, start: 0, dur: 0.07 },
      { freq: 659, start: 0.07, dur: 0.07 },
      { freq: 784, start: 0.14, dur: 0.12 },
    ];

    for (const note of notes) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(note.freq, t + note.start);
      gain.gain.setValueAtTime(0.28, t + note.start);
      gain.gain.exponentialRampToValueAtTime(0.001, t + note.start + note.dur);
      osc.connect(gain);
      gain.connect(destination);
      osc.start(t + note.start);
      osc.stop(t + note.start + note.dur + 0.01);
    }

    // Soft low electric motor hum (140Hz -> 180Hz over ~0.28s)
    const motorOsc = ctx.createOscillator();
    const motorGain = ctx.createGain();
    motorOsc.type = 'triangle';
    motorOsc.frequency.setValueAtTime(140, t);
    motorOsc.frequency.linearRampToValueAtTime(180, t + 0.28);
    motorGain.gain.setValueAtTime(0.2, t);
    motorGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
    motorOsc.connect(motorGain);
    motorGain.connect(destination);
    motorOsc.start(t);
    motorOsc.stop(t + 0.29);

    setTimeout(releaseVoice, 290);
  }

  private synthesizeRoombaSweep(
    ctx: AudioContext,
    destination: AudioNode,
    t: number,
    releaseVoice: () => void,
  ): void {
    // brief low-pass vacuum suction whoosh + soft rubber bumper thump (120Hz -> 65Hz, ~0.11s)
    const duration = 0.11;

    // Vacuum suction whoosh (lowpass noise burst)
    this.playNoiseBurst(ctx, destination, t, duration, 600, 0.32, 'lowpass');

    // Soft rubber bumper thump (120Hz -> 65Hz)
    const bumpOsc = ctx.createOscillator();
    const bumpGain = ctx.createGain();
    bumpOsc.type = 'sine';
    bumpOsc.frequency.setValueAtTime(120, t);
    bumpOsc.frequency.exponentialRampToValueAtTime(65, t + duration);
    bumpGain.gain.setValueAtTime(0.4, t);
    bumpGain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    bumpOsc.connect(bumpGain);
    bumpGain.connect(destination);
    bumpOsc.start(t);
    bumpOsc.stop(t + duration + 0.01);

    setTimeout(releaseVoice, 120);
  }

  private synthesizeMilitary(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Vulcan CIWS: crisp rapid mechanical autocannon punch (short band-pass noise crack + 160->75 Hz metallic thump, 45ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(75, t + 0.045);

          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);

          osc.connect(gain);
          gain.connect(destination);

          // Band-pass noise crack for mechanical bark
          this.playNoiseBurst(ctx, destination, t, 0.045, 1800, 0.4, 'bandpass', 2.0);

          osc.start(t);
          osc.stop(t + 0.05);
          setTimeout(releaseVoice, 50);
          break;
        }

        case 'shot-overcharge': {
          // DU Vulcan: heavier rapid rotary cannon burst (dual tight cracks + sharper mechanical bark, 65ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(190, t);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.065);

          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);

          osc.connect(gain);
          gain.connect(destination);

          // Dual tight noise cracks
          this.playNoiseBurst(ctx, destination, t, 0.03, 2400, 0.45, 'bandpass', 1.8);
          this.playNoiseBurst(ctx, destination, t + 0.025, 0.04, 2100, 0.4, 'bandpass', 2.2);

          osc.start(t);
          osc.stop(t + 0.07);
          setTimeout(releaseVoice, 70);
          break;
        }

        case 'shot-plasma': {
          // M777 Howitzer: deep heavy artillery cannon boom (low-pass noise blast + 115->38 Hz sub-thump, 190ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(115, t);
          osc.frequency.exponentialRampToValueAtTime(38, t + 0.19);

          gain.gain.setValueAtTime(0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);

          osc.connect(gain);
          gain.connect(destination);

          // Low-pass noise blast
          this.playNoiseBurst(ctx, destination, t, 0.19, 320, 0.65, 'lowpass');

          osc.start(t);
          osc.stop(t + 0.2);
          setTimeout(releaseVoice, 200);
          break;
        }

        case 'shot-stasis': {
          // EW Radar Jammer: subtle crisp tactical sonar/radar sweep ping + low electronic hum (640->580 Hz clean sine + soft pulse, 150ms)
          const oscPing = ctx.createOscillator();
          const gainPing = ctx.createGain();
          oscPing.type = 'sine';
          oscPing.frequency.setValueAtTime(640, t);
          oscPing.frequency.linearRampToValueAtTime(580, t + 0.15);

          gainPing.gain.setValueAtTime(0.3, t);
          gainPing.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

          oscPing.connect(gainPing);
          gainPing.connect(destination);

          // Low electronic hum
          const oscHum = ctx.createOscillator();
          const gainHum = ctx.createGain();
          oscHum.type = 'triangle';
          oscHum.frequency.setValueAtTime(120, t);
          gainHum.gain.setValueAtTime(0.2, t);
          gainHum.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

          oscHum.connect(gainHum);
          gainHum.connect(destination);

          oscPing.start(t);
          oscHum.start(t);
          oscPing.stop(t + 0.16);
          oscHum.stop(t + 0.16);
          setTimeout(releaseVoice, 160);
          break;
        }

        case 'shot-rail': {
          // M1 Abrams 120mm: thunderous high-velocity tank cannon blast (sharp transient crack + deep 140->34 Hz cannon boom + ringing breech decay, 220ms)
          const oscBoom = ctx.createOscillator();
          const gainBoom = ctx.createGain();
          oscBoom.type = 'sine';
          oscBoom.frequency.setValueAtTime(140, t);
          oscBoom.frequency.exponentialRampToValueAtTime(34, t + 0.22);

          gainBoom.gain.setValueAtTime(0.75, t);
          gainBoom.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

          oscBoom.connect(gainBoom);
          gainBoom.connect(destination);

          // Breech metallic ring
          const oscRing = ctx.createOscillator();
          const gainRing = ctx.createGain();
          oscRing.type = 'triangle';
          oscRing.frequency.setValueAtTime(540, t);
          oscRing.frequency.exponentialRampToValueAtTime(220, t + 0.22);

          gainRing.gain.setValueAtTime(0.18, t);
          gainRing.gain.exponentialRampToValueAtTime(0.001, t + 0.22);

          oscRing.connect(gainRing);
          gainRing.connect(destination);

          // Sharp transient noise crack
          this.playNoiseBurst(ctx, destination, t, 0.05, 3000, 0.55, 'bandpass', 1.5);
          // Heavy explosive air-displacement noise
          this.playNoiseBurst(ctx, destination, t, 0.22, 280, 0.5, 'lowpass');

          oscBoom.start(t);
          oscRing.start(t);
          oscBoom.stop(t + 0.23);
          oscRing.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'shot-swarm': {
          // Patriot SAM: pressurized rocket ignition hiss/whoosh (band-pass filtered noise sweep 900->2600->1100 Hz, 140ms)
          // Tonal motor ignite tone
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(280, t);
          osc.frequency.exponentialRampToValueAtTime(450, t + 0.07);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.14);

          gain.gain.setValueAtTime(0.2, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

          osc.connect(gain);
          gain.connect(destination);

          // Rocket ignition hiss/whoosh: sweep filter on noise if supported
          try {
            if (ctx.createBuffer && ctx.createBufferSource && ctx.createBiquadFilter) {
              const sampleRate = ctx.sampleRate || 44100;
              const dur = 0.14;
              const bufferSize = Math.max(1, Math.floor(sampleRate * dur));
              const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
              const output = buffer.getChannelData(0);
              for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;

              const whiteNoise = ctx.createBufferSource();
              whiteNoise.buffer = buffer;

              const filter = ctx.createBiquadFilter();
              filter.type = 'bandpass';
              filter.frequency.setValueAtTime(900, t);
              filter.frequency.linearRampToValueAtTime(2600, t + 0.07);
              filter.frequency.linearRampToValueAtTime(1100, t + 0.14);
              if (filter.Q) filter.Q.setValueAtTime(2.5, t);

              const noiseGain = ctx.createGain();
              noiseGain.gain.setValueAtTime(0.45, t);
              noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

              whiteNoise.connect(filter);
              filter.connect(noiseGain);
              noiseGain.connect(destination);

              whiteNoise.start(t);
              whiteNoise.stop(t + 0.14);
            } else {
              this.playNoiseBurst(ctx, destination, t, 0.14, 1800, 0.4, 'bandpass', 2.0);
            }
          } catch {
            this.playNoiseBurst(ctx, destination, t, 0.14, 1800, 0.4);
          }

          osc.start(t);
          osc.stop(t + 0.15);
          setTimeout(releaseVoice, 150);
          break;
        }

        case 'impact-plasma': {
          // Artillery/HE shell detonation: deep rumbling explosion (low-pass filtered noise rumble + sub boom 95->28 Hz, 260ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(95, t);
          osc.frequency.exponentialRampToValueAtTime(28, t + 0.26);

          gain.gain.setValueAtTime(0.75, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);

          osc.connect(gain);
          gain.connect(destination);

          // Deep explosive rumble
          this.playNoiseBurst(ctx, destination, t, 0.26, 250, 0.6, 'lowpass');

          osc.start(t);
          osc.stop(t + 0.27);
          setTimeout(releaseVoice, 270);
          break;
        }

        case 'impact-missile': {
          // Patriot intercept blast: sharp crisp airburst crack + short thump (110ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(55, t + 0.11);

          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

          osc.connect(gain);
          gain.connect(destination);

          // Sharp airburst crack
          this.playNoiseBurst(ctx, destination, t, 0.04, 2500, 0.5, 'bandpass', 1.8);
          this.playNoiseBurst(ctx, destination, t, 0.11, 480, 0.4, 'lowpass');

          osc.start(t);
          osc.stop(t + 0.12);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'kill': {
          // Vehicle destroyed: metallic crunch + muffled secondary blast (110ms)
          const oscCrunch = ctx.createOscillator();
          const gainCrunch = ctx.createGain();
          oscCrunch.type = 'sawtooth';
          oscCrunch.frequency.setValueAtTime(320, t);
          oscCrunch.frequency.exponentialRampToValueAtTime(90, t + 0.08);

          gainCrunch.gain.setValueAtTime(0.35, t);
          gainCrunch.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

          oscCrunch.connect(gainCrunch);
          gainCrunch.connect(destination);

          const oscSub = ctx.createOscillator();
          const gainSub = ctx.createGain();
          oscSub.type = 'sine';
          oscSub.frequency.setValueAtTime(110, t);
          oscSub.frequency.exponentialRampToValueAtTime(40, t + 0.11);

          gainSub.gain.setValueAtTime(0.45, t);
          gainSub.gain.exponentialRampToValueAtTime(0.001, t + 0.11);

          oscSub.connect(gainSub);
          gainSub.connect(destination);

          // Mechanical crunch noise
          this.playNoiseBurst(ctx, destination, t, 0.08, 1400, 0.35, 'bandpass', 1.5);
          this.playNoiseBurst(ctx, destination, t + 0.02, 0.09, 360, 0.4, 'lowpass');

          oscCrunch.start(t);
          oscSub.start(t);
          oscCrunch.stop(t + 0.09);
          oscSub.stop(t + 0.12);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'boss-phase': {
          // Kirov Siege Tank alert: rugged low military air-raid / armored klaxon sweep (185->130 Hz filtered sawtooth, 380ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const filter = ctx.createBiquadFilter ? ctx.createBiquadFilter() : null;
          const gain = ctx.createGain();

          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(185, t);
          osc1.frequency.exponentialRampToValueAtTime(130, t + 0.38);

          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(182, t);
          osc2.frequency.exponentialRampToValueAtTime(128, t + 0.38);

          gain.gain.setValueAtTime(0.55, t);
          gain.gain.linearRampToValueAtTime(0.55, t + 0.2);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);

          if (filter) {
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(450, t);
            filter.frequency.linearRampToValueAtTime(260, t + 0.38);
            osc1.connect(filter);
            osc2.connect(filter);
            filter.connect(gain);
          } else {
            osc1.connect(gain);
            osc2.connect(gain);
          }

          gain.connect(destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.4);
          osc2.stop(t + 0.4);
          setTimeout(releaseVoice, 400);
          break;
        }

        case 'leak': {
          // Seattle perimeter breach: urgent double tactical warning tone (440->320 Hz)
          const t1 = t;
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(440, t1);
          osc1.frequency.linearRampToValueAtTime(320, t1 + 0.08);

          gain1.gain.setValueAtTime(0.4, t1);
          gain1.gain.exponentialRampToValueAtTime(0.001, t1 + 0.08);

          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t1);
          osc1.stop(t1 + 0.09);

          const t2 = t + 0.1;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(440, t2);
          osc2.frequency.linearRampToValueAtTime(320, t2 + 0.08);

          gain2.gain.setValueAtTime(0.4, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.08);

          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.09);

          setTimeout(releaseVoice, 210);
          break;
        }

        case 'ui-place': {
          // Unit deployed: solid mechanical lock/radio click (short filtered click + muted confirm beep)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, t + 0.02);
          osc.frequency.exponentialRampToValueAtTime(680, t + 0.06);

          gain.gain.setValueAtTime(0.001, t);
          gain.gain.setValueAtTime(0.28, t + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);

          osc.connect(gain);
          gain.connect(destination);

          // Crisp mechanical snap click
          this.playNoiseBurst(ctx, destination, t, 0.02, 3200, 0.35, 'bandpass', 2.0);

          osc.start(t + 0.02);
          osc.stop(t + 0.075);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'ui-upgrade': {
          // Crisp tactical radio confirmation triad (military comms chirp triad)
          const notes = [587.33, 739.99, 880.0]; // D5, F#5, A5
          const step = 0.05;
          for (let i = 0; i < notes.length; i++) {
            const noteOsc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            const noteT = t + i * step;

            noteOsc.type = 'sine';
            noteOsc.frequency.setValueAtTime(notes[i], noteT);

            noteGain.gain.setValueAtTime(0.28, noteT);
            noteGain.gain.exponentialRampToValueAtTime(0.001, noteT + step * 1.1);

            noteOsc.connect(noteGain);
            noteGain.connect(destination);

            noteOsc.start(noteT);
            noteOsc.stop(noteT + step * 1.2);
          }
          // Subtle radio mic burst
          this.playNoiseBurst(ctx, destination, t, 0.025, 2800, 0.15, 'bandpass', 1.8);
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Short metallic mechanical release
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.exponentialRampToValueAtTime(210, t + 0.08);

          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

          osc.connect(gain);
          gain.connect(destination);

          this.playNoiseBurst(ctx, destination, t, 0.05, 1600, 0.25, 'bandpass', 2.0);

          osc.start(t);
          osc.stop(t + 0.09);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'ui-error': {
          // Muted low military error buzz
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(140, t);
          osc1.frequency.linearRampToValueAtTime(110, t + 0.05);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.055);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          const t2 = t + 0.06;
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(140, t2);
          osc2.frequency.linearRampToValueAtTime(110, t2 + 0.05);
          gain2.gain.setValueAtTime(0.35, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.05);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.055);

          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-share': {
          // Crisp radio funds-transfer double-chirp
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'triangle';
          n1.frequency.setValueAtTime(740, t);
          g1.gain.setValueAtTime(0.28, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.06);

          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          const t2 = t + 0.065;
          n2.type = 'triangle';
          n2.frequency.setValueAtTime(980, t2);
          g2.gain.setValueAtTime(0.3, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.065);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.07);

          setTimeout(releaseVoice, 140);
          break;
        }

        case 'ui-wave': {
          // Deep tactical war-horn / radio mobilization tone
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(165, t);
          osc1.frequency.exponentialRampToValueAtTime(220, t + 0.24);

          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(165, t);
          osc2.frequency.exponentialRampToValueAtTime(220, t + 0.24);

          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);

          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);

          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.25);
          osc2.stop(t + 0.25);

          setTimeout(releaseVoice, 250);
          break;
        }

        case 'ui-win': {
          // Stirring brass-like victory chord (D major brass flourish: D4, F#4, A4, D5)
          const chord = [293.66, 369.99, 440.0, 587.33];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(chord[i], t);

            gain.gain.setValueAtTime(0.16, t);
            gain.gain.linearRampToValueAtTime(0.16, t + 0.28);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);

            osc.connect(gain);
            gain.connect(destination);

            osc.start(t);
            osc.stop(t + 0.54);
          }
          setTimeout(releaseVoice, 540);
          break;
        }

        case 'ui-lose': {
          // Somber low defeat chord (D minor somber descent: 220, 174.61, 146.83 Hz)
          const notes = [220.0, 174.61, 146.83]; // A3, F3, D3
          const dur = 0.17;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;

            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);

            gain.gain.setValueAtTime(0.26, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur * 1.1);

            osc.connect(gain);
            gain.connect(destination);

            osc.start(noteT);
            osc.stop(noteT + dur * 1.1 + 0.02);
          }
          setTimeout(releaseVoice, 520);
          break;
        }

        case 'shot-mine': {
          // military mine deploy: heavy mechanical lock & arm (260 -> 90 Hz, 85ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(260, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.085);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.085);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.04, 2200, 0.3, 'bandpass', 3.0);
          osc.start(t);
          osc.stop(t + 0.09);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'impact-mine': {
          // military mine blast: violent explosive concussion (150 -> 40 Hz, 180ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.18, 550, 0.5, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.19);
          setTimeout(releaseVoice, 190);
          break;
        }

        case 'sonar-ping': {
          // tactical radar locator blip (1600 Hz sine, 150ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1600, t);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.16);
          setTimeout(releaseVoice, 160);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // desert combat wind gust (100 -> 70 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(100, t);
          osc.frequency.exponentialRampToValueAtTime(70, t + 0.24);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 400, 0.35);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'enrage': {
          // heavy engine redline roar (110 -> 220 Hz sawtooth, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.22);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'fridge-open': {
          // icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 700, 0.28, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private synthesizeNaval(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Deck Gun / Phalanx CIWS: rapid naval autocannon bark (dual bursts, 45ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.045);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.04, 1600, 0.35, 'bandpass', 2.5);
          osc.start(t);
          osc.stop(t + 0.05);
          setTimeout(releaseVoice, 50);
          break;
        }

        case 'shot-overcharge': {
          // Radar CIWS: heavier dual-mount sustained burst (dual saw, 65ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(260, t);
          osc1.frequency.exponentialRampToValueAtTime(110, t + 0.065);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(275, t);
          osc2.frequency.exponentialRampToValueAtTime(105, t + 0.065);
          gain.gain.setValueAtTime(0.48, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.06, 1800, 0.4, 'bandpass', 2.0);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.07);
          osc2.stop(t + 0.07);
          setTimeout(releaseVoice, 70);
          break;
        }

        case 'shot-plasma': {
          // Naval Minefield / Heavy Shell: hollow deck gun blast (140 -> 50 Hz, 160ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(50, t + 0.16);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.15, 600, 0.35, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'shot-stasis': {
          // Sonar Buoy active ping: submarine active echo ping (1200 -> 800 Hz, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1200, t);
          osc.frequency.exponentialRampToValueAtTime(800, t + 0.22);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'shot-rail': {
          // Destroyer ASW: torpedo pneumatic launch hiss & shaft whoosh (340 -> 120 Hz, 140ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(340, t);
          osc.frequency.exponentialRampToValueAtTime(120, t + 0.14);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.14, 1100, 0.3, 'bandpass', 1.5);
          osc.start(t);
          osc.stop(t + 0.15);
          setTimeout(releaseVoice, 150);
          break;
        }

        case 'shot-swarm': {
          // Aegis SAM: VLS rocket motor ignition & missile ascent (400 -> 800 Hz, 110ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(400, t);
          osc.frequency.exponentialRampToValueAtTime(800, t + 0.11);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.11, 1400, 0.35);
          osc.start(t);
          osc.stop(t + 0.12);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'shot-mine': {
          // Sea mine deployment splash & anchor release (metallic clink 420 -> 210 Hz + water plop 160 -> 70 Hz)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(420, t);
          osc1.frequency.exponentialRampToValueAtTime(210, t + 0.08);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(160, t + 0.03);
          osc2.frequency.exponentialRampToValueAtTime(70, t + 0.12);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t + 0.02, 0.09, 800, 0.25, 'bandpass', 1.8);
          osc1.start(t);
          osc2.start(t + 0.03);
          osc1.stop(t + 0.085);
          osc2.stop(t + 0.125);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'impact-plasma': {
          // Heavy naval shell impact & water plume (120 -> 35 Hz + splash noise, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.22, 500, 0.45);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'impact-missile': {
          // Missile warhead impact on ship armor (200 -> 60 Hz, 140ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.14);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.14, 900, 0.4);
          osc.start(t);
          osc.stop(t + 0.15);
          setTimeout(releaseVoice, 150);
          break;
        }

        case 'impact-mine': {
          // Naval sea mine splash detonation / depth charge boom (sub-bass 85 -> 30 Hz + water splash, 280ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(85, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.28);
          gain.gain.setValueAtTime(0.75, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.28, 420, 0.5, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.29);
          setTimeout(releaseVoice, 290);
          break;
        }

        case 'sonar-ping': {
          // Pristine hydro-acoustic sonar chime (sine 1800 Hz ringing long, 420ms decay + 3600 Hz harmonic)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          const gain2 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(1800, t);
          gain1.gain.setValueAtTime(0.42, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(3600, t);
          gain2.gain.setValueAtTime(0.18, t);
          gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.43);
          osc2.stop(t + 0.31);
          setTimeout(releaseVoice, 430);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // Ocean typhoon gale wind & churning waves (90 -> 60 Hz + spray noise, 280ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(90, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.28);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.28, 550, 0.4, 'bandpass', 1.0);
          osc.start(t);
          osc.stop(t + 0.29);
          setTimeout(releaseVoice, 290);
          break;
        }

        case 'enrage': {
          // Emergency battle-stations general quarters alarm (dual 880 / 1175 Hz, 220ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(880, t);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(1174.66, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.23);
          osc2.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'kill': {
          // Sinking ship hull rupture & bubbling blast (130 -> 30 Hz + bubble noise, 260ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(130, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.26);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.26, 480, 0.4);
          osc.start(t);
          osc.stop(t + 0.27);
          setTimeout(releaseVoice, 270);
          break;
        }

        case 'boss-phase': {
          // Typhoon Carrier heavy dual foghorn klaxon (sawtooth 185 Hz & 233 Hz, 420ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(185, t);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(233.08, t);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.linearRampToValueAtTime(0.45, t + 0.3);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.43);
          osc2.stop(t + 0.43);
          setTimeout(releaseVoice, 430);
          break;
        }

        case 'leak': {
          // Naval base hull breach siren (alternating 440 -> 370 Hz, 300ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.linearRampToValueAtTime(370, t + 0.3);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.31);
          setTimeout(releaseVoice, 310);
          break;
        }

        case 'ui-place': {
          // Ship's brass bell clank (1046 Hz sine, 100ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1046.5, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.11);
          setTimeout(releaseVoice, 110);
          break;
        }

        case 'ui-upgrade': {
          // Double ship's bell ring (880 -> 1320 Hz, 140ms)
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, t);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.075);

          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          const t2 = t + 0.065;
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1318.5, t2);
          gain2.gain.setValueAtTime(0.35, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.075);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.08);
          setTimeout(releaseVoice, 150);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Pneumatic hatch vent (320 -> 160 Hz, 75ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(320, t);
          osc.frequency.exponentialRampToValueAtTime(160, t + 0.075);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'ui-error': {
          // Sonar error buzzer (130 Hz sawtooth, 100ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(130, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.11);
          setTimeout(releaseVoice, 110);
          break;
        }

        case 'ui-share': {
          // Morse telegraph blip pair (1200 Hz, 110ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'sine';
          n1.frequency.setValueAtTime(1200, t);
          g1.gain.setValueAtTime(0.3, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.055);

          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          const t2 = t + 0.06;
          n2.type = 'sine';
          n2.frequency.setValueAtTime(1200, t2);
          g2.gain.setValueAtTime(0.3, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.05);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.055);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-wave': {
          // Boatswain's pipe whistle / sonar wave swell (660 -> 1320 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(660, t);
          osc.frequency.exponentialRampToValueAtTime(1320, t + 0.24);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'ui-win': {
          // Naval fleet triumph fanfare (C major brass: 261.63, 329.63, 392.0, 523.25 Hz, 520ms)
          const chord = [261.63, 329.63, 392.0, 523.25];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(chord[i], t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.26);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(t);
            osc.stop(t + 0.54);
          }
          setTimeout(releaseVoice, 540);
          break;
        }

        case 'ui-lose': {
          // Somber eight bells / low descent (174.61, 146.83, 110.0 Hz, 480ms)
          const notes = [174.61, 146.83, 110.0];
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);
            gain.gain.setValueAtTime(0.26, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        case 'fridge-open': {
          // icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 700, 0.28, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private synthesizeMars(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Pulse Laser: focused dust-cutting beam (920 -> 320 Hz triangle, 60ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(920, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.06);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.065);
          setTimeout(releaseVoice, 65);
          break;
        }

        case 'shot-overcharge': {
          // Thermal Beam: intense detuned beam burst (1050/1065 -> 220 Hz, 95ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(1050, t);
          osc1.frequency.exponentialRampToValueAtTime(220, t + 0.095);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(1065, t);
          osc2.frequency.exponentialRampToValueAtTime(215, t + 0.095);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.095);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.1);
          osc2.stop(t + 0.1);
          setTimeout(releaseVoice, 100);
          break;
        }

        case 'shot-plasma': {
          // Magma Mortar: subterranean bubbling mortar launch (180 -> 55 Hz, 150ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(180, t);
          osc.frequency.exponentialRampToValueAtTime(55, t + 0.15);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.14, 520, 0.35);
          osc.start(t);
          osc.stop(t + 0.16);
          setTimeout(releaseVoice, 160);
          break;
        }

        case 'shot-stasis': {
          // Cryo Thump: deep seismic ground rumble (55 -> 28 Hz sine + 110 -> 40 Hz, 260ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(55, t);
          osc1.frequency.exponentialRampToValueAtTime(28, t + 0.26);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(110, t);
          osc2.frequency.exponentialRampToValueAtTime(40, t + 0.26);
          gain.gain.setValueAtTime(0.6, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.25, 280, 0.35, 'lowpass');
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.27);
          osc2.stop(t + 0.27);
          setTimeout(releaseVoice, 270);
          break;
        }

        case 'shot-rail': {
          // Mass Driver: deep electromagnetic charge build + supersonic crack & sub-thump (200ms)
          const oscHigh = ctx.createOscillator();
          const oscLow = ctx.createOscillator();
          const gainHigh = ctx.createGain();
          const gainLow = ctx.createGain();
          oscHigh.type = 'sawtooth';
          oscHigh.frequency.setValueAtTime(120, t);
          oscHigh.frequency.exponentialRampToValueAtTime(980, t + 0.09);
          gainHigh.gain.setValueAtTime(0.4, t);
          gainHigh.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          oscLow.type = 'sine';
          oscLow.frequency.setValueAtTime(60, t + 0.05);
          oscLow.frequency.exponentialRampToValueAtTime(25, t + 0.2);
          gainLow.gain.setValueAtTime(0.7, t + 0.05);
          gainLow.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          oscHigh.connect(gainHigh);
          gainHigh.connect(destination);
          oscLow.connect(gainLow);
          gainLow.connect(destination);
          this.playNoiseBurst(ctx, destination, t + 0.07, 0.12, 1400, 0.45);
          oscHigh.start(t);
          oscLow.start(t + 0.05);
          oscHigh.stop(t + 0.095);
          oscLow.stop(t + 0.21);
          setTimeout(releaseVoice, 210);
          break;
        }

        case 'shot-swarm': {
          // Drone Pod: high-frequency drone thruster whine (520 -> 380 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(380, t + 0.09);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.08, 1600, 0.2);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'shot-mine': {
          // Seismic charge deployment lock (340 -> 110 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(340, t);
          osc.frequency.exponentialRampToValueAtTime(110, t + 0.09);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'impact-plasma': {
          // Molten magma impact & scorch (130 -> 35 Hz + scorch sizzle, 200ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(130, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.2);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.18, 650, 0.4);
          osc.start(t);
          osc.stop(t + 0.21);
          setTimeout(releaseVoice, 210);
          break;
        }

        case 'impact-missile': {
          // Drone kinetic impact (200 -> 50 Hz, 120ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(200, t);
          osc.frequency.exponentialRampToValueAtTime(50, t + 0.12);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.12, 1000, 0.35);
          osc.start(t);
          osc.stop(t + 0.13);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'impact-mine': {
          // Seismic shockwave detonation (sub-bass 100 -> 25 Hz + ground shock, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(100, t);
          osc.frequency.exponentialRampToValueAtTime(25, t + 0.24);
          gain.gain.setValueAtTime(0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 380, 0.5, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'sonar-ping': {
          // Martian orbital radar ping (1560 -> 1040 Hz, 160ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1560, t);
          osc.frequency.exponentialRampToValueAtTime(1040, t + 0.16);
          gain.gain.setValueAtTime(0.36, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // Sweeping filtered dust-storm wind (howling resonant wind 80 -> 140 -> 65 Hz + sweeping bandpass noise, 350ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(80, t);
          osc.frequency.linearRampToValueAtTime(140, t + 0.18);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.35);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.35, 680, 0.45, 'bandpass', 1.2);
          osc.start(t);
          osc.stop(t + 0.36);
          setTimeout(releaseVoice, 360);
          break;
        }

        case 'enrage': {
          // Alien bio-chitin shriek / rage surge (220 -> 540 -> 180 Hz, 250ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.linearRampToValueAtTime(540, t + 0.12);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.25);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.26);
          setTimeout(releaseVoice, 260);
          break;
        }

        case 'kill': {
          // Regolith collapse / vaporized enemy (160 -> 40 Hz + dust noise, 180ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.18);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.18, 550, 0.35);
          osc.start(t);
          osc.stop(t + 0.19);
          setTimeout(releaseVoice, 190);
          break;
        }

        case 'boss-phase': {
          // Olympus Behemoth bio-mechanical tremor roar (sub 70 -> 40 Hz + dual saw 90/135 Hz, 400ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(70, t);
          osc1.frequency.exponentialRampToValueAtTime(40, t + 0.4);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(90, t);
          osc2.frequency.linearRampToValueAtTime(135, t + 0.2);
          osc2.frequency.exponentialRampToValueAtTime(45, t + 0.4);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.41);
          osc2.stop(t + 0.41);
          setTimeout(releaseVoice, 410);
          break;
        }

        case 'leak': {
          // Ares Dome atmospheric breach decompression siren (587 -> 440 Hz, 280ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(587.33, t);
          osc.frequency.linearRampToValueAtTime(440, t + 0.28);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.29);
          setTimeout(releaseVoice, 290);
          break;
        }

        case 'ui-place': {
          // Habitat airlock latch / electronic blip (587 -> 880 Hz, 75ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(587.33, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.075);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'ui-upgrade': {
          // Reactor power conduit surge (440 -> 660 -> 880 Hz, 130ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.13);
          gain.gain.setValueAtTime(0.36, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.14);
          setTimeout(releaseVoice, 140);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Deconstruction laser dissolve (380 -> 120 Hz, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(380, t);
          osc.frequency.exponentialRampToValueAtTime(120, t + 0.08);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'ui-error': {
          // Hab warning buzzer (180 Hz sawtooth, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180, t);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'ui-share': {
          // Resource transfer pulse pair (784 -> 1046 Hz, 120ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'sine';
          n1.frequency.setValueAtTime(783.99, t);
          g1.gain.setValueAtTime(0.3, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.06);

          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          const t2 = t + 0.06;
          n2.type = 'sine';
          n2.frequency.setValueAtTime(1046.5, t2);
          g2.gain.setValueAtTime(0.3, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.055);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.06);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-wave': {
          // Martian storm / incoming alert siren (440 -> 880 Hz sweep, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.36, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'ui-win': {
          // Ares Colony survival fanfare (E major brass: 329.63, 415.3, 493.88, 659.25 Hz, 520ms)
          const chord = [329.63, 415.3, 493.88, 659.25];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[i], t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(t);
            osc.stop(t + 0.54);
          }
          setTimeout(releaseVoice, 540);
          break;
        }

        case 'ui-lose': {
          // Dying dome power down (246.94, 207.65, 164.81 Hz, 480ms)
          const notes = [246.94, 207.65, 164.81];
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);
            gain.gain.setValueAtTime(0.25, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        case 'fridge-open': {
          // icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 700, 0.28, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private synthesizeMedieval(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Archers: sharp bowstring twang (plucked string 440 -> 220 Hz triangle + arrow whistle, 65ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.065);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.05, 2400, 0.25, 'bandpass', 3.0);
          osc.start(t);
          osc.stop(t + 0.07);
          setTimeout(releaseVoice, 70);
          break;
        }

        case 'shot-overcharge': {
          // Elven Longbows: crisp dual bowstring volley (dual triangle, 75ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(520, t);
          osc1.frequency.exponentialRampToValueAtTime(240, t + 0.075);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(580, t);
          osc2.frequency.exponentialRampToValueAtTime(280, t + 0.075);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.08);
          osc2.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'shot-plasma': {
          // Trebuchet: wooden lever creak launch & whoosh (140 -> 60 Hz + heavy whoosh, 170ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.17);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.16, 500, 0.4);
          osc.start(t);
          osc.stop(t + 0.18);
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'shot-stasis': {
          // Frost Mage: crystalline frost chime / blizzard freeze (crystalline chimes 880 / 1320 / 1760 Hz, 240ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(880, t);
          osc1.frequency.exponentialRampToValueAtTime(1320, t + 0.24);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1760, t);
          osc2.frequency.exponentialRampToValueAtTime(880, t + 0.24);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.25);
          osc2.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'shot-rail': {
          // Ballista: violent wooden tension snap & bolt whoosh (360 -> 55 Hz, 150ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(360, t);
          osc.frequency.exponentialRampToValueAtTime(55, t + 0.15);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.14, 1200, 0.45);
          osc.start(t);
          osc.stop(t + 0.16);
          setTimeout(releaseVoice, 160);
          break;
        }

        case 'shot-swarm': {
          // Arcane Spire: magical sparkle / star volley (mystical triad 659 / 784 / 987 Hz, 160ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(659.25, t);
          osc1.frequency.exponentialRampToValueAtTime(987.77, t + 0.16);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(783.99, t);
          osc2.frequency.exponentialRampToValueAtTime(1318.5, t + 0.16);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.17);
          osc2.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'shot-mine': {
          // Spiked caltrops / barricade drop (metallic iron clank 520 -> 220 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'impact-plasma': {
          // Flaming boulder rock smash & fire blast (130 -> 35 Hz stone impact + debris, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(130, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.22);
          gain.gain.setValueAtTime(0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.22, 600, 0.5);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'impact-missile': {
          // Arcane / siege missile impact (240 -> 60 Hz, 130ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.13);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.13, 950, 0.35);
          osc.start(t);
          osc.stop(t + 0.14);
          setTimeout(releaseVoice, 140);
          break;
        }

        case 'impact-mine': {
          // Powder keg blast (violent boom 140 -> 30 Hz + smoke burst, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.22);
          gain.gain.setValueAtTime(0.72, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.22, 520, 0.5, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'sonar-ping': {
          // Ancient cathedral bell chime (pure bell tone 523 Hz + rich 1046 Hz harmonic, 400ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          const gain2 = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(523.25, t);
          gain1.gain.setValueAtTime(0.42, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1046.5, t);
          gain2.gain.setValueAtTime(0.2, t);
          gain2.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.41);
          osc2.stop(t + 0.31);
          setTimeout(releaseVoice, 410);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // Howling castle blizzard / dark magic gale (110 -> 80 Hz + wind noise, 300ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(110, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.3);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.3, 480, 0.4, 'bandpass', 1.0);
          osc.start(t);
          osc.stop(t + 0.31);
          setTimeout(releaseVoice, 310);
          break;
        }

        case 'enrage': {
          // Deep orc enrage roar (guttural growl & war cry: low distorted sawtooth pitch sweep 95 -> 180 -> 110 Hz, 320ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(95, t);
          osc.frequency.linearRampToValueAtTime(180, t + 0.14);
          osc.frequency.exponentialRampToValueAtTime(110, t + 0.32);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.33);
          setTimeout(releaseVoice, 330);
          break;
        }

        case 'kill': {
          // Orc / goblin death grunt (140 -> 60 Hz, 140ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(60, t + 0.14);
          gain.gain.setValueAtTime(0.48, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.15);
          setTimeout(releaseVoice, 150);
          break;
        }

        case 'boss-phase': {
          // Troll King battle horn & war drums (sawtooth 130 -> 160 Hz + drum thump 80 -> 40 Hz, 420ms)
          const oscHorn = ctx.createOscillator();
          const oscDrum = ctx.createOscillator();
          const gain = ctx.createGain();
          oscHorn.type = 'sawtooth';
          oscHorn.frequency.setValueAtTime(130, t);
          oscHorn.frequency.linearRampToValueAtTime(160, t + 0.3);
          oscHorn.frequency.exponentialRampToValueAtTime(110, t + 0.42);
          oscDrum.type = 'sine';
          oscDrum.frequency.setValueAtTime(80, t);
          oscDrum.frequency.exponentialRampToValueAtTime(40, t + 0.3);
          gain.gain.setValueAtTime(0.48, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
          oscHorn.connect(gain);
          oscDrum.connect(gain);
          gain.connect(destination);
          oscHorn.start(t);
          oscDrum.start(t);
          oscHorn.stop(t + 0.43);
          oscDrum.stop(t + 0.31);
          setTimeout(releaseVoice, 430);
          break;
        }

        case 'leak': {
          // Castle gate breach gong / iron toll (resonant gong 196 Hz + harmonic, 360ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(196.0, t);
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(392.0, t);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.36);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.37);
          osc2.stop(t + 0.37);
          setTimeout(releaseVoice, 370);
          break;
        }

        case 'ui-place': {
          // Blacksmith anvil / stone block tap (880 Hz triangle ping, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'ui-upgrade': {
          // Golden guild coin clink / forge chime (659 -> 987 Hz bell chime, 130ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(659.25, t);
          osc.frequency.exponentialRampToValueAtTime(987.77, t + 0.13);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.14);
          setTimeout(releaseVoice, 140);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Gold pouch purse jingle (440 -> 660 Hz, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(660, t + 0.08);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'ui-error': {
          // Wooden shield clatter / denied dull thud (140 Hz triangle, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'ui-share': {
          // Tavern lute pluck pair (587 -> 880 Hz, 130ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'triangle';
          n1.frequency.setValueAtTime(587.33, t);
          g1.gain.setValueAtTime(0.32, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.065);

          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          const t2 = t + 0.065;
          n2.type = 'triangle';
          n2.frequency.setValueAtTime(880, t2);
          g2.gain.setValueAtTime(0.32, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.06);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.065);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'ui-wave': {
          // Herald's royal bronze trumpet call (392 -> 587 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(392.0, t);
          osc.frequency.exponentialRampToValueAtTime(587.33, t + 0.24);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'ui-win': {
          // Royal castle victory hymn (D major heraldry: 293.66, 369.99, 440.0, 587.33 Hz, 520ms)
          const chord = [293.66, 369.99, 440.0, 587.33];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[i], t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.26);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(t);
            osc.stop(t + 0.54);
          }
          setTimeout(releaseVoice, 540);
          break;
        }

        case 'ui-lose': {
          // Fallen kingdom dirge / mournful bell toll (220.0, 174.61, 146.83 Hz, 500ms)
          const notes = [220.0, 174.61, 146.83];
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);
            gain.gain.setValueAtTime(0.26, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        case 'fridge-open': {
          // Icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 700, 0.28, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // Crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // Earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private synthesizeKitchen(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Swatter: snappy plastic swat smack (sharp slap noise + rapid triangle pitch down 680->120 Hz, 45ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(680, t);
          osc.frequency.exponentialRampToValueAtTime(120, t + 0.045);
          gain.gain.setValueAtTime(0.48, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.04, 2800, 0.42, 'bandpass', 2.5);
          osc.start(t);
          osc.stop(t + 0.05);
          setTimeout(releaseVoice, 50);
          break;
        }

        case 'shot-overcharge': {
          // Bug Zapper / Twin Swatter: electric zapping snap (dual triangle + crackle noise, 65ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(1200, t);
          osc.frequency.exponentialRampToValueAtTime(260, t + 0.065);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.065);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.06, 3500, 0.38, 'highpass');
          osc.start(t);
          osc.stop(t + 0.07);
          setTimeout(releaseVoice, 70);
          break;
        }

        case 'shot-plasma': {
          // Pepper Mill: spice puff & wooden crank clack (woody click 240->90 Hz + pepper puff noise, 120ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(240, t);
          osc.frequency.exponentialRampToValueAtTime(90, t + 0.08);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.12, 1100, 0.4, 'bandpass', 1.5);
          osc.start(t);
          osc.stop(t + 0.09);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'shot-stasis': {
          // Honey Trap: sticky syrup squish (slurpy sine frequency dip 420->180->320 Hz, 160ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.linearRampToValueAtTime(180, t + 0.08);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.16);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t + 0.02, 0.12, 600, 0.25, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.17);
          setTimeout(releaseVoice, 170);
          break;
        }

        case 'shot-rail': {
          // Chef Knife: metallic knife shing / blade slice (bright metallic shing 1800->3200 Hz sine + slice noise, 110ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(1800, t);
          osc1.frequency.exponentialRampToValueAtTime(3200, t + 0.1);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(2200, t);
          osc2.frequency.exponentialRampToValueAtTime(1400, t + 0.1);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.09, 4500, 0.35, 'highpass');
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.11);
          osc2.stop(t + 0.11);
          setTimeout(releaseVoice, 110);
          break;
        }

        case 'shot-swarm': {
          // Soap Sprayer: spray spritz burst (hissing mist noise + squirt chirp 800->400 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(800, t);
          osc.frequency.exponentialRampToValueAtTime(400, t + 0.08);
          gain.gain.setValueAtTime(0.3, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.09, 3200, 0.45, 'bandpass', 1.2);
          osc.start(t);
          osc.stop(t + 0.09);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'shot-mine': {
          // Mousetrap arming click (sharp metal click 950->340 Hz, 60ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(950, t);
          osc.frequency.exponentialRampToValueAtTime(340, t + 0.06);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.065);
          setTimeout(releaseVoice, 65);
          break;
        }

        case 'impact-plasma': {
          // Pepper burst / spice splash (thud 160->50 Hz + sizzling spice noise, 180ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(160, t);
          osc.frequency.exponentialRampToValueAtTime(50, t + 0.16);
          gain.gain.setValueAtTime(0.6, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.18, 900, 0.45);
          osc.start(t);
          osc.stop(t + 0.17);
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'impact-missile': {
          // Soap bubble pop / sud burst (bubble pop 600->220 Hz + splash noise, 110ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(600, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.09);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.1, 1400, 0.35);
          osc.start(t);
          osc.stop(t + 0.1);
          setTimeout(releaseVoice, 110);
          break;
        }

        case 'impact-mine': {
          // Mousetrap snap & clatter (powerful wooden snap 280->40 Hz + click, 160ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(280, t);
          osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
          gain.gain.setValueAtTime(0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.15, 2400, 0.5, 'bandpass', 2.0);
          osc.start(t);
          osc.stop(t + 0.16);
          setTimeout(releaseVoice, 160);
          break;
        }

        case 'sonar-ping': {
          // Microwave / timer bell ding (sweet metallic bell ding 1046 Hz pure chime, 300ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1046.5, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.31);
          setTimeout(releaseVoice, 310);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // Range hood exhaust whoosh / stove burner flare (warm rushing air, 260ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(70, t + 0.25);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.26, 650, 0.45, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.26);
          setTimeout(releaseVoice, 260);
          break;
        }

        case 'enrage': {
          // Angry rat squeak & hiss (high shrieking sweep 900->1800->1100 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(900, t);
          osc.frequency.linearRampToValueAtTime(1800, t + 0.1);
          osc.frequency.exponentialRampToValueAtTime(1100, t + 0.24);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'fridge-open': {
          // Icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 680, 0.3, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // Crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // Earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'kill': {
          // Bug squish / vermin crunch (squishy pop 340->110 Hz, 100ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(340, t);
          osc.frequency.exponentialRampToValueAtTime(110, t + 0.1);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.08, 1200, 0.35);
          osc.start(t);
          osc.stop(t + 0.11);
          setTimeout(releaseVoice, 110);
          break;
        }

        case 'boss-phase': {
          // King Rat battle roar / kitchen crash (pots clattering 740->220 Hz + deep growl 110->55 Hz, 360ms)
          const oscPan = ctx.createOscillator();
          const oscGrowl = ctx.createOscillator();
          const gain = ctx.createGain();
          oscPan.type = 'triangle';
          oscPan.frequency.setValueAtTime(740, t);
          oscPan.frequency.exponentialRampToValueAtTime(220, t + 0.35);
          oscGrowl.type = 'sawtooth';
          oscGrowl.frequency.setValueAtTime(110, t);
          oscGrowl.frequency.exponentialRampToValueAtTime(55, t + 0.35);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          oscPan.connect(gain);
          oscGrowl.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.25, 2200, 0.4);
          oscPan.start(t);
          oscGrowl.start(t);
          oscPan.stop(t + 0.36);
          oscGrowl.stop(t + 0.36);
          setTimeout(releaseVoice, 360);
          break;
        }

        case 'leak': {
          // Fridge alarm buzzer / dropped carton splat (jarring buzz 480->320 Hz, 280ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(480, t);
          osc.frequency.exponentialRampToValueAtTime(320, t + 0.28);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.29);
          setTimeout(releaseVoice, 290);
          break;
        }

        case 'ui-place': {
          // Ceramic mug / plate set-down clink (bright ceramic ping 784 Hz, 70ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(783.99, t);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.075);
          setTimeout(releaseVoice, 75);
          break;
        }

        case 'ui-upgrade': {
          // Silver spoon clink / chef chime (bright dual chime 880 -> 1320 Hz, 120ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(1320, t + 0.12);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.13);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Kitchen register bell ding (987 Hz triangle ding, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(987.77, t);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'ui-error': {
          // Buzzer / toaster thud (dull wooden spoon tap 160 Hz, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(160, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'ui-share': {
          // Toast pop / spoon tap pair (659 -> 987 Hz, 120ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'sine';
          n1.frequency.setValueAtTime(659.25, t);
          g1.gain.setValueAtTime(0.3, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.06);

          const t2 = t + 0.06;
          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          n2.type = 'sine';
          n2.frequency.setValueAtTime(987.77, t2);
          g2.gain.setValueAtTime(0.3, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.055);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.06);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-wave': {
          // Dinner bell chime / triangle gong (pure warm triangle 784 Hz chime, 220ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(783.99, t);
          gain.gain.setValueAtTime(0.42, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 230);
          break;
        }

        case 'ui-win': {
          // Culinary triumph fanfare (G major kitchen feast: 392, 493.88, 587.33, 783.99 Hz, 500ms)
          const chord = [392.0, 493.88, 587.33, 783.99];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[i], t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.24);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(t);
            osc.stop(t + 0.52);
          }
          setTimeout(releaseVoice, 520);
          break;
        }

        case 'ui-lose': {
          // Spoiled dinner / dropped pie dirge (349.23 -> 293.66 -> 220 Hz, 480ms)
          const notes = [349.23, 293.66, 220.0];
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);
            gain.gain.setValueAtTime(0.24, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }

  private synthesizeLawn(ev: SoundEvent): void {
    const ctx = this.ctx;
    const destination = this.compressor;
    if (!ctx || !destination) return;

    this.activeVoices++;
    let voiceFinished = false;
    const releaseVoice = () => {
      if (!voiceFinished) {
        voiceFinished = true;
        this.activeVoices = Math.max(0, this.activeVoices - 1);
      }
    };

    const t = ctx.currentTime;

    try {
      switch (ev) {
        case 'shot-pulse': {
          // Bug Zapper: electric crackle & sizzle pop (bright buzzing saw 920->240 Hz + electric spark noise, 55ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(920, t);
          osc.frequency.exponentialRampToValueAtTime(240, t + 0.055);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.05, 3800, 0.42, 'highpass');
          osc.start(t);
          osc.stop(t + 0.06);
          setTimeout(releaseVoice, 60);
          break;
        }

        case 'shot-overcharge': {
          // UV Tesla Coil: heavy electric arc zap (dual sawtooth 1340->310 Hz, 80ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sawtooth';
          osc1.frequency.setValueAtTime(1340, t);
          osc1.frequency.exponentialRampToValueAtTime(310, t + 0.08);
          osc2.type = 'sawtooth';
          osc2.frequency.setValueAtTime(1380, t);
          osc2.frequency.exponentialRampToValueAtTime(290, t + 0.08);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.075, 4200, 0.45, 'highpass');
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.085);
          osc2.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'shot-plasma': {
          // Garden Gnome: firecracker pop / pinecone mortar launch (sharp pop 440->80 Hz + gunpowder crackle, 130ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(440, t);
          osc.frequency.exponentialRampToValueAtTime(80, t + 0.12);
          gain.gain.setValueAtTime(0.55, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.11, 1600, 0.48, 'bandpass', 2.0);
          osc.start(t);
          osc.stop(t + 0.13);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'shot-stasis': {
          // Lawn Thumper: deep rhythmic seismic ground thud (sub-bass punch 120->35 Hz + sprinkler hiss, 180ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(120, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.17);
          gain.gain.setValueAtTime(0.65, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.17);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t + 0.03, 0.14, 520, 0.35, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.18);
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'shot-rail': {
          // Mole Spade: heavy garden spade clang / earth slice (metallic iron ring 880->220 Hz + dirt crunch, 140ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880, t);
          osc.frequency.exponentialRampToValueAtTime(220, t + 0.12);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.12, 1400, 0.42, 'bandpass', 1.8);
          osc.start(t);
          osc.stop(t + 0.13);
          setTimeout(releaseVoice, 140);
          break;
        }

        case 'shot-swarm': {
          // Hose Turret: pressurized water burst / high-pressure stream blast (rushing water blast 1200->600 Hz noise, 95ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(480, t);
          osc.frequency.exponentialRampToValueAtTime(180, t + 0.09);
          gain.gain.setValueAtTime(0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.095, 2100, 0.5, 'bandpass', 1.0);
          osc.start(t);
          osc.stop(t + 0.1);
          setTimeout(releaseVoice, 100);
          break;
        }

        case 'shot-mine': {
          // Underground sprinkler head / lawn trap pop (plunk click 380->140 Hz, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(380, t);
          osc.frequency.exponentialRampToValueAtTime(140, t + 0.08);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'impact-plasma': {
          // Pinecone / firecracker explosion (reverberant lawn blast 140->35 Hz + pine needle debris, 200ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(140, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.2);
          gain.gain.setValueAtTime(0.68, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.2, 750, 0.48);
          osc.start(t);
          osc.stop(t + 0.21);
          setTimeout(releaseVoice, 210);
          break;
        }

        case 'impact-missile': {
          // Water blast splash / hydro impact (wet splash noise + watery pop 420->120 Hz, 120ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(420, t);
          osc.frequency.exponentialRampToValueAtTime(120, t + 0.11);
          gain.gain.setValueAtTime(0.48, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.12, 1600, 0.42);
          osc.start(t);
          osc.stop(t + 0.12);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'impact-mine': {
          // Lawn eruption / sprinkler burst boom (earthen rupture 150->30 Hz + turf scatter, 200ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(150, t);
          osc.frequency.exponentialRampToValueAtTime(30, t + 0.2);
          gain.gain.setValueAtTime(0.7, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.2, 580, 0.5, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.21);
          setTimeout(releaseVoice, 210);
          break;
        }

        case 'sonar-ping': {
          // Garden wind chime (delicate metallic wind chime 1174 Hz + 1760 Hz harmonic, 350ms)
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gain = ctx.createGain();
          osc1.type = 'sine';
          osc1.frequency.setValueAtTime(1174.66, t);
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(1760.0, t);
          gain.gain.setValueAtTime(0.38, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc1.connect(gain);
          osc2.connect(gain);
          gain.connect(destination);
          osc1.start(t);
          osc2.start(t);
          osc1.stop(t + 0.36);
          osc2.stop(t + 0.36);
          setTimeout(releaseVoice, 360);
          break;
        }

        case 'meteor-warn': {
          // Subtle descending atmospheric whistle/whoosh (filtered noise + pitch-gliding sine from ~720Hz -> 240Hz over ~0.35s)
          this.synthesizeMeteorWarn(ctx, destination, t, releaseVoice);
          break;
        }

        case 'meteor-impact': {
          // Deep low-end thud (110Hz -> 36Hz pitch drop) layered with brief crunchy bandpass rock-shatter noise burst (~0.32s)
          this.synthesizeMeteorImpact(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dragon-breath': {
          this.synthesizeDragonBreath(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-charge': {
          this.synthesizeKnightCharge(ctx, destination, t, releaseVoice);
          break;
        }

        case 'knight-clash': {
          this.synthesizeKnightClash(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-deploy': {
          this.synthesizeRoombaDeploy(ctx, destination, t, releaseVoice);
          break;
        }

        case 'roomba-sweep': {
          this.synthesizeRoombaSweep(ctx, destination, t, releaseVoice);
          break;
        }

        case 'dust-storm': {
          // Backyard pollen squall / dry leaf gust (rustling grass noise, 280ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(100, t);
          osc.frequency.exponentialRampToValueAtTime(65, t + 0.28);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.28, 700, 0.4, 'bandpass', 1.0);
          osc.start(t);
          osc.stop(t + 0.29);
          setTimeout(releaseVoice, 290);
          break;
        }

        case 'enrage': {
          // Burrow tremor / insect swarm buzz (buzzing insect roar 180->360->240 Hz, 260ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(180, t);
          osc.frequency.linearRampToValueAtTime(360, t + 0.12);
          osc.frequency.exponentialRampToValueAtTime(240, t + 0.26);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.27);
          setTimeout(releaseVoice, 270);
          break;
        }

        case 'fridge-open': {
          // Icy chime + cool air whoosh
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(1760, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.22);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.24, 680, 0.3, 'lowpass');
          osc.start(t);
          osc.stop(t + 0.23);
          setTimeout(releaseVoice, 240);
          break;
        }

        case 'centipede-split': {
          // Crisp double-snap pop
          const osc1 = ctx.createOscillator();
          const gain1 = ctx.createGain();
          osc1.type = 'triangle';
          osc1.frequency.setValueAtTime(980, t);
          osc1.frequency.exponentialRampToValueAtTime(320, t + 0.04);
          gain1.gain.setValueAtTime(0.35, t);
          gain1.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc1.connect(gain1);
          gain1.connect(destination);
          osc1.start(t);
          osc1.stop(t + 0.045);

          const t2 = t + 0.04;
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'triangle';
          osc2.frequency.setValueAtTime(1180, t2);
          osc2.frequency.exponentialRampToValueAtTime(380, t2 + 0.045);
          gain2.gain.setValueAtTime(0.38, t2);
          gain2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.045);
          osc2.connect(gain2);
          gain2.connect(destination);
          osc2.start(t2);
          osc2.stop(t2 + 0.05);

          this.playNoiseBurst(ctx, destination, t, 0.035, 3200, 0.35, 'bandpass', 2.0);
          this.playNoiseBurst(ctx, destination, t2, 0.04, 3600, 0.38, 'bandpass', 2.0);
          setTimeout(releaseVoice, 90);
          break;
        }

        case 'mole-flush': {
          // Earthen thump + pop-up chirp
          const oscThump = ctx.createOscillator();
          const gainThump = ctx.createGain();
          oscThump.type = 'sine';
          oscThump.frequency.setValueAtTime(130, t);
          oscThump.frequency.exponentialRampToValueAtTime(45, t + 0.12);
          gainThump.gain.setValueAtTime(0.55, t);
          gainThump.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          oscThump.connect(gainThump);
          gainThump.connect(destination);
          oscThump.start(t);
          oscThump.stop(t + 0.13);

          const tChirp = t + 0.05;
          const oscChirp = ctx.createOscillator();
          const gainChirp = ctx.createGain();
          oscChirp.type = 'triangle';
          oscChirp.frequency.setValueAtTime(280, tChirp);
          oscChirp.frequency.exponentialRampToValueAtTime(640, tChirp + 0.12);
          gainChirp.gain.setValueAtTime(0.35, tChirp);
          gainChirp.gain.exponentialRampToValueAtTime(0.001, tChirp + 0.12);
          oscChirp.connect(gainChirp);
          gainChirp.connect(destination);
          oscChirp.start(tChirp);
          oscChirp.stop(tChirp + 0.13);

          this.playNoiseBurst(ctx, destination, t, 0.14, 450, 0.35, 'lowpass');
          setTimeout(releaseVoice, 180);
          break;
        }

        case 'kill': {
          // Bug zap / shell crack (crunchy snap 520->160 Hz, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(520, t);
          osc.frequency.exponentialRampToValueAtTime(160, t + 0.08);
          gain.gain.setValueAtTime(0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.07, 2400, 0.35);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'boss-phase': {
          // Millipede Queen screech & earthquake tremor (chittering sawtooth 440->880 Hz + deep sub 75->30 Hz, 380ms)
          const oscScreech = ctx.createOscillator();
          const oscTremor = ctx.createOscillator();
          const gain = ctx.createGain();
          oscScreech.type = 'sawtooth';
          oscScreech.frequency.setValueAtTime(440, t);
          oscScreech.frequency.linearRampToValueAtTime(880, t + 0.2);
          oscScreech.frequency.exponentialRampToValueAtTime(320, t + 0.38);
          oscTremor.type = 'sine';
          oscTremor.frequency.setValueAtTime(75, t);
          oscTremor.frequency.exponentialRampToValueAtTime(30, t + 0.38);
          gain.gain.setValueAtTime(0.52, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.38);
          oscScreech.connect(gain);
          oscTremor.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.25, 1800, 0.4);
          oscScreech.start(t);
          oscTremor.start(t);
          oscScreech.stop(t + 0.39);
          oscTremor.stop(t + 0.39);
          setTimeout(releaseVoice, 390);
          break;
        }

        case 'leak': {
          // Porch screen door slam / pest intrusion buzzer (screen slam 220->50 Hz, 260ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(220, t);
          osc.frequency.exponentialRampToValueAtTime(50, t + 0.25);
          gain.gain.setValueAtTime(0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
          osc.connect(gain);
          gain.connect(destination);
          this.playNoiseBurst(ctx, destination, t, 0.15, 1200, 0.4);
          osc.start(t);
          osc.stop(t + 0.26);
          setTimeout(releaseVoice, 260);
          break;
        }

        case 'ui-place': {
          // Garden stone paving tap (earthy stone tap 620 Hz triangle, 75ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(620, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.075);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.08);
          setTimeout(releaseVoice, 80);
          break;
        }

        case 'ui-upgrade': {
          // Watering can sprinkle chime (bright climbing chime 587 -> 880 Hz, 120ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(587.33, t);
          osc.frequency.exponentialRampToValueAtTime(880, t + 0.12);
          gain.gain.setValueAtTime(0.36, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.13);
          setTimeout(releaseVoice, 130);
          break;
        }

        case 'ui-repair': {
          // Quick metallic wrench double-click + bright ascending repair chime (520Hz -> 780Hz -> 1040Hz)
          this.synthesizeRepairChime(ctx, destination, t, releaseVoice);
          break;
        }

        case 'ui-sell': {
          // Seed packet rustle / clink (740 Hz triangle, 80ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(739.99, t);
          gain.gain.setValueAtTime(0.32, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.085);
          setTimeout(releaseVoice, 85);
          break;
        }

        case 'ui-error': {
          // Dry stick snap / denied thud (150 Hz triangle, 90ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(150, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.095);
          setTimeout(releaseVoice, 95);
          break;
        }

        case 'ui-share': {
          // Wooden fence bird chirp pair (784 -> 1174 Hz, 120ms)
          const n1 = ctx.createOscillator();
          const g1 = ctx.createGain();
          n1.type = 'sine';
          n1.frequency.setValueAtTime(783.99, t);
          g1.gain.setValueAtTime(0.3, t);
          g1.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
          n1.connect(g1);
          g1.connect(destination);
          n1.start(t);
          n1.stop(t + 0.06);

          const t2 = t + 0.06;
          const n2 = ctx.createOscillator();
          const g2 = ctx.createGain();
          n2.type = 'sine';
          n2.frequency.setValueAtTime(1174.66, t2);
          g2.gain.setValueAtTime(0.3, t2);
          g2.gain.exponentialRampToValueAtTime(0.001, t2 + 0.055);
          n2.connect(g2);
          g2.connect(destination);
          n2.start(t2);
          n2.stop(t2 + 0.06);
          setTimeout(releaseVoice, 120);
          break;
        }

        case 'ui-wave': {
          // Backyard dinner triangle / garden bell (bright ring 880 Hz, 240ms)
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(880.0, t);
          gain.gain.setValueAtTime(0.4, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
          osc.connect(gain);
          gain.connect(destination);
          osc.start(t);
          osc.stop(t + 0.25);
          setTimeout(releaseVoice, 250);
          break;
        }

        case 'ui-win': {
          // Garden bloom triumph fanfare (F major backyard flourish: 349.23, 440.0, 523.25, 698.46 Hz, 520ms)
          const chord = [349.23, 440.0, 523.25, 698.46];
          for (let i = 0; i < chord.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(chord[i], t);
            gain.gain.setValueAtTime(0.18, t);
            gain.gain.linearRampToValueAtTime(0.18, t + 0.25);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.52);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(t);
            osc.stop(t + 0.54);
          }
          setTimeout(releaseVoice, 540);
          break;
        }

        case 'ui-lose': {
          // Ruined lawn garden wilt dirge (293.66 -> 246.94 -> 196.0 Hz, 480ms)
          const notes = [293.66, 246.94, 196.0];
          const dur = 0.16;
          for (let i = 0; i < notes.length; i++) {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            const noteT = t + i * dur;
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(notes[i], noteT);
            gain.gain.setValueAtTime(0.25, noteT);
            gain.gain.exponentialRampToValueAtTime(0.001, noteT + dur);
            osc.connect(gain);
            gain.connect(destination);
            osc.start(noteT);
            osc.stop(noteT + dur + 0.02);
          }
          setTimeout(releaseVoice, 500);
          break;
        }

        default:
          releaseVoice();
          break;
      }
    } catch {
      releaseVoice();
    }
  }
}

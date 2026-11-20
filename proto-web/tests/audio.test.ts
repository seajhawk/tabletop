import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SoundEngine, SOUND_COOLDOWNS, type AudioTheme } from '../src/audio';
import type { SoundEvent } from '../src/types';

const ALL_SOUND_EVENTS: SoundEvent[] = [
  'shot-pulse',
  'shot-overcharge',
  'shot-plasma',
  'shot-stasis',
  'shot-rail',
  'shot-swarm',
  'shot-mine',
  'impact-plasma',
  'impact-missile',
  'impact-mine',
  'sonar-ping',
  'dust-storm',
  'enrage',
  'fridge-open',
  'centipede-split',
  'mole-flush',
  'meteor-warn',
  'meteor-impact',
  'dragon-breath',
  'knight-charge',
  'knight-clash',
  'roomba-deploy',
  'roomba-sweep',
  'kill',
  'boss-phase',
  'leak',
  'ui-place',
  'ui-upgrade',
  'ui-repair',
  'ui-sell',
  'ui-error',
  'ui-share',
  'ui-wave',
  'ui-win',
  'ui-lose',
];

const THEMES: AudioTheme[] = ['space', 'military', 'naval', 'mars', 'medieval', 'kitchen', 'lawn'];

describe('SoundEngine', () => {
  it('safe headless no-op when AudioContext is absent', () => {
    const engine = new SoundEngine();
    // unlock does not throw
    expect(() => engine.unlock()).not.toThrow();
    // play returns false because no AudioContext can be initialized
    expect(engine.play('shot-pulse')).toBe(false);
    expect(engine.muted).toBe(false);
    expect(engine.toggleMute()).toBe(true);
    expect(engine.muted).toBe(true);
    expect(engine.toggleMute()).toBe(false);
    expect(engine.muted).toBe(false);
  });

  it('defines positive cooldowns for all 35 sound events', () => {
    expect(ALL_SOUND_EVENTS).toHaveLength(35);
    for (const ev of ALL_SOUND_EVENTS) {
      expect(typeof SOUND_COOLDOWNS[ev]).toBe('number');
      expect(SOUND_COOLDOWNS[ev]).toBeGreaterThan(0);
    }
    expect(SOUND_COOLDOWNS['meteor-warn']).toBe(200);
    expect(SOUND_COOLDOWNS['meteor-impact']).toBe(120);
    expect(SOUND_COOLDOWNS['ui-repair']).toBe(80);
    expect(SOUND_COOLDOWNS['dragon-breath']).toBe(350);
    expect(SOUND_COOLDOWNS['knight-charge']).toBe(250);
    expect(SOUND_COOLDOWNS['knight-clash']).toBe(90);
    expect(SOUND_COOLDOWNS['roomba-deploy']).toBe(250);
    expect(SOUND_COOLDOWNS['roomba-sweep']).toBe(90);
  });

  describe('with mock AudioContext', () => {
    let mockCtx: any;
    let createdOscillators: any[];
    let createdGains: any[];
    let createdFilters: any[];
    let createdBuffers: any[];
    let createdSources: any[];
    let compressor: any;

    beforeEach(() => {
      createdOscillators = [];
      createdGains = [];
      createdFilters = [];
      createdBuffers = [];
      createdSources = [];

      const createMockAudioParam = (defaultValue = 0) => ({
        value: defaultValue,
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn(),
        linearRampToValueAtTime: vi.fn(),
      });

      compressor = {
        threshold: createMockAudioParam(-18),
        knee: createMockAudioParam(12),
        ratio: createMockAudioParam(12),
        attack: createMockAudioParam(0.003),
        release: createMockAudioParam(0.15),
        connect: vi.fn(),
        disconnect: vi.fn(),
      };

      mockCtx = {
        state: 'running',
        currentTime: 10,
        sampleRate: 44100,
        destination: { id: 'destination' },
        resume: vi.fn().mockResolvedValue(undefined),
        createDynamicsCompressor: vi.fn(() => compressor),
        createGain: vi.fn(() => {
          const g = {
            gain: createMockAudioParam(1),
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
          createdGains.push(g);
          return g;
        }),
        createOscillator: vi.fn(() => {
          const osc = {
            type: 'sine',
            frequency: createMockAudioParam(440),
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
          createdOscillators.push(osc);
          return osc;
        }),
        createBiquadFilter: vi.fn(() => {
          const filter = {
            type: 'lowpass',
            frequency: createMockAudioParam(1000),
            connect: vi.fn(),
            disconnect: vi.fn(),
          };
          createdFilters.push(filter);
          return filter;
        }),
        createBuffer: vi.fn((channels, length, rate) => {
          const buf = {
            channels,
            length,
            rate,
            getChannelData: vi.fn(() => new Float32Array(length)),
          };
          createdBuffers.push(buf);
          return buf;
        }),
        createBufferSource: vi.fn(() => {
          const src = {
            buffer: null,
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
          };
          createdSources.push(src);
          return src;
        }),
      };
    });

    it('initializes master audio graph on unlock', () => {
      const engine = new SoundEngine(() => mockCtx);
      engine.unlock();

      expect(mockCtx.createDynamicsCompressor).toHaveBeenCalledTimes(1);
      expect(compressor.threshold.setValueAtTime).toHaveBeenCalledWith(-18, 10);
      expect(mockCtx.createGain).toHaveBeenCalled(); // master gain
      expect(compressor.connect).toHaveBeenCalled();
    });

    it('muted suppresses playback', () => {
      const engine = new SoundEngine(() => mockCtx);
      engine.unlock();
      engine.setMuted(true);

      const res = engine.play('shot-pulse', 1000);
      expect(res).toBe(false);
      expect(createdOscillators.length).toBe(0);
    });

    it('supports switching theme across all 7 themes', () => {
      const engine = new SoundEngine(() => mockCtx);
      expect(engine.theme).toBe('space');
      for (const t of THEMES) {
        engine.setTheme(t);
        expect(engine.theme).toBe(t);
      }
    });

    it.each(THEMES)('synthesizes all 35 SoundEvents cleanly in %s theme', (theme) => {
      for (let i = 0; i < ALL_SOUND_EVENTS.length; i++) {
        const ev = ALL_SOUND_EVENTS[i];
        const engine = new SoundEngine(() => mockCtx);
        engine.setTheme(theme);
        engine.unlock();

        const oscCountBefore = createdOscillators.length;
        const res = engine.play(ev, 1000 + i * 500);
        expect(res).toBe(true);
        expect(createdOscillators.length).toBeGreaterThan(oscCountBefore);
      }
    });

    it('throttles rapid duplicate combat spam within cooldown while allowing after cooldown', () => {
      const engine = new SoundEngine(() => mockCtx);
      engine.unlock();

      const pulseCooldown = SOUND_COOLDOWNS['shot-pulse']; // 55ms
      expect(pulseCooldown).toBe(55);

      // First shot succeeds at t=1000
      expect(engine.play('shot-pulse', 1000)).toBe(true);

      // Immediate shot at t=1020 fails due to throttling (< 55ms)
      expect(engine.play('shot-pulse', 1020)).toBe(false);

      // Shot at t=1054 fails (54ms elapsed < 55ms)
      expect(engine.play('shot-pulse', 1054)).toBe(false);

      // Shot at t=1056 succeeds (56ms elapsed >= 55ms)
      expect(engine.play('shot-pulse', 1056)).toBe(true);

      // Different event 'impact-missile' at t=1060 is not blocked by 'shot-pulse'
      expect(engine.play('impact-missile', 1060)).toBe(true);

      // But duplicate 'impact-missile' at t=1080 is blocked (cooldown 75ms)
      expect(engine.play('impact-missile', 1080)).toBe(false);

      // Rapid sonar-ping throttles within 120ms
      expect(engine.play('sonar-ping', 1100)).toBe(true);
      expect(engine.play('sonar-ping', 1150)).toBe(false);
      expect(engine.play('sonar-ping', 1230)).toBe(true);
    });

    it('resumes suspended context on unlock or play', () => {
      mockCtx.state = 'suspended';
      const engine = new SoundEngine(() => mockCtx);
      engine.unlock();
      expect(mockCtx.resume).toHaveBeenCalled();

      mockCtx.state = 'suspended';
      engine.play('ui-place', 2000);
      expect(mockCtx.resume).toHaveBeenCalledTimes(2);
    });
  });
});

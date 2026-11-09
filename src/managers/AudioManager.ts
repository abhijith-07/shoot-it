import { Disposables } from '@/core/Disposables';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';

interface ToneOptions {
  from: number;
  to: number;
  duration: number;
  type: OscillatorType;
  volume: number;
}

/**
 * Procedural sound effects (Web Audio) — no asset downloads.
 * The AudioContext can only start after a user gesture, hence `unlock()`.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly subscriptions = new Disposables();

  constructor(bus: EventBus<GameEvents>) {
    this.subscriptions.add(bus.on('weapon:fired', () => this.tone({ from: 880, to: 220, duration: 0.12, type: 'square', volume: 0.12 })));
    this.subscriptions.add(bus.on('target:hit', () => this.tone({ from: 520, to: 1040, duration: 0.15, type: 'triangle', volume: 0.25 })));
    this.subscriptions.add(bus.on('player:damaged', () => this.tone({ from: 160, to: 60, duration: 0.3, type: 'sawtooth', volume: 0.3 })));
    this.subscriptions.add(bus.on('game:over', () => this.tone({ from: 300, to: 40, duration: 0.8, type: 'sawtooth', volume: 0.3 })));
  }

  async unlock(): Promise<void> {
    try {
      if (!this.ctx) {
        const Ctor =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.8;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') await this.ctx.resume();
    } catch (error) {
      console.warn('[AudioManager] audio unavailable', error);
    }
  }

  dispose(): void {
    this.subscriptions.disposeAll();
    void this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.master = null;
  }

  private tone(o: ToneOptions): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master || ctx.state !== 'running') return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const t0 = ctx.currentTime;
    osc.type = o.type;
    osc.frequency.setValueAtTime(o.from, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(o.to, 1), t0 + o.duration);
    gain.gain.setValueAtTime(o.volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + o.duration);
    osc.connect(gain).connect(master);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
    };
    osc.start(t0);
    osc.stop(t0 + o.duration);
  }
}

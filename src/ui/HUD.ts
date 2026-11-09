import { Disposables } from '@/core/Disposables';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents, GameState } from '@/core/events';
import { StateManager } from '@/managers/StateManager';
import { listen, pulse, requireElement } from '@/ui/dom';

/** Passive view: renders state, forwards the exit intent. Contains no game logic. */
export class HUD {
  private readonly root: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private readonly healthFill: HTMLElement;
  private readonly healthText: HTMLElement;
  private readonly crosshair: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly hintEl: HTMLElement;
  private hintTimer: number | undefined;
  private readonly subscriptions = new Disposables();

  constructor(overlay: HTMLElement, bus: EventBus<GameEvents>) {
    this.root = requireElement(overlay, '#hud');
    this.scoreEl = requireElement(overlay, '#score');
    this.healthFill = requireElement(overlay, '#health-fill');
    this.healthText = requireElement(overlay, '#health-text');
    this.crosshair = requireElement(overlay, '#crosshair');
    this.vignette = requireElement(overlay, '#damage-vignette');
    this.hintEl = requireElement(overlay, '#hint');
    const exitButton = requireElement(overlay, '#btn-exit-hud');

    this.subscriptions.add(listen(exitButton, 'click', () => bus.emit('ui:exit')));
    this.subscriptions.add(bus.on('state:changed', (state) => this.render(state)));
    this.subscriptions.add(bus.on('target:hit', () => pulse(this.crosshair, 'is-hit')));
    this.subscriptions.add(bus.on('player:damaged', () => pulse(this.vignette, 'is-hurt')));
  }

  /** Brief, non-blocking instruction toast. */
  showHint(text: string, durationMs = 4500): void {
    window.clearTimeout(this.hintTimer);
    this.hintEl.textContent = text;
    this.hintEl.classList.add('visible');
    this.hintTimer = window.setTimeout(() => this.hintEl.classList.remove('visible'), durationMs);
  }

  dispose(): void {
    window.clearTimeout(this.hintTimer);
    this.subscriptions.disposeAll();
  }

  private render(state: Readonly<GameState>): void {
    this.root.hidden = state.phase !== 'playing';
    this.scoreEl.textContent = String(state.score);
    this.healthText.textContent = String(state.health);
    const pct = (state.health / StateManager.MAX_HEALTH) * 100;
    this.healthFill.style.width = `${pct}%`;
    this.healthFill.classList.toggle('is-low', pct <= 30);
  }
}

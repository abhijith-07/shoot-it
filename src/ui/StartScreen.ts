import { Disposables } from '@/core/Disposables';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents, GamePhase } from '@/core/events';
import { listen, requireElement } from '@/ui/dom';

const MENU_MESSAGE =
  'Hold your phone upright and turn around to find the targets. Tap anywhere to fire at the crosshair. Don’t let them reach you!';

/** Absolute-centred loading / start / game-over view. Emits `ui:start` and `ui:exit`. */
export class StartScreen {
  private readonly root: HTMLElement;
  private readonly title: HTMLElement;
  private readonly message: HTMLElement;
  private readonly spinner: HTMLElement;
  private readonly startButton: HTMLButtonElement;
  private readonly exitButton: HTMLButtonElement;
  private readonly subscriptions = new Disposables();

  private notice: string | null = null;
  private phase: GamePhase = 'booting';
  private score = 0;

  constructor(overlay: HTMLElement, bus: EventBus<GameEvents>) {
    this.root = requireElement(overlay, '#screen');
    this.title = requireElement(overlay, '#screen-title');
    this.message = requireElement(overlay, '#screen-message');
    this.spinner = requireElement(overlay, '#spinner');
    this.startButton = requireElement<HTMLButtonElement>(overlay, '#btn-start');
    this.exitButton = requireElement<HTMLButtonElement>(overlay, '#btn-exit');

    this.subscriptions.add(listen(this.startButton, 'click', () => bus.emit('ui:start')));
    this.subscriptions.add(listen(this.exitButton, 'click', () => bus.emit('ui:exit')));
    this.subscriptions.add(
      bus.on('state:changed', (state) => {
        const phaseChanged = state.phase !== this.phase;
        this.phase = state.phase;
        this.score = state.score;
        if (phaseChanged) this.render();
      }),
    );
    this.render();
  }

  setBusy(message: string): void {
    this.notice = null;
    this.apply({ title: 'Target Shooter', message, spinner: true, button: null, exit: false });
  }

  showError(message: string): void {
    this.notice = message;
    this.render();
  }

  dispose(): void {
    this.subscriptions.disposeAll();
  }

  private render(): void {
    switch (this.phase) {
      case 'booting':
        this.apply({ title: 'Target Shooter', message: 'Loading…', spinner: true, button: null, exit: false });
        break;
      case 'menu':
        this.apply({
          title: 'Target Shooter',
          message: this.notice ?? MENU_MESSAGE,
          error: this.notice !== null,
          spinner: false,
          button: 'Start',
          exit: false,
        });
        break;
      case 'playing':
        this.root.hidden = true;
        break;
      case 'gameover':
        this.apply({
          title: 'Game over',
          message: `Final score: ${this.score}`,
          spinner: false,
          button: 'Play again',
          exit: true,
        });
        break;
    }
  }

  private apply(view: {
    title: string;
    message: string;
    error?: boolean;
    spinner: boolean;
    button: string | null;
    exit: boolean;
  }): void {
    this.root.hidden = false;
    this.title.textContent = view.title;
    this.message.textContent = view.message;
    this.message.classList.toggle('is-error', view.error === true);
    this.spinner.hidden = !view.spinner;
    this.startButton.hidden = view.button === null;
    if (view.button) {
      this.startButton.textContent = view.button;
      this.startButton.disabled = false;
    }
    this.exitButton.hidden = !view.exit;
  }
}

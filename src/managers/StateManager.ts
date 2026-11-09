import { Disposables } from '@/core/Disposables';
import type { EventBus } from '@/core/EventBus';
import type { GamePhase, GameState, GameEvents } from '@/core/events';

/**
 * Design pattern: single-source-of-truth store with immutable snapshots.
 * Mutations happen only here; everyone else observes `state:changed`.
 */
export class StateManager {
  static readonly MAX_HEALTH = 100;

  private state: GameState = { phase: 'booting', score: 0, health: StateManager.MAX_HEALTH };
  private readonly subscriptions = new Disposables();

  constructor(private readonly bus: EventBus<GameEvents>) {
    this.subscriptions.add(bus.on('target:hit', ({ points }) => this.addScore(points)));
    this.subscriptions.add(bus.on('player:damaged', ({ amount }) => this.damage(amount)));
  }

  get snapshot(): Readonly<GameState> {
    return this.state;
  }

  get phase(): GamePhase {
    return this.state.phase;
  }

  setPhase(phase: GamePhase): void {
    if (phase === this.state.phase) return;
    this.commit({ phase });
  }

  /** Start a fresh round. */
  reset(): void {
    this.state = { phase: 'playing', score: 0, health: StateManager.MAX_HEALTH };
    this.bus.emit('state:changed', this.state);
  }

  addScore(points: number): void {
    if (this.state.phase !== 'playing') return;
    this.commit({ score: this.state.score + points });
  }

  damage(amount: number): void {
    if (this.state.phase !== 'playing') return;
    const health = Math.max(0, this.state.health - amount);
    if (health > 0) {
      this.commit({ health });
      return;
    }
    this.commit({ health: 0, phase: 'gameover' });
    this.bus.emit('game:over', { score: this.state.score });
  }

  dispose(): void {
    this.subscriptions.disposeAll();
  }

  private commit(patch: Partial<GameState>): void {
    this.state = { ...this.state, ...patch };
    this.bus.emit('state:changed', this.state);
  }
}

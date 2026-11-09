import type { Vector3 } from 'three';

export type GamePhase = 'booting' | 'menu' | 'playing' | 'gameover';

export interface GameState {
  phase: GamePhase;
  score: number;
  health: number;
}

export interface FirePayload {
  /** World-space ray origin (camera position). */
  origin: Vector3;
  /** Normalised world-space ray direction (camera forward vector). */
  direction: Vector3;
}

/**
 * The single source of truth for every event that crosses a module boundary.
 * `undefined` means "no payload".
 */
export interface GameEvents {
  'ui:start': undefined;
  'ui:exit': undefined;
  'input:fire': FirePayload;
  'weapon:fired': undefined;
  'target:hit': { points: number; position: Vector3 };
  'player:damaged': { amount: number };
  'game:over': { score: number };
  'state:changed': Readonly<GameState>;
}

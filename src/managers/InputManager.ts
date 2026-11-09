import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { LookControls } from '@/core/LookControls';
import { Disposables } from '@/core/Disposables';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';

/** Finger travel (px) below which a touch counts as a tap rather than a drag. */
const TAP_SLOP_PX = 10;

/**
 * Pointer/keyboard input -> one semantic event: `input:fire`.
 *
 * Shots always leave the camera along its forward vector, i.e. exactly through
 * the crosshair at screen centre, wherever the finger touched.
 *  - Gyro mode: fire immediately on touch-down (lowest latency).
 *  - Drag mode (no gyro): dragging looks around, a short tap fires.
 *  - Space bar fires on desktop.
 */
export class InputManager {
  private readonly subscriptions = new Disposables();
  private readonly origin = new Vector3();
  private readonly direction = new Vector3();
  private activePointer: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private travelled = 0;

  constructor(
    private readonly bus: EventBus<GameEvents>,
    private readonly surface: HTMLElement,
    private readonly camera: Camera,
    private readonly look: LookControls,
  ) {
    surface.addEventListener('pointerdown', this.handlePointerDown);
    surface.addEventListener('pointermove', this.handlePointerMove);
    surface.addEventListener('pointerup', this.handlePointerEnd);
    surface.addEventListener('pointercancel', this.handlePointerEnd);
    window.addEventListener('keydown', this.handleKeyDown);

    this.subscriptions.add(() => {
      surface.removeEventListener('pointerdown', this.handlePointerDown);
      surface.removeEventListener('pointermove', this.handlePointerMove);
      surface.removeEventListener('pointerup', this.handlePointerEnd);
      surface.removeEventListener('pointercancel', this.handlePointerEnd);
      window.removeEventListener('keydown', this.handleKeyDown);
    });
  }

  dispose(): void {
    this.subscriptions.disposeAll();
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (this.activePointer !== null) return; // ignore extra fingers
    this.activePointer = event.pointerId;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.travelled = 0;
    try {
      this.surface.setPointerCapture(event.pointerId);
    } catch {
      /* capture is best-effort */
    }
    if (this.look.usingGyro) this.fire();
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointer || this.look.usingGyro) return;
    const dx = event.clientX - this.lastX;
    const dy = event.clientY - this.lastY;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.travelled += Math.abs(dx) + Math.abs(dy);
    this.look.addDrag(dx, dy);
  };

  private readonly handlePointerEnd = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointer) return;
    this.activePointer = null;
    if (event.type === 'pointerup' && !this.look.usingGyro && this.travelled < TAP_SLOP_PX) {
      this.fire();
    }
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.code === 'Space' && !event.repeat) {
      event.preventDefault();
      this.fire();
    }
  };

  private fire(): void {
    this.camera.updateMatrixWorld(true);
    this.camera.getWorldPosition(this.origin);
    this.camera.getWorldDirection(this.direction); // normalised forward (-Z)
    this.bus.emit('input:fire', {
      origin: this.origin.clone(),
      direction: this.direction.clone(),
    });
  }
}

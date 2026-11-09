import { Euler, MathUtils, Quaternion, Vector3 } from 'three';
import type { PerspectiveCamera } from 'three';

export type MotionStatus = 'granted' | 'denied' | 'unsupported';

interface PermissionedOrientationEvent {
  requestPermission?: () => Promise<'granted' | 'denied'>;
}

/**
 * Camera look controls.
 *  - Primary: phone gyroscope (DeviceOrientation) — turn your body/phone to look around.
 *  - Fallback: drag-to-look (desktop, or if the sensor is missing/denied).
 *
 * `usingGyro` flips to true only once real sensor data has actually arrived,
 * so the fallback activates automatically on devices without a gyroscope.
 */
export class LookControls {
  private static readonly ZEE = new Vector3(0, 0, 1);
  private static readonly Q1 = new Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X

  private readonly euler = new Euler();
  private readonly screenQuat = new Quaternion();

  private status: MotionStatus | null = null;
  private hasDeviceData = false;
  private alpha = 0;
  private beta = 0;
  private gamma = 0;
  private yaw = 0;
  private pitch = 0;

  constructor(private readonly camera: PerspectiveCamera) {
    this.camera.rotation.order = 'YXZ';
  }

  get usingGyro(): boolean {
    return this.hasDeviceData;
  }

  /**
   * Must be called from a user gesture (iOS shows a permission prompt).
   * The permission request is issued synchronously, before any `await`.
   */
  async enable(): Promise<MotionStatus> {
    if (this.status) return this.status;
    if (typeof DeviceOrientationEvent === 'undefined') {
      this.status = 'unsupported';
      return this.status;
    }

    const ctor = DeviceOrientationEvent as unknown as PermissionedOrientationEvent;
    if (typeof ctor.requestPermission === 'function') {
      try {
        const result = await ctor.requestPermission();
        if (result !== 'granted') {
          this.status = 'denied';
          return this.status;
        }
      } catch {
        this.status = 'denied';
        return this.status;
      }
    }

    window.addEventListener('deviceorientation', this.handleOrientation);
    this.status = 'granted';
    return this.status;
  }

  /** Drag-to-look fallback (pixels). */
  addDrag(dx: number, dy: number): void {
    this.yaw += dx * 0.005;
    this.pitch = MathUtils.clamp(this.pitch + dy * 0.005, -1.2, 1.2);
  }

  /** Apply the current orientation to the camera. Call once per frame, before render. */
  update(): void {
    if (this.hasDeviceData) {
      const orient = MathUtils.degToRad(screen.orientation?.angle ?? 0);
      this.euler.set(this.beta, this.alpha, -this.gamma, 'YXZ');
      this.camera.quaternion.setFromEuler(this.euler);
      this.camera.quaternion.multiply(LookControls.Q1);
      this.camera.quaternion.multiply(this.screenQuat.setFromAxisAngle(LookControls.ZEE, -orient));
    } else {
      this.camera.rotation.set(this.pitch, this.yaw, 0);
    }
  }

  dispose(): void {
    window.removeEventListener('deviceorientation', this.handleOrientation);
  }

  private readonly handleOrientation = (event: DeviceOrientationEvent): void => {
    // Desktop browsers fire one event with null values; ignore those.
    if (event.alpha === null || event.beta === null || event.gamma === null) return;
    this.alpha = MathUtils.degToRad(event.alpha);
    this.beta = MathUtils.degToRad(event.beta);
    this.gamma = MathUtils.degToRad(event.gamma);
    this.hasDeviceData = true;
  };
}

import { CylinderGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Scene } from 'three';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';

/**
 * Weapon system: fire-rate limiting + a pooled (single-mesh) tracer effect.
 * It does not decide what was hit; CollisionManager does.
 */
export class Weapon {
  private static readonly UP = new Vector3(0, 1, 0);
  private static readonly TRACER_LIFETIME = 0.12;

  private cooldown = 0;
  private tracerAge = Infinity;
  private readonly tracerGeometry = new CylinderGeometry(0.004, 0.004, 1, 6, 1, true);
  private readonly tracerMaterial = new MeshBasicMaterial({
    color: 0x5ef2ff,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  private readonly tracer: Mesh<CylinderGeometry, MeshBasicMaterial>;
  private readonly muzzle = new Vector3();
  private readonly end = new Vector3();

  constructor(
    private readonly scene: Scene,
    private readonly bus: EventBus<GameEvents>,
    private readonly fireIntervalSeconds = 0.18,
  ) {
    this.tracerGeometry.translate(0, 0.5, 0); // base at origin, extends along +Y
    this.tracer = new Mesh(this.tracerGeometry, this.tracerMaterial);
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.scene.add(this.tracer);
  }

  /** Returns false while the weapon is cooling down. */
  tryFire(): boolean {
    if (this.cooldown > 0) return false;
    this.cooldown = this.fireIntervalSeconds;
    this.bus.emit('weapon:fired');
    return true;
  }

  showTracer(origin: Vector3, direction: Vector3, length: number): void {
    this.muzzle.copy(origin).addScaledVector(direction, 0.3);
    this.muzzle.y -= 0.08;
    this.end.copy(origin).addScaledVector(direction, length).sub(this.muzzle);
    const span = this.end.length();
    if (span < 1e-4) return;
    this.end.divideScalar(span);

    this.tracer.position.copy(this.muzzle);
    this.tracer.quaternion.setFromUnitVectors(Weapon.UP, this.end);
    this.tracer.scale.set(1, span, 1);
    this.tracer.visible = true;
    this.tracerAge = 0;
  }

  update(dt: number): void {
    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.tracerAge < Weapon.TRACER_LIFETIME) {
      this.tracerAge += dt;
      this.tracerMaterial.opacity = Math.max(1 - this.tracerAge / Weapon.TRACER_LIFETIME, 0);
      if (this.tracerAge >= Weapon.TRACER_LIFETIME) this.tracer.visible = false;
    }
  }

  reset(): void {
    this.cooldown = 0;
    this.tracerAge = Infinity;
    this.tracer.visible = false;
  }

  dispose(): void {
    this.scene.remove(this.tracer);
    this.tracerGeometry.dispose();
    this.tracerMaterial.dispose();
  }
}

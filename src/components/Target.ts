import { Mesh, Vector3 } from 'three';
import type { BufferGeometry, Material } from 'three';

/** Shared GPU resources. Owned (and disposed) by TargetManager, never by a Target. */
export interface TargetAssets {
  geometry: BufferGeometry;
  material: Material;
  hitMaterial: Material;
}

export interface TargetOptions {
  /** Slot in the spawn grid, released when the target dies. */
  cell: number;
  position: Vector3;
  approachSpeed: number;
  bobAmplitude: number;
  bobSpeed: number;
  phase: number;
  spinSpeed: number;
}

export type TargetStatus = 'active' | 'breached' | 'finished';

/**
 * Design pattern: Entity with an internal state machine (alive -> dying -> finished).
 * The entity only knows how to animate itself; spawning, scoring and removal
 * decisions belong to TargetManager.
 */
export class Target {
  static readonly BREACH_DISTANCE = 0.5;
  private static readonly DYING_DURATION = 0.25;

  readonly mesh: Mesh;
  readonly cell: number;

  private readonly home: Vector3;
  private readonly toViewer = new Vector3();
  private time = 0;
  private dying = false;
  private dyingProgress = 0;

  constructor(
    private readonly assets: TargetAssets,
    private readonly options: TargetOptions,
  ) {
    this.cell = options.cell;
    this.home = options.position.clone();
    this.mesh = new Mesh(assets.geometry, assets.material);
    this.mesh.position.copy(this.home);
    this.time = Math.random() * 10;
  }

  get isAlive(): boolean {
    return !this.dying;
  }

  kill(): void {
    if (this.dying) return;
    this.dying = true;
    this.mesh.material = this.assets.hitMaterial;
  }

  update(dt: number, viewer: Vector3): TargetStatus {
    this.time += dt;

    if (this.dying) {
      this.dyingProgress += dt / Target.DYING_DURATION;
      const p = this.dyingProgress;
      // Pop up, then shrink away.
      const scale = p < 0.3 ? 1 + (p / 0.3) * 0.5 : 1.5 * Math.max(1 - (p - 0.3) / 0.7, 0);
      this.mesh.scale.setScalar(scale);
      return p >= 1 ? 'finished' : 'active';
    }

    this.toViewer.subVectors(viewer, this.home);
    const distance = this.toViewer.length();
    if (distance <= Target.BREACH_DISTANCE) return 'breached';

    // Drift towards the player, plus a vertical bob layered on top.
    this.home.addScaledVector(this.toViewer, (this.options.approachSpeed * dt) / distance);
    const bob = Math.sin(this.time * this.options.bobSpeed + this.options.phase) * this.options.bobAmplitude;
    this.mesh.position.set(this.home.x, this.home.y + bob, this.home.z);
    this.mesh.rotation.y += this.options.spinSpeed * dt;
    this.mesh.rotation.x += this.options.spinSpeed * 0.5 * dt;
    return 'active';
  }
}

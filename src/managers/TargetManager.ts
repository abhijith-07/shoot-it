import { Group, IcosahedronGeometry, MathUtils, MeshBasicMaterial, MeshStandardMaterial, Vector3 } from 'three';
import type { Object3D, Scene } from 'three';
import { Target } from '@/components/Target';
import type { TargetAssets } from '@/components/Target';
import type { EventBus } from '@/core/EventBus';
import type { GameEvents } from '@/core/events';

// Spawn "matrix": a 3D grid of cells in spherical coordinates around the player.
const AZIMUTH_SLOTS = 8; // around the player (360°)
const ELEVATION_ROWS = 3; // below / level / above eye height
const RADIUS_RINGS = 2; // near / far
const CELL_COUNT = AZIMUTH_SLOTS * ELEVATION_ROWS * RADIUS_RINGS;
const MIN_ELEVATION_DEG = -15;
const MAX_ELEVATION_DEG = 45;
const MIN_RADIUS = 2.5;
const MAX_RADIUS = 5.5;

const TARGET_RADIUS = 0.22;
const MAX_ACTIVE = 8;
const INITIAL_TARGETS = 5;
const SPAWN_INTERVAL = 1.4;
const POINTS_PER_HIT = 100;
const BREACH_DAMAGE = 10;

/**
 * Owns every Target: spawning, animation ticks, destruction and GPU resources.
 *
 * Patterns: Object manager + Flyweight (all targets share one geometry and two
 * materials, so spawning/destroying never allocates GPU memory).
 */
export class TargetManager {
  private readonly group = new Group();
  private readonly targets = new Set<Target>();
  private readonly byObject = new WeakMap<Object3D, Target>();
  private readonly occupiedCells = new Set<number>();
  private readonly assets: TargetAssets;
  private readonly center = new Vector3();
  private hittableCache: Object3D[] = [];
  private cacheDirty = true;
  private spawning = false;
  private spawnTimer = 0;

  constructor(
    private readonly scene: Scene,
    private readonly bus: EventBus<GameEvents>,
  ) {
    this.assets = {
      geometry: new IcosahedronGeometry(TARGET_RADIUS, 1),
      material: new MeshStandardMaterial({
        color: 0xff3b5c,
        emissive: 0x66101f,
        roughness: 0.35,
        metalness: 0.2,
        flatShading: true,
      }),
      hitMaterial: new MeshBasicMaterial({ color: 0xffffff }),
    };
    this.scene.add(this.group);
  }

  /** Start a wave around `center` (the player's eye position). */
  begin(center: Vector3): void {
    this.clear();
    this.center.copy(center);
    this.spawning = true;
    this.spawnTimer = SPAWN_INTERVAL;
    for (let i = 0; i < INITIAL_TARGETS; i++) this.spawnOne();
  }

  update(dt: number, viewer: Vector3): void {
    this.center.copy(viewer);

    let alive = 0;
    for (const target of this.targets) {
      const status = target.update(dt, viewer);
      if (status === 'breached') {
        this.remove(target);
        this.bus.emit('player:damaged', { amount: BREACH_DAMAGE });
      } else if (status === 'finished') {
        this.remove(target);
      } else if (target.isAlive) {
        alive++;
      }
    }

    if (!this.spawning) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0 && alive < MAX_ACTIVE) {
      this.spawnOne();
      this.spawnTimer = SPAWN_INTERVAL;
    }
  }

  /** Meshes that can currently be shot (dying targets are excluded). */
  getHittableObjects(): Object3D[] {
    if (this.cacheDirty) {
      this.hittableCache = [];
      for (const target of this.targets) if (target.isAlive) this.hittableCache.push(target.mesh);
      this.cacheDirty = false;
    }
    return this.hittableCache;
  }

  hitObject(object: Object3D): boolean {
    const target = this.byObject.get(object);
    if (!target || !target.isAlive) return false;
    target.kill();
    this.occupiedCells.delete(target.cell);
    this.cacheDirty = true;
    this.bus.emit('target:hit', { points: POINTS_PER_HIT, position: target.mesh.position.clone() });
    return true;
  }

  /** Remove every target and stop spawning (round end / XR session end). */
  clear(): void {
    this.spawning = false;
    for (const target of [...this.targets]) this.remove(target);
    this.occupiedCells.clear();
    this.cacheDirty = true;
  }

  dispose(): void {
    this.clear();
    this.scene.remove(this.group);
    this.assets.geometry.dispose();
    this.assets.material.dispose();
    this.assets.hitMaterial.dispose();
  }

  // ---------------------------------------------------------------------------

  private spawnOne(): void {
    const cell = this.pickFreeCell();
    if (cell === null) return;

    const position = this.cellToPosition(cell, this.center, new Vector3());
    const target = new Target(this.assets, {
      cell,
      position,
      approachSpeed: MathUtils.randFloat(0.12, 0.3),
      bobAmplitude: MathUtils.randFloat(0.05, 0.15),
      bobSpeed: MathUtils.randFloat(1.2, 2.4),
      phase: Math.random() * Math.PI * 2,
      spinSpeed: MathUtils.randFloat(0.5, 1.5),
    });

    this.occupiedCells.add(cell);
    this.targets.add(target);
    this.byObject.set(target.mesh, target);
    this.group.add(target.mesh);
    this.cacheDirty = true;
  }

  private remove(target: Target): void {
    this.group.remove(target.mesh);
    this.targets.delete(target);
    this.byObject.delete(target.mesh);
    this.occupiedCells.delete(target.cell);
    this.cacheDirty = true;
  }

  private pickFreeCell(): number | null {
    const free: number[] = [];
    for (let i = 0; i < CELL_COUNT; i++) if (!this.occupiedCells.has(i)) free.push(i);
    const pick = free[Math.floor(Math.random() * free.length)];
    return pick ?? null;
  }

  /** Jittered position inside a grid cell; guarantees an even spread around the player. */
  private cellToPosition(cell: number, center: Vector3, out: Vector3): Vector3 {
    const a = cell % AZIMUTH_SLOTS;
    const e = Math.floor(cell / AZIMUTH_SLOTS) % ELEVATION_ROWS;
    const r = Math.floor(cell / (AZIMUTH_SLOTS * ELEVATION_ROWS));

    const azimuth = ((a + Math.random()) / AZIMUTH_SLOTS) * Math.PI * 2;
    const elevation = MathUtils.degToRad(
      MathUtils.lerp(MIN_ELEVATION_DEG, MAX_ELEVATION_DEG, (e + Math.random()) / ELEVATION_ROWS),
    );
    const radius = MathUtils.lerp(MIN_RADIUS, MAX_RADIUS, (r + Math.random()) / RADIUS_RINGS);
    const horizontal = radius * Math.cos(elevation);

    return out.set(
      center.x + horizontal * Math.sin(azimuth),
      center.y + radius * Math.sin(elevation),
      center.z - horizontal * Math.cos(azimuth),
    );
  }
}

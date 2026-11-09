import { Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';

export interface CastResult {
  object: Object3D;
  distance: number;
}

export interface CollisionOptions {
  maxDistance: number;
  /** Angular forgiveness (radians) so small, distant targets stay hittable on a phone. */
  aimAssistRadians: number;
}

/**
 * Hit detection. Stage 1: exact mesh raycast. Stage 2: angular aim assist
 * (closest candidate within a small cone around the ray).
 */
export class CollisionManager {
  private readonly raycaster = new Raycaster();
  private readonly worldPos = new Vector3();
  private readonly toCandidate = new Vector3();

  constructor(
    private readonly options: CollisionOptions = {
      maxDistance: 30,
      aimAssistRadians: (2.5 * Math.PI) / 180,
    },
  ) {
    this.raycaster.far = options.maxDistance;
  }

  get maxDistance(): number {
    return this.options.maxDistance;
  }

  /** `direction` must be normalised. */
  cast(origin: Vector3, direction: Vector3, candidates: Object3D[]): CastResult | null {
    if (candidates.length === 0) return null;

    this.raycaster.set(origin, direction);
    const first = this.raycaster.intersectObjects(candidates, false)[0];
    if (first) return { object: first.object, distance: first.distance };

    let best: CastResult | null = null;
    for (const object of candidates) {
      object.getWorldPosition(this.worldPos);
      this.toCandidate.subVectors(this.worldPos, origin);
      const along = this.toCandidate.dot(direction);
      if (along <= 0 || along > this.options.maxDistance) continue;
      const perpendicular = Math.sqrt(Math.max(this.toCandidate.lengthSq() - along * along, 0));
      const tolerance = along * Math.tan(this.options.aimAssistRadians);
      if (perpendicular <= tolerance && (best === null || along < best.distance)) {
        best = { object, distance: along };
      }
    }
    return best;
  }
}

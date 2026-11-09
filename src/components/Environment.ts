import {
  CanvasTexture,
  CircleGeometry,
  EquirectangularReflectionMapping,
  Fog,
  GridHelper,
  Material,
  Mesh,
  MeshBasicMaterial,
  SRGBColorSpace,
  TextureLoader,
} from 'three';
import type { Scene, Texture } from 'three';

/**
 * The game's "playground": a sky background plus a simple ground.
 *
 * Performance notes
 *  - The sky is ONE equirectangular texture used as `scene.background`
 *    (a single cheap draw call), not real 3D scenery.
 *  - By default it is generated procedurally (zero download). To use your own
 *    art, drop an equirectangular image at `public/background/sky.jpg`
 *    (2048×1024, under ~500 KB); it is loaded once and cached by the service worker.
 *  - Ground uses an unlit material, so there is no lighting cost.
 */
export class Environment {
  private readonly ground: Mesh<CircleGeometry, MeshBasicMaterial>;
  private readonly grid: GridHelper;
  private sky: Texture;
  private disposed = false;

  constructor(private readonly scene: Scene) {
    this.sky = Environment.createProceduralSky();
    this.scene.background = this.sky;
    this.scene.fog = new Fog(0x0a1424, 12, 45);

    this.ground = new Mesh(
      new CircleGeometry(60, 48),
      new MeshBasicMaterial({ color: 0x08111d }),
    );
    this.ground.rotation.x = -Math.PI / 2;

    this.grid = new GridHelper(60, 60, 0x2a8fb5, 0x143247);
    this.grid.position.y = 0.01;

    this.scene.add(this.ground, this.grid);
  }

  /** Optionally swap in a custom sky. Silently keeps the procedural one on failure. */
  async loadBackground(url: string): Promise<void> {
    try {
      const texture = await new TextureLoader().loadAsync(url);
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.mapping = EquirectangularReflectionMapping;
      texture.colorSpace = SRGBColorSpace;
      const previous = this.sky;
      this.sky = texture;
      this.scene.background = texture;
      previous.dispose();
    } catch {
      /* no custom background provided: keep the procedural sky */
    }
  }

  dispose(): void {
    this.disposed = true;
    this.scene.remove(this.ground, this.grid);
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.grid.geometry.dispose();
    const materials = this.grid.material;
    for (const material of Array.isArray(materials) ? materials : [materials]) {
      (material as Material).dispose();
    }
    this.sky.dispose();
    this.scene.background = null;
    this.scene.fog = null;
  }

  private static createProceduralSky(): CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // Zenith (top) -> horizon (middle) -> nadir (bottom).
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, '#01020a');
      gradient.addColorStop(0.35, '#0a1a3d');
      gradient.addColorStop(0.48, '#5b3a8a');
      gradient.addColorStop(0.5, '#ff8a5c');
      gradient.addColorStop(0.52, '#2a1a3a');
      gradient.addColorStop(1, '#05070d');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      for (let i = 0; i < 600; i++) {
        const x = Math.random() * width;
        const y = Math.random() * height * 0.46;
        ctx.globalAlpha = 0.3 + Math.random() * 0.7;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, Math.random() < 0.15 ? 2 : 1, Math.random() < 0.15 ? 2 : 1);
      }
      ctx.globalAlpha = 1;
    }

    const texture = new CanvasTexture(canvas);
    texture.mapping = EquirectangularReflectionMapping;
    texture.colorSpace = SRGBColorSpace;
    return texture;
  }
}

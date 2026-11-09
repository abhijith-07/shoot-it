import { Clock, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, Vector3, WebGLRenderer } from 'three';
import { Environment } from '@/components/Environment';
import { Weapon } from '@/components/Weapon';
import { Disposables } from '@/core/Disposables';
import { EventBus } from '@/core/EventBus';
import type { FirePayload, GameEvents } from '@/core/events';
import { LookControls } from '@/core/LookControls';
import { AudioManager } from '@/managers/AudioManager';
import { CollisionManager } from '@/managers/CollisionManager';
import { InputManager } from '@/managers/InputManager';
import { StateManager } from '@/managers/StateManager';
import { TargetManager } from '@/managers/TargetManager';
import { HUD } from '@/ui/HUD';
import { StartScreen } from '@/ui/StartScreen';

export interface GameEngineOptions {
  canvasHost: HTMLElement;
  uiRoot: HTMLElement;
}

const EYE_HEIGHT = 1.6;
/** Clamp huge frame gaps (tab switch, hiccup) so animation never "teleports". */
const MAX_DELTA_SECONDS = 0.1;
/** Optional custom equirectangular sky (public/background/sky.jpg). */
const BACKGROUND_URL = '/background/sky.jpg';

/**
 * Composition root + main loop.
 *
 * Patterns:
 *  - Composition root: the only place concrete systems are constructed and wired.
 *  - Mediator (EventBus): systems communicate through typed events.
 *  - Game loop: `renderer.setAnimationLoop` (requestAnimationFrame under the hood).
 *
 * The player stands still at the centre of a virtual arena and looks around with
 * the phone's gyroscope; no camera or XR session is involved.
 */
export class GameEngine {
  private readonly bus = new EventBus<GameEvents>();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(70, 1, 0.05, 100);
  private readonly clock = new Clock();
  private readonly renderer: WebGLRenderer;

  private readonly state: StateManager;
  private readonly audio: AudioManager;
  private readonly look: LookControls;
  private readonly input: InputManager;
  private readonly environment: Environment;
  private readonly collision = new CollisionManager();
  private readonly targets: TargetManager;
  private readonly weapon: Weapon;
  private readonly hud: HUD;
  private readonly screen: StartScreen;

  private readonly disposables = new Disposables();
  private readonly viewerPosition = new Vector3(0, EYE_HEIGHT, 0);
  private hintTimer: number | undefined;
  private starting = false;
  private disposed = false;

  constructor(options: GameEngineOptions) {
    // Performance: no MSAA, capped pixel ratio (phones have 3x screens).
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    options.canvasHost.appendChild(this.renderer.domElement);

    this.camera.position.copy(this.viewerPosition);
    const sun = new DirectionalLight(0xffffff, 1.6);
    sun.position.set(1, 3, 2);
    this.scene.add(new HemisphereLight(0xffffff, 0x445566, 1.2), sun);

    // --- Systems ---------------------------------------------------------------
    this.environment = new Environment(this.scene);
    this.state = new StateManager(this.bus);
    this.audio = new AudioManager(this.bus);
    this.look = new LookControls(this.camera);
    this.input = new InputManager(this.bus, this.renderer.domElement, this.camera, this.look);
    this.targets = new TargetManager(this.scene, this.bus);
    this.weapon = new Weapon(this.scene, this.bus);
    this.hud = new HUD(options.uiRoot, this.bus);
    this.screen = new StartScreen(options.uiRoot, this.bus);

    // --- Wiring ----------------------------------------------------------------
    const { bus } = this;
    this.disposables.add(bus.on('ui:start', () => void this.startGame()));
    this.disposables.add(bus.on('ui:exit', () => this.endRound()));
    this.disposables.add(bus.on('input:fire', this.handleFire));
    this.disposables.add(bus.on('game:over', () => this.targets.clear()));

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('orientationchange', this.handleResize);
    this.handleResize();
  }

  async init(): Promise<void> {
    this.renderer.setAnimationLoop(this.onFrame);
    this.state.setPhase('menu');
    await this.environment.loadBackground(BACKGROUND_URL);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    window.clearTimeout(this.hintTimer);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('orientationchange', this.handleResize);
    this.renderer.setAnimationLoop(null);
    this.disposables.disposeAll();

    this.input.dispose();
    this.look.dispose();
    this.targets.dispose();
    this.weapon.dispose();
    this.environment.dispose();
    this.hud.dispose();
    this.screen.dispose();
    this.audio.dispose();
    this.state.dispose();
    this.bus.clear();

    this.scene.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  // ---------------------------------------------------------------------------
  // Round lifecycle
  // ---------------------------------------------------------------------------

  private async startGame(): Promise<void> {
    if (this.starting) return;
    this.starting = true;
    // All of these must begin synchronously inside the tap (browser gesture rules).
    this.requestFullscreen();
    this.screen.setBusy('Starting…');
    try {
      await Promise.all([this.look.enable(), this.audio.unlock()]);
      this.renderer.setAnimationLoop(this.onFrame); // idempotent; restarts after a render error
      this.beginRound();
    } catch (error) {
      console.error('[GameEngine] Failed to start', error);
      this.screen.showError(error instanceof Error ? error.message : 'Failed to start the game.');
    } finally {
      this.starting = false;
    }
  }

  private beginRound(): void {
    this.targets.clear();
    this.weapon.reset();
    this.state.reset(); // phase -> 'playing'
    this.targets.begin(this.viewerPosition);

    // Once the sensor has had a moment to report, tell the player how to look around.
    window.clearTimeout(this.hintTimer);
    this.hintTimer = window.setTimeout(() => {
      this.hud.showHint(
        this.look.usingGyro
          ? 'Move your phone to look around · tap to fire'
          : 'Drag to look around · tap to fire',
      );
    }, 700);
  }

  private endRound(): void {
    window.clearTimeout(this.hintTimer);
    this.targets.clear();
    this.weapon.reset();
    this.state.setPhase('menu');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }

  private requestFullscreen(): void {
    const root = document.documentElement;
    if (document.fullscreenElement || typeof root.requestFullscreen !== 'function') return;
    root.requestFullscreen({ navigationUI: 'hide' }).catch(() => undefined);
  }

  // ---------------------------------------------------------------------------
  // Frame loop
  // ---------------------------------------------------------------------------

  private readonly onFrame = (): void => {
    try {
      const dt = Math.min(this.clock.getDelta(), MAX_DELTA_SECONDS);
      this.look.update();
      this.weapon.update(dt);
      if (this.state.phase === 'playing') this.targets.update(dt, this.viewerPosition);
      this.renderer.render(this.scene, this.camera);
    } catch (error) {
      // Never let an exception spam every frame: stop the loop and return to the menu.
      console.error('[GameEngine] Frame error', error);
      this.renderer.setAnimationLoop(null);
      this.endRound();
      this.screen.showError('A rendering error occurred. Please try again.');
    }
  };

  private readonly handleFire = ({ origin, direction }: FirePayload): void => {
    if (this.state.phase !== 'playing' || !this.weapon.tryFire()) return;
    const hit = this.collision.cast(origin, direction, this.targets.getHittableObjects());
    if (hit) this.targets.hitObject(hit.object);
    this.weapon.showTracer(origin, direction, hit ? hit.distance : this.collision.maxDistance);
  };

  private readonly handleResize = (): void => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };
}

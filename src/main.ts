import './styles.css';
import { GameEngine } from '@/core/GameEngine';

/**
 * Bootstrap. Intentionally tiny: all wiring lives in GameEngine (the composition root).
 */
function bootstrap(): void {
  const canvasHost = document.getElementById('app');
  const uiRoot = document.getElementById('ui-root');
  if (!canvasHost || !uiRoot) {
    throw new Error('Missing #app or #ui-root in index.html');
  }

  const engine = new GameEngine({ canvasHost, uiRoot });

  engine.init().catch((error: unknown) => {
    console.error('[main] Engine failed to initialise', error);
    const message = document.getElementById('screen-message');
    if (message) message.textContent = 'Failed to initialise the game. Please reload.';
  });

  // Release GPU/DOM resources on navigation and during Vite HMR.
  window.addEventListener('pagehide', () => engine.dispose(), { once: true });
  if (import.meta.hot) {
    import.meta.hot.dispose(() => engine.dispose());
  }

  // Offline / instant-load support: cache the game on the device (production only).
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
        console.warn('[main] Service worker registration failed', error);
      });
    });
  }
}

bootstrap();

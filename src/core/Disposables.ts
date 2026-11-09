/**
 * Design pattern: Disposable collection (a poor man's `DisposableStack`).
 *
 * Every subscription / listener / resource registers a teardown function here,
 * and the owner releases them all in one call, in reverse order of registration.
 * One failing disposer never prevents the others from running.
 */
export type Disposer = () => void;

export class Disposables {
  private disposers: Disposer[] = [];

  add(disposer: Disposer): void {
    this.disposers.push(disposer);
  }

  disposeAll(): void {
    const pending = this.disposers;
    this.disposers = [];
    for (let i = pending.length - 1; i >= 0; i--) {
      try {
        pending[i]?.();
      } catch (error) {
        console.error('[Disposables] disposer threw', error);
      }
    }
  }
}

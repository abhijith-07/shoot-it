/**
 * Design pattern: typed Publish/Subscribe (Mediator).
 *
 * Systems (input, targets, state, audio, UI) never import each other for
 * cross-cutting reactions; they publish/subscribe on this bus instead. The
 * generic map `E` gives compile-time checking of event names *and* payloads.
 */
export type Handler<T> = (payload: T) => void;

export class EventBus<E extends object> {
  private readonly handlers = new Map<keyof E, Set<Handler<unknown>>>();

  /** Subscribe. Returns an unsubscribe function (feed it to `Disposables`). */
  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<unknown>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<unknown>);
  }

  emit<K extends keyof E>(type: K, ...args: E[K] extends undefined ? [] : [payload: E[K]]): void {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return;
    const payload = (args as unknown[])[0];
    // Copy so handlers may unsubscribe while we iterate; isolate failures per handler.
    for (const handler of [...set]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[EventBus] handler for "${String(type)}" threw`, error);
      }
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

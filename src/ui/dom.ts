/** Small typed DOM helpers shared by the UI modules. */

export function requireElement<T extends HTMLElement = HTMLElement>(root: ParentNode, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`Required element not found: ${selector}`);
  return el;
}

/** addEventListener that returns its own teardown function. */
export function listen<K extends keyof HTMLElementEventMap>(
  el: HTMLElement,
  type: K,
  handler: (event: HTMLElementEventMap[K]) => void,
): () => void {
  el.addEventListener(type, handler);
  return () => el.removeEventListener(type, handler);
}

/** Re-trigger a one-shot CSS animation class. */
export function pulse(el: HTMLElement, className: string): void {
  el.classList.remove(className);
  void el.offsetWidth; // force reflow so the animation restarts
  el.classList.add(className);
}

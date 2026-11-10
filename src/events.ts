/**
 * Tiny typed pub/sub. Deliberately not Node's `events`, so the browser bundle needs no polyfill.
 */
export class MonitorEmitter<Events extends object> {
  private readonly handlers = new Map<keyof Events, Set<(payload: Events[keyof Events]) => void>>();

  /**
   * Subscribe to one event.
   * @param {keyof Events} event Event id.
   * @param {Function} handler Called with the payload.
   * @returns {void}
   */
  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
    const set = this.handlers.get(event) ?? new Set();
    set.add(handler as (payload: Events[keyof Events]) => void);
    this.handlers.set(event, set);
  }

  /**
   * Remove a subscription. The handler must be the same function that was passed to {@link on}.
   * @param {keyof Events} event Event id.
   * @param {Function} handler Handler to remove.
   * @returns {void}
   */
  off<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
    this.handlers.get(event)?.delete(handler as (payload: Events[keyof Events]) => void);
  }

  /**
   * Subscribe to the next occurrence only.
   * @param {keyof Events} event Event id.
   * @param {Function} handler Called once with the payload.
   * @returns {void}
   */
  once<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): void {
    const wrapped = (payload: Events[K]) => {
      this.off(event, wrapped);
      handler(payload);
    };
    this.on(event, wrapped);
  }

  /**
   * Call every subscriber. Exceptions from one handler do not stop the others.
   * @param {keyof Events} event Event id.
   * @param {Events[K]} payload Event payload.
   * @returns {void}
   */
  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event);
    if (!set) {
      return;
    }
    for (const handler of [...set]) {
      handler(payload);
    }
  }
}

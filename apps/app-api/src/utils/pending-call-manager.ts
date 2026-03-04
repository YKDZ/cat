/**
 * PendingCallManager coordinates async request/response pairs between
 * the streaming agent loop and incoming WebSocket callback routes.
 *
 * The agent loop registers a pending call (returns a Promise), and
 * a separate WS route resolves it later with the client's response.
 */

type PendingCall<T> = {
  resolve: (value: T) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const DEFAULT_TIMEOUT_MS = 120_000; // 2 minutes

export class PendingCallManager<T> {
  private readonly pending = new Map<string, PendingCall<T>>();
  private readonly timeoutMs: number;

  constructor(timeoutMs = DEFAULT_TIMEOUT_MS) {
    this.timeoutMs = timeoutMs;
  }

  /**
   * Register a pending call and return a promise that resolves when
   * `resolve()` is called with the matching callId.
   */
  wait = async (callId: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(callId);
        reject(new Error(`Pending call "${callId}" timed out`));
      }, this.timeoutMs);

      this.pending.set(callId, { resolve, reject, timer });
    });

  /**
   * Resolve a pending call with a value. Returns `true` if the call
   * existed and was resolved, `false` if it was already resolved or timed out.
   */
  resolve = (callId: string, value: T): boolean => {
    const entry = this.pending.get(callId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(callId);
    entry.resolve(value);
    return true;
  };

  /**
   * Reject a pending call with an error. Returns `true` if the call existed.
   */
  reject = (callId: string, reason: Error): boolean => {
    const entry = this.pending.get(callId);
    if (!entry) return false;
    clearTimeout(entry.timer);
    this.pending.delete(callId);
    entry.reject(reason);
    return true;
  };

  /** Cancel all pending calls (e.g. on session abort). */
  clear = (): void => {
    for (const [_, entry] of this.pending) {
      clearTimeout(entry.timer);
      entry.reject(new Error("PendingCallManager cleared"));
    }
    this.pending.clear();
  };

  /** Number of currently pending calls. */
  get size(): number {
    return this.pending.size;
  }
}

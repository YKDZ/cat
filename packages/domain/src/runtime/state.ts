import type { RuntimeState } from "./types.ts";

declare global {
  // oxlint-disable-next-line no-var
  var __CAT_RUNTIME_STATE__: RuntimeState | undefined;
}

/**
 * Initialize the process-wide CAT runtime state.
 *
 * @param state - Runtime state snapshot to store
 * @returns - No return value
 */
export const initRuntimeState = (state: RuntimeState): void => {
  globalThis.__CAT_RUNTIME_STATE__ = state;
};

/**
 * Get the current CAT runtime state from the process.
 *
 * @returns - Current runtime state, or `undefined` when not initialized
 */
export const getRuntimeState = (): RuntimeState | undefined =>
  globalThis.__CAT_RUNTIME_STATE__;

/**
 * Get the current runtime state, or throw when it has not been initialized.
 *
 * @returns - Current runtime state
 */
export const requireRuntimeState = (): RuntimeState => {
  const state = getRuntimeState();
  if (!state) {
    throw new Error("CAT runtime state has not been initialized");
  }

  return state;
};

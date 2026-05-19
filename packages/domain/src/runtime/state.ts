import type { RuntimeState } from "./types.ts";

declare global {
  // oxlint-disable-next-line no-var
  var __CAT_RUNTIME_STATE__: RuntimeState | undefined;
}

/**
 * @zh 初始化进程级 CAT 运行时状态。
 * @en Initialize the process-wide CAT runtime state.
 *
 * @param state - {@zh 要写入的运行时状态快照} {@en Runtime state snapshot to store}
 * @returns - {@zh 无返回值} {@en No return value}
 */
export const initRuntimeState = (state: RuntimeState): void => {
  globalThis.__CAT_RUNTIME_STATE__ = state;
};

/**
 * @zh 读取当前进程中的 CAT 运行时状态。
 * @en Get the current CAT runtime state from the process.
 *
 * @returns - {@zh 当前运行时状态；若尚未初始化则为 `undefined`} {@en Current runtime state, or `undefined` when not initialized}
 */
export const getRuntimeState = (): RuntimeState | undefined =>
  globalThis.__CAT_RUNTIME_STATE__;

/**
 * @zh 获取当前运行时状态；若尚未初始化则抛错。
 * @en Get the current runtime state, or throw when it has not been initialized.
 *
 * @returns - {@zh 当前运行时状态} {@en Current runtime state}
 */
export const requireRuntimeState = (): RuntimeState => {
  const state = getRuntimeState();
  if (!state) {
    throw new Error("CAT runtime state has not been initialized");
  }

  return state;
};

import type { MaybeRefOrGetter } from "vue";

import { useMagicKeys, whenever } from "@vueuse/core";
import { toValue } from "vue";

/**
 * @zh 注册快捷键，并可根据 enabled 谓词动态禁用。
 * @en Register a hotkey and optionally disable it with an enabled predicate.
 *
 * @param key - {@zh 快捷键表达式} {@en Hotkey expression}
 * @param callback - {@zh 触发时执行的回调} {@en Callback invoked when triggered}
 * @param options - {@zh 快捷键选项} {@en Hotkey options}
 * @returns - {@zh 当找不到快捷键映射时返回 undefined} {@en Undefined when no key mapping exists}
 */
export const useHotKeys = (
  key: string,
  callback: () => unknown,
  options: { enabled?: MaybeRefOrGetter<boolean> } = {},
): undefined | void => {
  const keys = useMagicKeys();
  const _key = keys[key];
  if (!_key) return;
  whenever(_key, () => {
    if (options.enabled !== undefined && !toValue(options.enabled)) return;
    callback();
  });
};

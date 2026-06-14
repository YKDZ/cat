import type { MaybeRefOrGetter } from "vue";

import { useMagicKeys, whenever } from "@vueuse/core";
import { toValue } from "vue";

/**
 * Register a hotkey and optionally disable it with an enabled predicate.
 *
 * @param key - Hotkey expression
 * @param callback - Callback invoked when triggered
 * @param options - Hotkey options
 * @returns - Undefined when no key mapping exists
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

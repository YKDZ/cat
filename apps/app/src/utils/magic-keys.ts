import { useMagicKeys, whenever } from "@vueuse/core";

export const useHotKeys = (
  key: string,
  callback: () => unknown,
): undefined | void => {
  const keys = useMagicKeys();
  const _key = keys[key];
  if (!_key) return;
  whenever(_key, callback);
};

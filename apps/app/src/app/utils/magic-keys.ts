import { useMagicKeys, whenever } from "@vueuse/core";

export const useHotKeys = (key: string, callback: () => unknown) => {
  const keys = useMagicKeys();
  whenever(keys[key], callback);
};

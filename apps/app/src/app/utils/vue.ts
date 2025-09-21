import { type Ref, watch } from "vue";
import { watchThrottled, type WatchThrottledOptions } from "@vueuse/core";

import type {
  MultiWatchSources,
  WatchSource,
  WatchCallback,
  WatchOptions,
} from "vue";

export const syncRefWith = <T>(ref: Ref<T>, getter: () => T) => {
  return watch(
    getter,
    (value) => {
      ref.value = value;
    },
    { immediate: true },
  );
};

export function watchClient<T>(
  source: WatchSource<T>,
  cb: WatchCallback<T>,
  options?: WatchOptions,
): ReturnType<typeof watch>;

export function watchClient<T extends Readonly<MultiWatchSources>>(
  sources: [...T],
  cb: WatchCallback<T>,
  options?: WatchOptions,
): ReturnType<typeof watch>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function watchClient(source: any, cb: any, options?: WatchOptions) {
  if (import.meta.env.SSR) return;
  return watch(source, cb, options);
}

export function watchClientThrottled(
  source: WatchSource,
  cb: WatchCallback,
  options?: WatchThrottledOptions<boolean>,
) {
  if (import.meta.env.SSR) return;
  return watchThrottled(source, cb, options);
}

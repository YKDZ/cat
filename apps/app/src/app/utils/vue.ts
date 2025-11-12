import { type Ref, watch, type ComputedRef, ref, computed } from "vue";
import {
  watchThrottled,
  type WatchThrottledOptions,
  computedAsync,
  type AsyncComputedOnCancel,
  type AsyncComputedOptions,
} from "@vueuse/core";
import type {
  MultiWatchSources,
  WatchSource,
  WatchCallback,
  WatchOptions,
  WatchStopHandle,
  WatchHandle,
} from "vue";

export const syncRefWith = <T>(ref: Ref<T>, getter: () => T): WatchHandle => {
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

export function watchClient(
  source: WatchSource<unknown> | MultiWatchSources,
  cb: WatchCallback<unknown>,
  options?: WatchOptions,
): WatchHandle | undefined {
  if (import.meta.env.SSR) return;
  return watch(source, cb, options);
}

export function watchClientThrottled(
  source: WatchSource,
  cb: WatchCallback,
  options?: WatchThrottledOptions<boolean>,
): WatchStopHandle | undefined {
  if (import.meta.env.SSR) return;
  return watchThrottled(source, cb, options);
}

// Overloads for computedAsyncClient matching computedAsync signatures
export function computedAsyncClient<T>(
  evaluationCallback: (onCancel: AsyncComputedOnCancel) => T | Promise<T>,
  initialState: T,
  optionsOrRef: AsyncComputedOptions<true>,
): ComputedRef<T>;

export function computedAsyncClient<T>(
  evaluationCallback: (onCancel: AsyncComputedOnCancel) => T | Promise<T>,
  initialState: undefined,
  optionsOrRef: AsyncComputedOptions<true>,
): ComputedRef<T | undefined>;

export function computedAsyncClient<T>(
  evaluationCallback: (onCancel: AsyncComputedOnCancel) => T | Promise<T>,
  initialState: T,
  optionsOrRef?: Ref<boolean> | AsyncComputedOptions,
): Ref<T>;

export function computedAsyncClient<T>(
  evaluationCallback: (onCancel: AsyncComputedOnCancel) => T | Promise<T>,
  initialState?: undefined,
  optionsOrRef?: Ref<boolean> | AsyncComputedOptions,
): Ref<T | undefined>;

// Implementation
export function computedAsyncClient<T>(
  evaluationCallback: (onCancel: AsyncComputedOnCancel) => T | Promise<T>,
  initialState?: T,
  optionsOrRef?: Ref<boolean> | AsyncComputedOptions,
): Ref<T | undefined> | ComputedRef<T | undefined> | Ref<T> | ComputedRef<T> {
  // In SSR environment, return a computed/ref with the initial state
  if (import.meta.env.SSR) {
    // Check if options indicate we should return a ComputedRef (lazy mode)
    const isLazy =
      optionsOrRef &&
      typeof optionsOrRef === "object" &&
      "lazy" in optionsOrRef &&
      optionsOrRef.lazy === true;

    if (isLazy) {
      // oxlint-disable-next-line no-unsafe-type-assertion no-unsafe-return no-explicit-any
      return computed(() => initialState) as any;
    }
    // oxlint-disable-next-line no-unsafe-type-assertion no-unsafe-return no-explicit-any
    return ref(initialState) as any;
  }

  // In client environment, execute the original computedAsync
  // Use type assertion to handle the complex overload matching
  // oxlint-disable-next-line no-unsafe-return
  return computedAsync(
    evaluationCallback,
    // oxlint-disable-next-line no-explicit-any no-unsafe-type-assertion
    initialState as any,
    // oxlint-disable-next-line no-unsafe-argument no-explicit-any no-unsafe-type-assertion
    optionsOrRef as any,
  );
}

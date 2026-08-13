import { watchThrottled, type WatchThrottledOptions } from "@vueuse/core";
import type {
  MultiWatchSources,
  WatchSource,
  WatchCallback,
  WatchOptions,
  WatchStopHandle,
  WatchHandle,
} from "vue";
import { onBeforeUnmount, type Ref, watch } from "vue";

export type OwnedRequestResult<T> =
  | Readonly<{ status: "success"; value: T }>
  | Readonly<{ error: unknown; status: "failure" }>
  | Readonly<{ status: "released" }>;

export const useRequestOwnership = (): Readonly<{
  onResume: (callback: () => void) => void;
  run: <T>(request: () => Promise<T>) => Promise<OwnedRequestResult<T>>;
}> => {
  let active = true;
  let revision = 0;
  const resumeCallbacks = new Set<() => void>();

  const release = (): void => {
    active = false;
    revision += 1;
  };
  const resume = (): void => {
    if (active) return;
    active = true;
    revision += 1;
    for (const callback of resumeCallbacks) callback();
  };

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", release, { capture: true });
    window.addEventListener("pageshow", resume, { capture: true });
  }

  onBeforeUnmount(() => {
    release();
    resumeCallbacks.clear();
    if (typeof window === "undefined") return;
    window.removeEventListener("pagehide", release, { capture: true });
    window.removeEventListener("pageshow", resume, { capture: true });
  });

  return {
    onResume: (callback): void => {
      resumeCallbacks.add(callback);
    },
    run: async <T>(
      request: () => Promise<T>,
    ): Promise<OwnedRequestResult<T>> => {
      const requestRevision = ++revision;
      try {
        const value = await request();
        return active && requestRevision === revision
          ? { status: "success", value }
          : { status: "released" };
      } catch (error) {
        return active && requestRevision === revision
          ? { error, status: "failure" }
          : { status: "released" };
      }
    },
  };
};

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

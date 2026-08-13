export type TrackedRequest = {
  cancel: () => void;
  signal: AbortSignal;
};

export const createTrackedRequest = (): TrackedRequest => {
  const controller = new AbortController();
  let cancelled = false;

  return {
    signal: controller.signal,
    cancel: () => {
      if (cancelled || controller.signal.aborted) return;
      cancelled = true;
      controller.abort();
    },
  };
};

export const cancelRequest = (
  controller: AbortController | null | undefined,
  _url: string,
): void => {
  if (!controller || controller.signal.aborted) return;
  controller.abort();
};

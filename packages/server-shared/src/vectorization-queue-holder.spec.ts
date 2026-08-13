import { beforeEach, describe, expect, it, vi } from "vitest";

const loadHolder = async () => await import("./vectorization-queue-holder.ts");

describe("installVectorizationQueue", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("restores the previous queue exactly once", async () => {
    const {
      getVectorizationQueue,
      installVectorizationQueue,
      setVectorizationQueue,
    } = await loadHolder();
    const previous = {};
    const installed = {};
    setVectorizationQueue(previous as never);

    const restore = installVectorizationQueue(installed as never);
    expect(getVectorizationQueue()).toBe(installed);

    restore();
    restore();
    expect(getVectorizationQueue()).toBe(previous);
  });

  it("does not replace a queue installed by another owner", async () => {
    const {
      getVectorizationQueue,
      installVectorizationQueue,
      setVectorizationQueue,
    } = await loadHolder();
    const installed = {};
    const replacement = {};
    const restore = installVectorizationQueue(installed as never);

    setVectorizationQueue(replacement as never);
    restore();

    expect(getVectorizationQueue()).toBe(replacement);
  });
});

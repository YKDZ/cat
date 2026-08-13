import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: mocks.executeCommand,
}));

vi.mock("@cat/server-shared", () => ({
  resolvePluginManager: vi.fn(() => ({})),
  selectFirstServiceImplementation: vi.fn(),
}));

import {
  resolvePluginManager,
  selectFirstServiceImplementation,
} from "@cat/server-shared";
import { RequiredVectorDimension } from "@cat/shared";

import { EvalInterruptedError } from "../cancellation.ts";
import { EvalVectorizationError, vectorizeWithCache } from "./seeder.ts";

describe("vectorizeWithCache", () => {
  const configuredOverride = {
    plugin: "openai-vectorizer",
    scope: "GLOBAL" as const,
    config: { "model-id": "qwen3-embedding:4b" },
  };
  const createCache = () => ({
    close: vi.fn(),
    get: vi.fn(),
    set: vi.fn(),
    invalidateModel: vi.fn(),
  });
  const createOptions = (
    cache: ReturnType<typeof createCache>,
    execute = vi.fn().mockResolvedValue({
      rows: [{ id: 1, value: "term", language_id: "en" }],
    }),
  ) => ({
    execCtx: {
      db: {
        execute,
      },
    } as never,
    pluginManager: {} as never,
    cache: cache as never,
    vectorizerOverride: configuredOverride,
    mode: "required" as const,
  });
  const requiredVector = (): number[] =>
    Array.from({ length: RequiredVectorDimension }, () => 0);

  beforeEach(() => {
    mocks.executeCommand.mockReset();
    vi.mocked(resolvePluginManager).mockReturnValue({} as never);
    vi.mocked(selectFirstServiceImplementation).mockReset();
  });

  it("preserves its typed cause when configured vectorization fails", async () => {
    const cause = new Error("connection refused");
    const vectorize = vi.fn().mockRejectedValue(cause);
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({
        reference: {
          pluginId: "openai-vectorizer",
          serviceId: "openai-vectorizer",
          serviceType: "TEXT_VECTORIZER",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        service: { vectorize },
      } as never)
      .mockReturnValueOnce({
        reference: {
          pluginId: "system-pgvector-storage",
          serviceId: "native-pgvector",
          serviceType: "VECTOR_STORAGE",
          scopeType: "GLOBAL",
          scopeId: "",
        },
        service: {},
      } as never);

    const cache = createCache();
    const operation = vectorizeWithCache(createOptions(cache));

    await expect(operation).rejects.toMatchObject({
      name: "EvalVectorizationError",
      code: "VECTORIZATION_FAILED",
      cause,
    } satisfies Partial<EvalVectorizationError>);
    expect(vectorize).toHaveBeenCalledTimes(1);
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("passes interruption into a blocked vectorizer and closes the cache", async () => {
    const cache = createCache();
    const controller = new AbortController();
    const interrupted = new EvalInterruptedError();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const vectorize = vi.fn(({ signal }: { signal?: AbortSignal }) => {
      markStarted?.();
      return new Promise<never>((_, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
      .mockReturnValueOnce({ reference: {}, service: {} } as never);

    const operation = vectorizeWithCache({
      ...createOptions(cache),
      signal: controller.signal,
    });
    await started;
    controller.abort(interrupted);

    await expect(operation).rejects.toBe(interrupted);
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("closes the cache when querying pending vectors fails", async () => {
    const cache = createCache();
    const queryError = new Error("database unavailable");
    const options = createOptions(cache, vi.fn().mockRejectedValue(queryError));
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: {} } as never)
      .mockReturnValueOnce({ reference: {}, service: {} } as never);

    await expect(vectorizeWithCache(options)).rejects.toBe(queryError);
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("closes the cache when configured services are missing", async () => {
    const cache = createCache();
    await expect(
      vectorizeWithCache(createOptions(cache)),
    ).rejects.toMatchObject({ code: "CONFIGURED_SERVICE_UNAVAILABLE" });
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("returns an explicit skip result when suite policy disables vectorization", async () => {
    const cache = createCache();
    await expect(
      vectorizeWithCache({
        ...createOptions(cache),
        vectorizerOverride: undefined,
        mode: "skip",
      }),
    ).resolves.toEqual({ status: "SKIPPED", reason: "EXPLICIT_SUITE_POLICY" });
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("rejects malformed vector dimensions and invalidates only that model cache", async () => {
    const cache = createCache();
    const vectorize = vi.fn().mockResolvedValue([{ vector: [1], meta: null }]);
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
      .mockReturnValueOnce({ reference: {}, service: {} } as never);

    await expect(
      vectorizeWithCache(createOptions(cache)),
    ).rejects.toMatchObject({
      code: "VECTOR_DIMENSION_MISMATCH",
    });
    expect(cache.invalidateModel).toHaveBeenCalledWith("qwen3-embedding:4b");
    expect(cache.set).not.toHaveBeenCalled();
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("rejects cached vectors with a malformed dimension without calling the service", async () => {
    const cache = createCache();
    const vectorize = vi.fn();
    cache.get.mockReturnValue([[{ vector: [1], meta: null }]]);
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
      .mockReturnValueOnce({ reference: {}, service: {} } as never);

    await expect(
      vectorizeWithCache(createOptions(cache)),
    ).rejects.toMatchObject({
      code: "VECTOR_DIMENSION_MISMATCH",
    });
    expect(vectorize).not.toHaveBeenCalled();
    expect(cache.invalidateModel).toHaveBeenCalledWith("qwen3-embedding:4b");
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it("preserves storage failures and closes the cache", async () => {
    const cache = createCache();
    const cause = new Error("storage unavailable");
    const vectorize = vi
      .fn()
      .mockResolvedValue([{ vector: requiredVector(), meta: null }]);
    const store = vi.fn().mockRejectedValue(cause);
    mocks.executeCommand.mockResolvedValue({
      chunkSetIds: ["chunk-set"],
      chunkIds: ["chunk"],
    });
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
      .mockReturnValueOnce({ reference: {}, service: { store } } as never);

    await expect(
      vectorizeWithCache(createOptions(cache)),
    ).rejects.toMatchObject({
      code: "VECTOR_STORAGE_FAILED",
      cause,
    } satisfies Partial<EvalVectorizationError>);
    expect(cache.close).toHaveBeenCalledOnce();
  });

  it.each([
    "text-embedding-3-small",
    "text-embedding-3-large",
    "text-embedding-ada-002",
  ])(
    "accepts fixed-dimension output from configured model %s",
    async (modelId) => {
      const cache = createCache();
      const chunks = [{ vector: requiredVector(), meta: null }];
      const vectorize = vi.fn().mockResolvedValue(chunks);
      const store = vi.fn().mockResolvedValue(undefined);
      mocks.executeCommand
        .mockResolvedValueOnce({
          chunkSetIds: ["chunk-set"],
          chunkIds: ["chunk"],
        })
        .mockResolvedValueOnce(undefined);
      vi.mocked(selectFirstServiceImplementation)
        .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
        .mockReturnValueOnce({ reference: {}, service: { store } } as never);

      await expect(
        vectorizeWithCache({
          ...createOptions(cache),
          vectorizerOverride: {
            ...configuredOverride,
            config: { "model-id": modelId },
          },
        }),
      ).resolves.toEqual({ status: "VECTORIZED" });
      expect(vectorize).toHaveBeenCalledOnce();
      expect(store).toHaveBeenCalledOnce();
      expect(cache.set).toHaveBeenCalledWith(modelId, "term", "en", [chunks]);
      expect(cache.close).toHaveBeenCalledOnce();
    },
  );
});

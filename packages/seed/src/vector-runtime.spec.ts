import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RequiredVectorDimension } from "@cat/shared";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: mocks.executeCommand,
}));

vi.mock("@cat/server-shared", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/server-shared")>()),
  resolvePluginManager: vi.fn(() => ({})),
  selectFirstServiceImplementation: vi.fn(),
}));

import {
  resolvePluginManager,
  selectFirstServiceImplementation,
} from "@cat/server-shared";

import { vectorizeWithCache } from "#/pipeline.ts";
import { VectorCache } from "#/vector-cache.ts";

const temporaryDirectories: string[] = [];

afterEach(() => {
  mocks.executeCommand.mockReset();
  vi.mocked(resolvePluginManager).mockReturnValue({} as never);
  vi.mocked(selectFirstServiceImplementation).mockReset();
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("fixed vector runtime contract", () => {
  it("persists and reads only cache entries for the required dimension", () => {
    const cacheDir = mkdtempSync(join(tmpdir(), "cat-vector-cache-"));
    temporaryDirectories.push(cacheDir);
    const modelId = "text-embedding-3-small";
    const chunks = [
      [
        {
          meta: null,
          vector: Array.from({ length: RequiredVectorDimension }, () => 0),
        },
      ],
    ];
    const cache = new VectorCache(cacheDir);

    cache.set(modelId, "term", "en", chunks);
    cache.close();

    const database = new Database(join(cacheDir, `${modelId}.sqlite`));
    const row = database.prepare("SELECT dimension FROM embeddings").get() as {
      dimension: number;
    };
    expect(row.dimension).toBe(RequiredVectorDimension);
    database
      .prepare("UPDATE embeddings SET dimension = ?")
      .run(RequiredVectorDimension + 1);
    database.close();

    const reopened = new VectorCache(cacheDir);
    expect(reopened.get(modelId, "term", "en")).toBeUndefined();
    reopened.close();
  });

  it("rejects nonconforming seed vectors before caching or storage", async () => {
    const vectorize = vi.fn().mockResolvedValue([{ meta: null, vector: [0] }]);
    const store = vi.fn();
    vi.mocked(selectFirstServiceImplementation)
      .mockReturnValueOnce({ reference: {}, service: { vectorize } } as never)
      .mockReturnValueOnce({ reference: {}, service: { store } } as never);
    const cache = {
      close: vi.fn(),
      get: vi.fn(),
      invalidateModel: vi.fn(),
      set: vi.fn(),
    };

    await expect(
      vectorizeWithCache({
        execCtx: {
          db: {
            execute: vi.fn().mockResolvedValue({
              rows: [{ id: 1, language_id: "en", value: "term" }],
            }),
          },
        } as never,
        pluginManager: {} as never,
        cache: cache as never,
        vectorizerOverride: {
          config: { "model-id": "text-embedding-3-large" },
          plugin: "openai-vectorizer",
          scope: "GLOBAL",
        },
      }),
    ).rejects.toThrow(`fixed ${RequiredVectorDimension}-dimension contract`);
    expect(vectorize).toHaveBeenCalledOnce();
    expect(cache.invalidateModel).toHaveBeenCalledWith(
      "text-embedding-3-large",
    );
    expect(cache.set).not.toHaveBeenCalled();
    expect(store).not.toHaveBeenCalled();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });
});

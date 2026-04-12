import { executeQuery } from "@cat/domain";
import { PluginManager } from "@cat/plugin-core";
import { createAuthedTestContext } from "@cat/test-utils";
import { call } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

const opMocks = vi.hoisted(() => ({
  adaptMemoryOp: vi.fn(),
  collectMemoryRecallOp: vi.fn(),
  recallContextRerankOp: vi.fn(),
  rerankTermRecallOp: vi.fn(),
  termRecallOp: vi.fn(),
}));

const domainMocks = vi.hoisted(() => ({
  getElementWithChunkIds: vi.fn(),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeQuery: vi.fn(),
    getElementWithChunkIds: domainMocks.getElementWithChunkIds,
  };
});

vi.mock("@cat/operations", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/operations")>("@cat/operations");

  return {
    ...actual,
    adaptMemoryOp: opMocks.adaptMemoryOp,
    collectMemoryRecallOp: opMocks.collectMemoryRecallOp,
    recallContextRerankOp: opMocks.recallContextRerankOp,
    rerankTermRecallOp: opMocks.rerankTermRecallOp,
    termRecallOp: opMocks.termRecallOp,
  };
});

vi.mock("@cat/permissions", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/permissions")>(
      "@cat/permissions",
    );

  return {
    ...actual,
    getPermissionEngine: () => ({
      check: vi.fn().mockResolvedValue(true),
    }),
  };
});

import {
  getElementWithChunkIds,
  listMemoryIdsByProject,
  listProjectGlossaryIds,
} from "@cat/domain";

import { searchTerm } from "@/orpc/routers/glossary";
import { onNew as onNewMemory } from "@/orpc/routers/memory";

const createContext = (): Context => {
  const base = createAuthedTestContext();
  const pluginManager = new PluginManager("GLOBAL", "");

  return {
    ...base,
    pluginManager,
    auth: {
      subjectType: "user",
      subjectId: base.user!.id,
      systemRoles: ["admin"],
      scopes: [],
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    drizzleDB: { client: {} } as unknown as Context["drizzleDB"],
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    redis: {} as unknown as Context["redis"],
    isSSR: true,
  };
};

const collect = async <T>(iterable: AsyncIterable<T>): Promise<T[]> => {
  const items: T[] = [];
  for await (const item of iterable) {
    items.push(item);
  }
  return items;
};

describe("recall routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("searchTerm exposes richer term evidence fields from fused recall", async () => {
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === listProjectGlossaryIds) {
        return ["11111111-1111-4111-8111-111111111111"];
      }
      return [];
    });
    opMocks.termRecallOp.mockResolvedValue({
      terms: [
        {
          term: "memory bank",
          translation: "记忆库",
          confidence: 0.88,
          definition: "TM repository",
          conceptId: 1,
          glossaryId: "11111111-1111-4111-8111-111111111111",
          matchedText: "memory bank",
          evidences: [
            {
              channel: "morphological",
              matchedText: "memory bank",
              matchedVariantText: "memory bank",
              matchedVariantType: "LEMMA",
              confidence: 0.88,
            },
          ],
          concept: { subjects: [], definition: "TM repository" },
        },
      ],
    });

    const stream = await call(
      searchTerm,
      {
        projectId: "33333333-3333-4333-8333-333333333333",
        text: "memory bank",
        termLanguageId: "en",
        translationLanguageId: "zh-Hans",
      },
      { context: createContext() },
    );

    const results = await collect(stream);

    expect(results).toEqual([
      expect.objectContaining({
        conceptId: 1,
        glossaryId: "11111111-1111-4111-8111-111111111111",
        matchedText: "memory bank",
        evidences: [
          expect.objectContaining({
            channel: "morphological",
            matchedVariantType: "LEMMA",
          }),
        ],
      }),
    ]);
  });

  it("memory.onNew yields base then adapted fused memory suggestions and finishes naturally", async () => {
    const element = {
      id: 1,
      value: "Order 43 completed",
      languageId: "en",
      projectId: "33333333-3333-4333-8333-333333333333",
      chunkIds: [1],
    };

    domainMocks.getElementWithChunkIds.mockResolvedValue(element);
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getElementWithChunkIds) {
        return element;
      }
      if (query === listMemoryIdsByProject) {
        return ["22222222-2222-4222-8222-222222222222"];
      }
      return [];
    });

    const baseMemory = {
      id: 301,
      source: "Order 42 completed",
      translation: "订单 42 已完成",
      confidence: 0.83,
      memoryId: "22222222-2222-4222-8222-222222222222",
      translationChunkSetId: null,
      creatorId: null,
      createdAt: new Date("2024-01-01T00:00:00.000Z"),
      updatedAt: new Date("2024-01-01T00:00:00.000Z"),
      evidences: [
        {
          channel: "template",
          matchedVariantType: "TOKEN_TEMPLATE",
          confidence: 0.83,
        },
      ],
    };

    opMocks.collectMemoryRecallOp.mockResolvedValue([baseMemory]);
    opMocks.recallContextRerankOp.mockResolvedValue([baseMemory]);
    opMocks.adaptMemoryOp.mockResolvedValue({
      adaptedTranslation: "订单 43 已完成",
    });

    const stream = await call(
      onNewMemory,
      {
        elementId: 1,
        translationLanguageId: "zh-Hans",
      },
      { context: createContext() },
    );

    const results = await collect(stream);

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual(expect.objectContaining({ id: 301 }));
    expect(results[1]).toEqual(
      expect.objectContaining({
        id: 301,
        adaptedTranslation: "订单 43 已完成",
        adaptationMethod: "llm-adapted",
      }),
    );
  });
});

import {
  createMemoryItems,
  deleteMemoryItem,
  executeCommand,
  executeQuery,
  getMemoryAccessContext,
  getMemoryCanonicalSnapshots,
} from "@cat/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ChangesetEntry } from "../application-method.ts";
import { MemoryItemApplicationMethod } from "./memory-item-application-method.ts";

vi.mock("@cat/domain", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@cat/domain")>()),
  executeCommand: vi.fn(),
  executeQuery: vi.fn(),
}));

const writePayload = {
  memoryItemId: 42,
  memoryId: "11111111-1111-4111-8111-111111111111",
  translationId: 17,
  translationStringId: 18,
  sourceStringId: 19,
  creatorId: "22222222-2222-4222-8222-222222222222",
};

const createdRow = {
  id: writePayload.memoryItemId,
  memoryId: writePayload.memoryId,
  translationId: writePayload.translationId,
  translationStringId: writePayload.translationStringId,
  sourceStringId: writePayload.sourceStringId,
};

const entry = (action: ChangesetEntry["action"]): ChangesetEntry => ({
  id: 1,
  changesetId: 1,
  entityType: "memory_item",
  entityId: "42",
  action,
  before: {
    ...writePayload,
    deletedById: "22222222-2222-4222-8222-222222222222",
    scope: "PROJECT",
    projectId: "33333333-3333-4333-8333-333333333333",
    reason: "branch merge",
  },
  after: writePayload,
  fieldPath: null,
  riskLevel: "LOW",
  reviewStatus: "APPROVED",
  asyncStatus: null,
});

describe("MemoryItemApplicationMethod", () => {
  beforeEach(() => {
    vi.mocked(executeCommand).mockReset();
    vi.mocked(executeQuery).mockReset();
    vi.mocked(executeQuery).mockImplementation(async (_ctx, query) => {
      if (query === getMemoryAccessContext) {
        return {
          memoryId: writePayload.memoryId,
          scope: "PROJECT",
          projectIds: ["p", "33333333-3333-4333-8333-333333333333"],
          personalOwnerId: null,
          personalProjectId: null,
        };
      }
      if (query === getMemoryCanonicalSnapshots) {
        return [{ id: 42, memoryId: writePayload.memoryId }];
      }
      throw new TypeError("Unexpected query");
    });
  });

  it("uses the canonical upsert command for CREATE and UPDATE", async () => {
    vi.mocked(executeCommand).mockResolvedValue({
      items: [createdRow],
      derivations: [],
    });
    const db = {} as never;
    const method = new MemoryItemApplicationMethod();

    await expect(
      method.applyCreate(entry("CREATE"), { projectId: "p", db }),
    ).resolves.toEqual({ status: "APPLIED" });
    await expect(
      method.applyUpdate(entry("UPDATE"), { projectId: "p", db }),
    ).resolves.toEqual({ status: "APPLIED" });

    expect(executeCommand).toHaveBeenNthCalledWith(
      1,
      { db },
      createMemoryItems,
      {
        memoryId: writePayload.memoryId,
        items: [
          {
            memoryItemId: writePayload.memoryItemId,
            translationId: writePayload.translationId,
            translationStringId: writePayload.translationStringId,
            sourceStringId: writePayload.sourceStringId,
            creatorId: writePayload.creatorId,
          },
        ],
      },
    );
    expect(method.asyncDependencySpec).toBeNull();
  });

  it("injects the CREATE entity ID into a payload that omits it", async () => {
    vi.mocked(executeCommand).mockResolvedValue({
      items: [createdRow],
      derivations: [],
    });
    const createEntry = entry("CREATE");
    const { memoryItemId: _, ...after } = writePayload;

    await expect(
      new MemoryItemApplicationMethod().applyCreate(
        { ...createEntry, after },
        { projectId: "p", db: {} as never },
      ),
    ).resolves.toEqual({ status: "APPLIED" });
    expect(executeCommand).toHaveBeenCalledWith(
      expect.anything(),
      createMemoryItems,
      expect.objectContaining({
        items: [expect.objectContaining({ memoryItemId: 42 })],
      }),
    );
  });

  it("rejects a CREATE payload or result with a different identity", async () => {
    const method = new MemoryItemApplicationMethod();
    const createEntry = entry("CREATE");
    await expect(
      method.applyCreate(
        { ...createEntry, after: { ...writePayload, memoryItemId: 43 } },
        { projectId: "p", db: {} as never },
      ),
    ).resolves.toMatchObject({ status: "FAILED" });
    expect(executeCommand).not.toHaveBeenCalled();

    vi.mocked(executeCommand).mockResolvedValue({
      items: [
        { ...createdRow, memoryId: "44444444-4444-4444-8444-444444444444" },
      ],
      derivations: [],
    });
    await expect(
      method.applyCreate(createEntry, { projectId: "p", db: {} as never }),
    ).resolves.toMatchObject({ status: "FAILED" });
  });

  it("routes VCS deletion through the canonical delete command", async () => {
    vi.mocked(executeCommand).mockResolvedValue({
      deleted: true,
      derivations: [],
    });
    const db = {} as never;
    const result = await new MemoryItemApplicationMethod().applyDelete(
      entry("DELETE"),
      { projectId: "33333333-3333-4333-8333-333333333333", db },
    );
    expect(result).toEqual({ status: "APPLIED" });
    expect(executeCommand).toHaveBeenCalledWith(
      { db },
      deleteMemoryItem,
      expect.objectContaining({ memoryItemId: 42, scope: "PROJECT" }),
    );
  });

  it("replays DELETE rollback through the canonical upsert command", async () => {
    vi.mocked(executeCommand).mockResolvedValue({
      items: [createdRow],
      derivations: [],
    });
    const db = {} as never;
    const result = await new MemoryItemApplicationMethod().applyRollback(
      entry("DELETE"),
      { projectId: "33333333-3333-4333-8333-333333333333", db },
    );
    expect(result).toEqual({ status: "APPLIED" });
    expect(executeCommand).toHaveBeenCalledWith(
      { db },
      createMemoryItems,
      expect.objectContaining({ memoryId: writePayload.memoryId }),
    );
  });

  it("replays CREATE rollback through the canonical delete command", async () => {
    vi.mocked(executeCommand).mockResolvedValue({
      deleted: true,
      derivations: [],
    });
    const db = {} as never;
    const createdEntry = entry("CREATE");
    const rollbackEntry = {
      ...createdEntry,
      after: createdEntry.before,
    };
    await expect(
      new MemoryItemApplicationMethod().applyRollback(rollbackEntry, {
        projectId: "33333333-3333-4333-8333-333333333333",
        db,
      }),
    ).resolves.toEqual({ status: "APPLIED" });
    expect(executeCommand).toHaveBeenCalledWith(
      { db },
      deleteMemoryItem,
      expect.objectContaining({ memoryItemId: writePayload.memoryItemId }),
    );
  });
});

import { describe, expect, test, vi } from "vitest";

import type { ChangeSetService } from "../changeset-service.ts";
import type { DiffStrategyRegistry } from "../diff-strategy-registry.ts";
import type { VCSContext } from "../vcs-middleware.ts";

import { VCSMiddleware } from "../vcs-middleware.ts";

const mockAddEntry = vi.fn().mockResolvedValue({ id: 1 });
const mockCreateChangeSet = vi.fn().mockResolvedValue({ id: 42 });
const mockDiff = vi.fn().mockReturnValue({ impactScope: "LOCAL" });

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const mockCsService = {
  addEntry: mockAddEntry,
  createChangeSet: mockCreateChangeSet,
} as unknown as ChangeSetService;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const mockDiffRegistry = {
  has: () => true,
  diff: mockDiff,
} as unknown as DiffStrategyRegistry;

describe("VCSMiddleware — Direct mode", () => {
  test("Direct mode executes writeFn AND records changeset entry", async () => {
    const mw = new VCSMiddleware(mockCsService, mockDiffRegistry);
    const writeFn = vi.fn().mockResolvedValue({ id: 1, name: "test" });

    const ctx: VCSContext = {
      mode: "direct",
      projectId: "proj-1",
      createdBy: "user-1",
    };

    const result = await mw.interceptWrite(
      ctx,
      "translation",
      "entity-1",
      "CREATE",
      null,
      { id: 1, name: "test" },
      writeFn,
    );

    expect(writeFn).toHaveBeenCalledOnce();
    expect(mockCreateChangeSet).toHaveBeenCalledWith({
      projectId: "proj-1",
      createdBy: "user-1",
    });
    expect(mockAddEntry).toHaveBeenCalledOnce();
    expect(result).toEqual({ id: 1, name: "test" });
  });

  test("Direct mode reuses changeset across multiple interceptWrite calls", async () => {
    mockCreateChangeSet.mockClear();
    mockAddEntry.mockClear();

    const mw = new VCSMiddleware(mockCsService, mockDiffRegistry);
    const ctx: VCSContext = { mode: "direct", projectId: "proj-1" };

    await mw.interceptWrite(
      ctx,
      "translation",
      "e1",
      "CREATE",
      null,
      { text: "a" },
      vi.fn().mockResolvedValue(undefined),
    );
    await mw.interceptWrite(
      ctx,
      "translation",
      "e2",
      "CREATE",
      null,
      { text: "b" },
      vi.fn().mockResolvedValue(undefined),
    );

    expect(mockCreateChangeSet).toHaveBeenCalledOnce();
    expect(mockAddEntry).toHaveBeenCalledTimes(2);
    expect(ctx.currentChangesetId).toBe(42);
  });

  test("Isolation mode does NOT execute writeFn", async () => {
    const mw = new VCSMiddleware(mockCsService, mockDiffRegistry);
    const writeFn = vi.fn();

    await mw.interceptWrite(
      {
        mode: "isolation",
        projectId: "proj-1",
        branchId: 1,
        branchChangesetId: 10,
      },
      "translation",
      "e1",
      "CREATE",
      null,
      { text: "hello" },
      writeFn,
    );

    expect(writeFn).not.toHaveBeenCalled();
  });
});

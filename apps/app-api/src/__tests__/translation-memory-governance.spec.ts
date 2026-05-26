import { createAuthedTestContext } from "@cat/test-utils";
import { call, ORPCError } from "@orpc/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Context } from "@/utils/context";

const mocks = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  executeCommand: vi.fn(),
  permissionCheck: vi.fn(),
  interceptWrite: vi.fn(),
  determineWriteMode: vi.fn().mockResolvedValue("direct"),
}));

vi.mock("@cat/domain", async () => {
  const actual =
    await vi.importActual<typeof import("@cat/domain")>("@cat/domain");

  return {
    ...actual,
    executeQuery: mocks.executeQuery,
    executeCommand: mocks.executeCommand,
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
      check: mocks.permissionCheck,
    }),
    determineWriteMode: mocks.determineWriteMode,
  };
});

vi.mock("@/utils/vcs-route-helper", async () => {
  const actual = await vi.importActual<typeof import("@/utils/vcs-route-helper")>(
    "@/utils/vcs-route-helper",
  );

  return {
    ...actual,
    createVCSRouteHelper: () => ({
      middleware: {
        interceptWrite: mocks.interceptWrite,
      },
    }),
  };
});

import { deleteMemoryItem, getMemoryAccessContext } from "@cat/domain";

import { deleteItem } from "@/orpc/routers/memory";

const projectId = "33333333-3333-4333-8333-333333333333";
const memoryId = "44444444-4444-4444-8444-444444444444";

const createContext = (): Context => {
  const base = createAuthedTestContext();
  const userId = base.user?.id;

  if (!userId) {
    throw new Error("Expected authed test user");
  }

  const context = {
    ...base,
    auth: {
      subjectType: "user",
      subjectId: userId,
      systemRoles: ["admin"],
      scopes: [],
    },
    drizzleDB: {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      client: {} as unknown as Context["drizzleDB"]["client"],
    },
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    redis: {},
    isSSR: true,
    isWebSocket: false,
  };

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return context as unknown as Context;
};

describe("translation memory governance routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.determineWriteMode.mockResolvedValue("direct");

    mocks.interceptWrite.mockImplementation(
      async (
        _vcsCtx: unknown,
        _entityType: unknown,
        _entityId: unknown,
        _action: unknown,
        _before: unknown,
        _after: unknown,
        writeFn: () => Promise<{ deleted: boolean }>,
      ) => await writeFn(),
    );
  });

  it("allows personal memory owner to delete items directly", async () => {
    const context = createContext();
    const userId = context.user?.id;
    if (!userId) throw new Error("Expected authed user");

    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === getMemoryAccessContext) {
        return {
          memoryId,
          scope: "PERSONAL",
          projectIds: [],
          personalOwnerId: userId,
          personalProjectId: projectId,
        };
      }
      return null;
    });

    mocks.executeCommand.mockResolvedValueOnce({ deleted: true });

    const result = await call(
      deleteItem,
      {
        memoryId,
        memoryItemId: 101,
      },
      { context },
    );

    expect(result).toEqual({ deleted: true });
    expect(mocks.interceptWrite).not.toHaveBeenCalled();
    expect(mocks.executeCommand).toHaveBeenCalledWith(
      { db: context.drizzleDB.client },
      deleteMemoryItem,
      expect.objectContaining({
        memoryItemId: 101,
        scope: "PERSONAL",
      }),
    );
  });

  it("routes project memory deletion through VCS direct interceptWrite", async () => {
    const context = createContext();
    const userId = context.user?.id;
    if (!userId) throw new Error("Expected authed user");

    mocks.permissionCheck.mockResolvedValue(true);
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === getMemoryAccessContext) {
        return {
          memoryId,
          scope: "PROJECT",
          projectIds: [projectId],
          personalOwnerId: null,
          personalProjectId: null,
        };
      }
      return null;
    });

    mocks.executeCommand.mockResolvedValueOnce({ deleted: true });

    const result = await call(
      deleteItem,
      {
        memoryId,
        memoryItemId: 102,
      },
      { context },
    );

    expect(result).toEqual({ deleted: true });
    expect(mocks.interceptWrite).toHaveBeenCalledTimes(1);
    expect(mocks.interceptWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "direct",
        projectId,
        createdBy: userId,
      }),
      "memory_item",
      "102",
      "DELETE",
      expect.objectContaining({
        memoryId,
        memoryItemId: 102,
        scope: "PROJECT",
        projectId,
      }),
      { deleted: true },
      expect.any(Function),
    );
  });

  it("routes project memory deletion through VCS isolation when branch context exists", async () => {
    const base = createContext();
    const context = {
      ...base,
      branchId: 77,
      branchChangesetId: 88,
      branchProjectId: projectId,
    } as Context;

    mocks.permissionCheck.mockResolvedValue(true);
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === getMemoryAccessContext) {
        return {
          memoryId,
          scope: "PROJECT",
          projectIds: [projectId],
          personalOwnerId: null,
          personalProjectId: null,
        };
      }
      return null;
    });

    const result = await call(
      deleteItem,
      {
        memoryId,
        memoryItemId: 104,
      },
      { context },
    );

    expect(result).toEqual({ deleted: true });
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(mocks.interceptWrite).toHaveBeenCalledTimes(1);
    expect(mocks.interceptWrite).toHaveBeenCalledWith(
      {
        mode: "isolation",
        projectId,
        branchId: 77,
        branchChangesetId: 88,
      },
      "memory_item",
      "104",
      "DELETE",
      expect.objectContaining({
        memoryId,
        memoryItemId: 104,
        scope: "PROJECT",
        projectId,
      }),
      null,
      expect.any(Function),
    );
    expect(mocks.interceptWrite.mock.calls[0]?.[4]).not.toHaveProperty(
      "reason",
    );
  });

  it("rejects project delete when user has no editor permission", async () => {
    const context = createContext();

    mocks.permissionCheck.mockResolvedValue(false);
    mocks.executeQuery.mockImplementation(async (_ctx, query) => {
      if (query === getMemoryAccessContext) {
        return {
          memoryId,
          scope: "PROJECT",
          projectIds: [projectId],
          personalOwnerId: null,
          personalProjectId: null,
        };
      }
      return null;
    });

    await expect(
      call(
        deleteItem,
        {
          memoryId,
          memoryItemId: 103,
        },
        { context },
      ),
    ).rejects.toBeInstanceOf(ORPCError);

    expect(mocks.interceptWrite).not.toHaveBeenCalled();
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });
});

import type { PermissionEngine } from "@cat/permissions";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@cat/domain");
vi.mock("@cat/permissions");
vi.mock("@cat/vcs");

import { executeQuery } from "@cat/domain";
import { determineWriteMode, getPermissionEngine } from "@cat/permissions";
import { getBranchChangesetId } from "@cat/vcs";
import { ORPCError } from "@orpc/server";

import { withBranchContext } from "../with-branch-context";

// Minimal mock engine satisfying PermissionEngine.check
const mockCheck = vi.fn();
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const mockEngine = { check: mockCheck } as unknown as PermissionEngine;

const makeContext = () => ({
  user: {
    id: "user-1",
    email: "test@example.com",
    name: "Test",
    emailVerified: true,
    avatarFileId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  sessionId: "session-1" as string | null,
  auth: {
    subjectType: "user" as const,
    subjectId: "user-1",
    systemRoles: [] as string[],
    scopes: null as string[] | null,
  },
  drizzleDB: {
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    client: {} as unknown as Record<string, never>,
  },
  helpers: {
    getReqHeader: vi.fn().mockReturnValue(undefined),
  },
});

const makeNext = () =>
  vi.fn().mockResolvedValue({ output: undefined, context: {} });

// oRPC middleware is a callable function: (options, input, outputFn) => Promise
// oxlint-disable-next-line typescript/no-unsafe-type-assertion
const invokeMiddleware = withBranchContext as unknown as (
  options: {
    context: ReturnType<typeof makeContext>;
    next: ReturnType<typeof makeNext>;
    errors: Record<string, never>;
    path: never[];
    signal: undefined;
  },
  input: { branchId?: number; projectId?: string },
  outputFn: () => void,
) => Promise<unknown>;

describe("withBranchContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPermissionEngine).mockReturnValue(mockEngine);
  });

  describe("branchId 不存在时", () => {
    it("无 projectId → 直接放行", async () => {
      const next = makeNext();
      await invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        {},
        () => undefined,
      );

      expect(next).toHaveBeenCalledWith({});
      expect(executeQuery).not.toHaveBeenCalled();
    });

    it("projectId 有 direct 权限 → 放行", async () => {
      vi.mocked(determineWriteMode).mockResolvedValue("direct");
      const next = makeNext();
      await invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { projectId: "project-uuid-1" },
        () => undefined,
      );

      expect(next).toHaveBeenCalledWith({});
    });

    it("projectId 有 isolation_forced → 403", async () => {
      vi.mocked(determineWriteMode).mockResolvedValue("isolation");
      const next = makeNext();
      const promise = invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { projectId: "project-uuid-1" },
        () => undefined,
      );

      await expect(promise).rejects.toThrow(ORPCError);
      await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("branchId 存在时", () => {
    it("branch 不存在 → NOT_FOUND", async () => {
      vi.mocked(executeQuery).mockResolvedValue(null);
      const next = makeNext();
      const promise = invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { branchId: 99 },
        () => undefined,
      );

      await expect(promise).rejects.toThrow(ORPCError);
      await expect(promise).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect(next).not.toHaveBeenCalled();
    });

    it("branch 非 ACTIVE → CONFLICT", async () => {
      vi.mocked(executeQuery).mockResolvedValue({
        id: 1,
        projectId: "proj-1",
        status: "MERGED",
      });
      const next = makeNext();
      const promise = invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { branchId: 1 },
        () => undefined,
      );

      await expect(promise).rejects.toThrow(ORPCError);
      await expect(promise).rejects.toMatchObject({ code: "CONFLICT" });
      expect(next).not.toHaveBeenCalled();
    });

    it("无 editor 权限 → FORBIDDEN", async () => {
      vi.mocked(executeQuery).mockResolvedValue({
        id: 1,
        projectId: "proj-1",
        status: "ACTIVE",
      });
      mockCheck.mockResolvedValue(false);
      const next = makeNext();
      const promise = invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { branchId: 1 },
        () => undefined,
      );

      await expect(promise).rejects.toThrow(ORPCError);
      await expect(promise).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(next).not.toHaveBeenCalled();
    });

    it("正常 branchId → context 注入 branchId 和 branchChangesetId", async () => {
      vi.mocked(executeQuery).mockResolvedValue({
        id: 1,
        projectId: "proj-1",
        status: "ACTIVE",
      });
      mockCheck.mockResolvedValue(true);
      vi.mocked(getBranchChangesetId).mockResolvedValue(42);
      const next = makeNext();
      await invokeMiddleware(
        {
          context: makeContext(),
          next,
          errors: {},
          path: [],
          signal: undefined,
        },
        { branchId: 1 },
        () => undefined,
      );

      expect(next).toHaveBeenCalledWith({
        context: {
          branchId: 1,
          branchChangesetId: 42,
          branchProjectId: "proj-1",
        },
      });
    });
  });
});

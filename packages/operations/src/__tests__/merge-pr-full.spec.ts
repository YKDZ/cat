import type { DrizzleClient } from "@cat/domain";

import { beforeEach, describe, expect, test, vi } from "vitest";

import type { MergePRFullInput } from "../merge-pr-full";

const m = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  executeCommand: vi.fn(),
  getPR: Symbol("getPR"),
  getBranchById: Symbol("getBranchById"),
  mergePR: Symbol("mergePR"),
  markBranchConflicted: Symbol("markBranchConflicted"),
  mergeBranch: vi.fn(),
  applyChangeSet: vi.fn(),
  getDefaultRegistries: vi.fn().mockReturnValue({
    diffRegistry: {},
    appMethodRegistry: {},
  }),
}));

vi.mock("@cat/domain", () => ({
  executeQuery: m.executeQuery,
  executeCommand: m.executeCommand,
  getPR: m.getPR,
  getBranchById: m.getBranchById,
  mergePR: m.mergePR,
  markBranchConflicted: m.markBranchConflicted,
}));

vi.mock("@cat/vcs", () => ({
  mergeBranch: m.mergeBranch,
  detectConflicts: vi.fn(),
  rebaseBranch: vi.fn(),
  // oxlint-disable-next-line no-unsafe-type-assertion
  ChangeSetService: vi
    .fn()
    .mockImplementation(function MockCS(this: Record<string, unknown>) {
      this.applyChangeSet = m.applyChangeSet;
    }),
  getDefaultRegistries: m.getDefaultRegistries,
  registerAllDiffStrategies: vi.fn(),
  SimpleApplicationMethod: vi.fn(),
  VectorizedStringApplicationMethod: vi.fn(),
}));

import { mergePRFull } from "../merge-pr-full";

const mockPR = { id: 1, branchId: 10, projectId: "proj-1", status: "OPEN" };
const mockBranch = {
  id: 10,
  projectId: "proj-1",
  status: "ACTIVE",
  baseChangesetId: 100,
};

const tx = { _tag: "tx" as const };
const db = {
  transaction: vi.fn(
    async (callback: (handle: typeof tx) => Promise<unknown>) => callback(tx),
  ),
};
// oxlint-disable-next-line no-unsafe-type-assertion
const dbClient = db as unknown as DrizzleClient;

beforeEach(() => {
  m.executeQuery.mockReset();
  m.executeCommand.mockReset();
  m.mergeBranch.mockReset();
  m.applyChangeSet.mockReset();
  db.transaction.mockClear();
});

describe("mergePRFull", () => {
  test("正常路径 — 无冲突时完成合并", async () => {
    m.executeQuery
      .mockResolvedValueOnce(mockPR)
      .mockResolvedValueOnce(mockBranch);
    m.mergeBranch.mockResolvedValue({
      success: true,
      hasConflicts: false,
      conflicts: [],
      mainChangesetId: 200,
    });
    m.executeCommand.mockResolvedValue(undefined);

    const input: MergePRFullInput = {
      prExternalId: "00000000-0000-0000-0000-000000000001",
      mergedBy: "user:u1",
    };
    const result = await mergePRFull({ db: dbClient }, input);

    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.mainChangesetId).toBe(200);
  });

  test("冲突路径 — mergeBranch 返回冲突", async () => {
    m.executeQuery
      .mockResolvedValueOnce(mockPR)
      .mockResolvedValueOnce(mockBranch);
    m.mergeBranch.mockResolvedValue({
      success: false,
      hasConflicts: true,
      conflicts: [
        {
          entityType: "translation",
          entityId: "t1",
          branchAction: "UPDATE",
          mainAction: "UPDATE",
          branchAfter: { text: "branch" },
          mainAfter: { text: "main" },
        },
      ],
    });
    m.executeCommand.mockResolvedValue(undefined);

    const input: MergePRFullInput = {
      prExternalId: "00000000-0000-0000-0000-000000000001",
      mergedBy: "user:u1",
    };
    const result = await mergePRFull({ db: dbClient }, input);

    expect(result.success).toBe(false);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
  });
});

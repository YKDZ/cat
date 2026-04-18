import type { DbHandle } from "@cat/domain";

import { beforeEach, describe, expect, test, vi } from "vitest";

import type { RebasePRFullInput } from "../rebase-pr-full";

const m = vi.hoisted(() => ({
  executeQuery: vi.fn(),
  executeCommand: vi.fn(),
  getPR: Symbol("getPR"),
  getBranchById: Symbol("getBranchById"),
  markBranchConflicted: Symbol("markBranchConflicted"),
  rebaseBranch: vi.fn(),
  detectConflicts: vi.fn(),
}));

vi.mock("@cat/domain", () => ({
  executeQuery: m.executeQuery,
  executeCommand: m.executeCommand,
  getPR: m.getPR,
  getBranchById: m.getBranchById,
  markBranchConflicted: m.markBranchConflicted,
}));

vi.mock("@cat/vcs", () => ({
  rebaseBranch: m.rebaseBranch,
  detectConflicts: m.detectConflicts,
  getDefaultRegistries: vi.fn(() => ({ appMethodRegistry: {} })),
}));

import { rebasePRFull } from "../rebase-pr-full";

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
const dbClient = db as unknown as DbHandle;

beforeEach(() => {
  m.executeQuery.mockReset();
  m.executeCommand.mockReset();
  m.rebaseBranch.mockReset();
  m.detectConflicts.mockReset();
  db.transaction.mockClear();
});

describe("rebasePRFull", () => {
  test("正常路径 — 无冲突 rebase 成功", async () => {
    m.executeQuery
      .mockResolvedValueOnce(mockPR)
      .mockResolvedValueOnce(mockBranch);
    m.rebaseBranch.mockResolvedValue({
      success: true,
      newBaseChangesetId: 105,
    });
    m.detectConflicts.mockResolvedValue([]);
    m.executeCommand.mockResolvedValue(undefined);

    const input: RebasePRFullInput = {
      prExternalId: "00000000-0000-0000-0000-000000000001",
    };
    const result = await rebasePRFull({ db: dbClient }, input);

    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.newBaseChangesetId).toBe(105);
    expect(result.conflicts).toHaveLength(0);
  });

  test("冲突路径 — rebase 后存在冲突", async () => {
    m.executeQuery
      .mockResolvedValueOnce(mockPR)
      .mockResolvedValueOnce(mockBranch);
    m.rebaseBranch.mockResolvedValue({
      success: true,
      newBaseChangesetId: 106,
    });
    m.detectConflicts.mockResolvedValue([
      {
        entityType: "translation",
        entityId: "t2",
        branchAction: "UPDATE",
        mainAction: "DELETE",
        branchAfter: { text: "changed" },
        mainAfter: null,
      },
    ]);
    m.executeCommand.mockResolvedValue(undefined);

    const input: RebasePRFullInput = {
      prExternalId: "00000000-0000-0000-0000-000000000001",
    };
    const result = await rebasePRFull({ db: dbClient }, input);

    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(true);
    expect(result.conflicts).toHaveLength(1);
    expect(result.newBaseChangesetId).toBe(106);
  });

  test("branch 状态非 ACTIVE 时抛出错误", async () => {
    m.executeQuery
      .mockResolvedValueOnce(mockPR)
      .mockResolvedValueOnce({ ...mockBranch, status: "MERGED" });

    const input: RebasePRFullInput = {
      prExternalId: "00000000-0000-0000-0000-000000000001",
    };
    // oxlint-disable-next-line no-unsafe-type-assertion
    await expect(rebasePRFull({ db: dbClient }, input)).rejects.toThrow(
      "is not ACTIVE",
    );
  });
});

import { describe, expect, it } from "vitest";

import { resolveProjectWriteCapability } from "./write-capability";

describe("resolveProjectWriteCapability", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";

  it("allows branch writes whenever a valid non-main branch is selected and user can edit", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: 42,
        branchValidationStatus: "active",
        writeMode: "isolation",
      }),
    ).toMatchObject({
      canWrite: true,
      target: "branch",
      state: "branch-write",
      branchId: 42,
    });
  });

  it("allows main direct writes for direct mode", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: null,
        branchValidationStatus: "main",
        writeMode: "direct",
      }),
    ).toMatchObject({
      canWrite: true,
      target: "main",
      state: "main-direct-write",
      branchId: null,
    });
  });

  it("blocks main writes for isolation mode", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: null,
        branchValidationStatus: "main",
        writeMode: "isolation",
      }),
    ).toMatchObject({
      canWrite: false,
      target: "blocked",
      state: "main-blocked",
      disabledReason:
        "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
    });
  });

  it("blocks all writes for no_access", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: 42,
        branchValidationStatus: "active",
        writeMode: "no_access",
      }),
    ).toMatchObject({
      canWrite: false,
      target: "blocked",
      state: "no-access",
      disabledReason: "你没有此项目的编辑权限。",
    });
  });

  it("does not allow writes while a URL/profile branch is still pending validation", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: 42,
        branchValidationStatus: "pending",
        writeMode: "isolation",
      }),
    ).toMatchObject({
      canWrite: false,
      target: "blocked",
      state: "branch-pending",
      branchId: 42,
      disabledReason: "正在验证所选分支，请稍后。",
    });
  });

  it("does not allow writes for a stale branch selection", () => {
    expect(
      resolveProjectWriteCapability({
        projectId,
        selectedBranchId: 42,
        branchValidationStatus: "stale",
        writeMode: "isolation",
      }),
    ).toMatchObject({
      canWrite: false,
      target: "blocked",
      state: "branch-stale",
      branchId: 42,
      disabledReason: "所选分支已失效，已回到 main。",
    });
  });
});

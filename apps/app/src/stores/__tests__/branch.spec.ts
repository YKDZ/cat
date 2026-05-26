import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";

import { useBranchStore } from "../branch";
import { useProfileStore } from "../profile";

describe("useBranchStore", () => {
  const projectA = "11111111-1111-4111-8111-111111111111";
  const projectB = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("初始状态为主分支", () => {
    const store = useBranchStore();

    expect(store.currentProjectId).toBeNull();
    expect(store.currentBranchId).toBeNull();
    expect(store.currentBranchName).toBeNull();
    expect(store.validationStatus).toBe("main");
    expect(store.isOnBranch).toBe(false);
    expect(store.isOnMainBranch).toBe(true);
  });

  test("enterBranch 设置项目级分支状态并写入 profile", () => {
    const store = useBranchStore();
    const profile = useProfileStore();

    store.enterBranch({
      projectId: projectA,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });

    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBe(42);
    expect(store.currentBranchName).toBe("pr-3");
    expect(store.validationStatus).toBe("active");
    expect(profile.projectBranchSelections[projectA]?.branchId).toBe(42);
    expect(store.isOnBranch).toBe(true);
    expect(store.isOnMainBranch).toBe(false);
  });

  test("restoreProjectBranch URL 优先于 profile", () => {
    const store = useBranchStore();
    const profile = useProfileStore();
    profile.setProjectBranchSelection({
      projectId: projectA,
      branchId: 41,
      label: "pr-2",
      updatedAt: "2026-05-26T00:00:00.000Z",
    });

    store.restoreProjectBranch({ projectId: projectA, branchIdFromRoute: 99 });

    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBe(99);
    expect(store.validationStatus).toBe("pending");
    expect(store.currentBranchName).toBeNull();
  });

  test("restoreProjectBranch 不会把同一路由分支重新打回 pending", () => {
    const store = useBranchStore();

    store.enterBranch({
      projectId: projectA,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
      persist: false,
    });

    store.restoreProjectBranch({ projectId: projectA, branchIdFromRoute: 42 });

    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBe(42);
    expect(store.currentPRId).toBe(7);
    expect(store.currentPRNumber).toBe(3);
    expect(store.currentBranchName).toBe("pr-3");
    expect(store.validationStatus).toBe("active");
  });

  test("restoreProjectBranch 无 URL 时从当前项目 profile 回填且不串项目", () => {
    const store = useBranchStore();
    const profile = useProfileStore();
    profile.setProjectBranchSelection({
      projectId: projectA,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      label: "pr-3",
      updatedAt: "2026-05-26T00:00:00.000Z",
    });

    store.restoreProjectBranch({
      projectId: projectB,
      branchIdFromRoute: null,
    });
    expect(store.currentProjectId).toBe(projectB);
    expect(store.currentBranchId).toBeNull();

    store.restoreProjectBranch({
      projectId: projectA,
      branchIdFromRoute: null,
    });
    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBe(42);
    expect(store.currentPRNumber).toBe(3);
    expect(store.validationStatus).toBe("pending");
  });

  test("leaveBranch 回到 main 并清除该项目保存项", () => {
    const store = useBranchStore();
    const profile = useProfileStore();

    store.enterBranch({
      projectId: projectA,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });
    store.leaveBranch(projectA);

    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBeNull();
    expect(store.validationStatus).toBe("main");
    expect(profile.projectBranchSelections[projectA]).toBeUndefined();
  });

  test("markStale 清除 profile 并无感回 main", () => {
    const store = useBranchStore();
    const profile = useProfileStore();

    store.enterBranch({
      projectId: projectA,
      branchId: 42,
      prId: 7,
      prNumber: 3,
      branchName: "pr-3",
    });
    store.markStale(projectA);

    expect(store.currentProjectId).toBe(projectA);
    expect(store.currentBranchId).toBeNull();
    expect(store.validationStatus).toBe("main");
    expect(profile.projectBranchSelections[projectA]).toBeUndefined();
  });
});

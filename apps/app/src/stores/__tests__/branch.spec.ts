import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, test } from "vitest";

import { useBranchStore } from "../branch";

describe("useBranchStore", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  test("初始状态为主分支", () => {
    const store = useBranchStore();

    expect(store.currentBranchId).toBeNull();
    expect(store.currentBranchName).toBeNull();
    expect(store.isOnBranch).toBe(false);
    expect(store.isOnMainBranch).toBe(true);
  });

  test("enterBranch 设置分支状态（含分支名称）", () => {
    const store = useBranchStore();

    store.enterBranch(42, 7, 3, "feature/add-translations");

    expect(store.currentBranchId).toBe(42);
    expect(store.currentBranchName).toBe("feature/add-translations");
    expect(store.isOnBranch).toBe(true);
    expect(store.isOnMainBranch).toBe(false);
  });

  test("leaveBranch 恢复主分支", () => {
    const store = useBranchStore();

    store.enterBranch(42, 7, 3, "feature/add-translations");
    store.leaveBranch();

    expect(store.currentBranchId).toBeNull();
    expect(store.currentBranchName).toBeNull();
    expect(store.isOnBranch).toBe(false);
    expect(store.isOnMainBranch).toBe(true);
  });

  test("setBranchIdFromRoute 可从 URL 恢复分支 ID 并在清空时重置元数据", () => {
    const store = useBranchStore();

    store.setBranchIdFromRoute(99);

    expect(store.currentBranchId).toBe(99);
    expect(store.currentPRId).toBeNull();
    expect(store.currentPRNumber).toBeNull();
    expect(store.currentBranchName).toBeNull();
    expect(store.isOnBranch).toBe(true);

    store.setBranchIdFromRoute(null);

    expect(store.currentBranchId).toBeNull();
    expect(store.currentPRId).toBeNull();
    expect(store.currentPRNumber).toBeNull();
    expect(store.currentBranchName).toBeNull();
    expect(store.isOnMainBranch).toBe(true);
  });
});

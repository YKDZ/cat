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
    expect(store.isOnBranch).toBe(false);
  });

  test("enterBranch 设置分支状态", () => {
    const store = useBranchStore();

    store.enterBranch(42, 7, 3);

    expect(store.currentBranchId).toBe(42);
    expect(store.isOnBranch).toBe(true);
  });

  test("leaveBranch 恢复主分支", () => {
    const store = useBranchStore();

    store.enterBranch(42, 7, 3);
    store.leaveBranch();

    expect(store.currentBranchId).toBeNull();
    expect(store.isOnBranch).toBe(false);
  });
});

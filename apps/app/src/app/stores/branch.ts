import { defineStore } from "pinia";
import { computed, ref } from "vue";

/**
 * @zh 分支工作空间状态管理 — 跟踪当前用户正在查看的 PR 分支。
 * @en Branch workspace state — tracks the PR branch the user is currently viewing.
 */
export const useBranchStore = defineStore("branch", () => {
  const currentBranchId = ref<number | null>(null);
  const currentPRId = ref<number | null>(null);
  const currentPRNumber = ref<number | null>(null);

  /**
   * @zh 当前是否处于分支工作空间
   * @en Whether the user is currently in a branch workspace
   */
  const isOnBranch = computed(() => currentBranchId.value !== null);

  /**
   * @zh 进入分支工作空间
   * @en Enter the branch workspace
   */
  const enterBranch = (branchId: number, prId: number, prNumber: number) => {
    currentBranchId.value = branchId;
    currentPRId.value = prId;
    currentPRNumber.value = prNumber;
  };

  /**
   * @zh 离开分支工作空间，回到主分支
   * @en Leave the branch workspace and return to the main branch
   */
  const leaveBranch = () => {
    currentBranchId.value = null;
    currentPRId.value = null;
    currentPRNumber.value = null;
  };

  return {
    currentBranchId,
    currentPRId,
    currentPRNumber,
    isOnBranch,
    enterBranch,
    leaveBranch,
  };
});

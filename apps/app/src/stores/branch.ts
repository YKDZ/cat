import { defineStore } from "pinia";
import { computed, ref } from "vue";

import { useProfileStore } from "@/stores/profile";

/**
 * @zh 分支选择校验状态。
 * @en Validation state of the current branch selection.
 */
export type BranchValidationStatus = "main" | "pending" | "active" | "stale";

/**
 * @zh 进入分支工作区所需的输入。
 * @en Input payload for entering a branch workspace.
 */
export type EnterBranchInput = {
  projectId: string;
  branchId: number;
  prId?: number | null;
  prNumber?: number | null;
  branchName?: string | null;
  persist?: boolean;
};

/**
 * @zh 分支工作空间状态管理 — 按项目跟踪当前用户正在查看的 PR 分支。
 * @en Branch workspace state — tracks the PR branch the user is viewing per project.
 */
export const useBranchStore = defineStore("branch", () => {
  const profile = useProfileStore();

  const currentProjectId = ref<string | null>(null);
  const currentBranchId = ref<number | null>(null);
  const currentPRId = ref<number | null>(null);
  const currentPRNumber = ref<number | null>(null);
  const currentBranchName = ref<string | null>(null);
  const validationStatus = ref<BranchValidationStatus>("main");

  /**
   * @zh 当前是否处于分支工作空间
   * @en Whether the user is currently in a branch workspace
   */
  const isOnBranch = computed(() => currentBranchId.value !== null);

  /**
   * @zh 当前是否在主分支（isOnBranch 的语义反转）
   * @en Whether the user is on the main branch (semantic inverse of isOnBranch)
   */
  const isOnMainBranch = computed(() => !isOnBranch.value);

  const applyMain = (projectId: string | null) => {
    currentProjectId.value = projectId;
    currentBranchId.value = null;
    currentPRId.value = null;
    currentPRNumber.value = null;
    currentBranchName.value = null;
    validationStatus.value = "main";
  };

  /**
   * @zh 进入分支工作空间
   * @en Enter the branch workspace
   */
  const enterBranch = (input: EnterBranchInput) => {
    currentProjectId.value = input.projectId;
    currentBranchId.value = input.branchId;
    currentPRId.value = input.prId ?? null;
    currentPRNumber.value = input.prNumber ?? null;
    currentBranchName.value = input.branchName ?? null;
    validationStatus.value = input.prId ? "active" : "pending";

    if (input.persist !== false) {
      profile.setProjectBranchSelection({
        projectId: input.projectId,
        branchId: input.branchId,
        prId: input.prId ?? null,
        prNumber: input.prNumber ?? null,
        label: input.branchName ?? null,
        updatedAt: new Date().toISOString(),
      });
    }
  };

  /**
   * @zh 从 URL 或 profile 恢复某项目的分支；URL 优先。
   * @en Restore a project's branch from URL or profile; URL takes priority.
   */
  const restoreProjectBranch = (input: {
    projectId: string;
    branchIdFromRoute: number | null;
  }) => {
    if (input.branchIdFromRoute !== null) {
      if (
        currentProjectId.value === input.projectId &&
        currentBranchId.value === input.branchIdFromRoute
      ) {
        return;
      }

      enterBranch({
        projectId: input.projectId,
        branchId: input.branchIdFromRoute,
        persist: false,
      });
      return;
    }

    const saved = profile.projectBranchSelections[input.projectId];
    if (!saved) {
      if (
        currentProjectId.value === input.projectId &&
        currentBranchId.value === null &&
        validationStatus.value === "main"
      ) {
        return;
      }

      applyMain(input.projectId);
      return;
    }

    if (
      currentProjectId.value === input.projectId &&
      currentBranchId.value === saved.branchId
    ) {
      return;
    }

    enterBranch({
      projectId: input.projectId,
      branchId: saved.branchId,
      prId: saved.prId ?? null,
      prNumber: saved.prNumber ?? null,
      branchName: saved.label ?? null,
      persist: false,
    });
    validationStatus.value = "pending";
  };

  /**
   * @zh 从 URL 恢复分支 ID；PR 元数据稍后由 BranchCombobox 补齐。
   * @en Restore branch ID from URL; BranchCombobox can hydrate PR metadata later.
   */
  const setBranchIdFromRoute = (branchIdFromRoute: number | null) => {
    if (!currentProjectId.value) {
      currentProjectId.value = null;
      currentBranchId.value = branchIdFromRoute;
      currentPRId.value = null;
      currentPRNumber.value = null;
      currentBranchName.value = null;
      validationStatus.value = branchIdFromRoute === null ? "main" : "pending";
      return;
    }

    restoreProjectBranch({
      projectId: currentProjectId.value,
      branchIdFromRoute,
    });
  };

  /**
   * @zh 离开分支工作空间，回到主分支
   * @en Leave the branch workspace and return to the main branch
   */
  const leaveBranch = (projectId = currentProjectId.value) => {
    if (projectId) profile.clearProjectBranchSelection(projectId);
    applyMain(projectId);
  };

  /**
   * @zh 当前分支已失效时清理 profile 并回到主分支。
   * @en Clear profile and return to the main branch when the current branch is stale.
   */
  const markStale = (projectId = currentProjectId.value) => {
    validationStatus.value = "stale";
    if (projectId) profile.clearProjectBranchSelection(projectId);
    applyMain(projectId);
  };

  return {
    currentProjectId,
    currentBranchId,
    currentPRId,
    currentPRNumber,
    currentBranchName,
    validationStatus,
    isOnBranch,
    isOnMainBranch,
    enterBranch,
    restoreProjectBranch,
    setBranchIdFromRoute,
    leaveBranch,
    markStale,
  };
});

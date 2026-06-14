import { useQuery } from "@pinia/colada";
import { defineStore, storeToRefs } from "pinia";
import { computed } from "vue";

import { orpc } from "@/rpc/orpc";
import { type BranchValidationStatus, useBranchStore } from "@/stores/branch";
import { useEditorContextStore } from "@/stores/editor/context";

/**
 * Project write mode.
 */
export type ProjectWriteMode = "direct" | "isolation" | "no_access";

/**
 * Project write capability state.
 */
export type WriteCapabilityState =
  | "branch-write"
  | "branch-pending"
  | "branch-stale"
  | "main-direct-write"
  | "main-blocked"
  | "no-access";

/**
 * Project write capability view.
 */
export type ProjectWriteCapability = {
  projectId: string;
  selectedBranchId: number | null;
  writeMode: ProjectWriteMode;
  state: WriteCapabilityState;
  target: "main" | "branch" | "blocked";
  branchId: number | null;
  canWrite: boolean;
  disabledReason: string | null;
};

/**
 * Resolve the current write capability from project write mode and branch state.
 *
 * @param input - Write capability resolution input
 * @returns - Resolved write capability
 */
export const resolveProjectWriteCapability = (input: {
  projectId: string;
  selectedBranchId: number | null;
  branchValidationStatus: BranchValidationStatus;
  writeMode: ProjectWriteMode;
}): ProjectWriteCapability => {
  if (input.writeMode === "no_access") {
    return {
      projectId: input.projectId,
      selectedBranchId: input.selectedBranchId,
      writeMode: input.writeMode,
      state: "no-access",
      target: "blocked",
      branchId: input.selectedBranchId,
      canWrite: false,
      disabledReason: "你没有此项目的编辑权限。",
    };
  }

  if (
    input.selectedBranchId !== null &&
    input.branchValidationStatus === "pending"
  ) {
    return {
      projectId: input.projectId,
      selectedBranchId: input.selectedBranchId,
      writeMode: input.writeMode,
      state: "branch-pending",
      target: "blocked",
      branchId: input.selectedBranchId,
      canWrite: false,
      disabledReason: "正在验证所选分支，请稍后。",
    };
  }

  if (
    input.selectedBranchId !== null &&
    input.branchValidationStatus === "stale"
  ) {
    return {
      projectId: input.projectId,
      selectedBranchId: input.selectedBranchId,
      writeMode: input.writeMode,
      state: "branch-stale",
      target: "blocked",
      branchId: input.selectedBranchId,
      canWrite: false,
      disabledReason: "所选分支已失效，已回到 main。",
    };
  }

  if (
    input.selectedBranchId !== null &&
    input.branchValidationStatus === "active"
  ) {
    return {
      projectId: input.projectId,
      selectedBranchId: input.selectedBranchId,
      writeMode: input.writeMode,
      state: "branch-write",
      target: "branch",
      branchId: input.selectedBranchId,
      canWrite: true,
      disabledReason: null,
    };
  }

  if (input.writeMode === "direct") {
    return {
      projectId: input.projectId,
      selectedBranchId: null,
      writeMode: input.writeMode,
      state: "main-direct-write",
      target: "main",
      branchId: null,
      canWrite: true,
      disabledReason: null,
    };
  }

  return {
    projectId: input.projectId,
    selectedBranchId: null,
    writeMode: input.writeMode,
    state: "main-blocked",
    target: "blocked",
    branchId: null,
    canWrite: false,
    disabledReason:
      "当前选择 main，但你的写入需要通过分支完成。请选择一个可写分支。",
  };
};

/**
 * Project write capability store.
 */
export const useProjectWriteCapabilityStore = defineStore(
  "projectWriteCapability",
  () => {
    const context = storeToRefs(useEditorContextStore());
    const branch = storeToRefs(useBranchStore());

    const { state, refresh } = useQuery({
      key: () => ["project-write-mode", context.projectId.value ?? null],
      query: async (): Promise<ProjectWriteMode> => {
        if (!context.projectId.value) return "no_access";
        return await orpc.permission.getProjectWriteMode({
          projectId: context.projectId.value,
        });
      },
      enabled: () => !import.meta.env.SSR && !!context.projectId.value,
      placeholderData: "no_access" as ProjectWriteMode,
    });

    const selectedBranchId = computed(() => {
      if (branch.currentProjectId.value !== context.projectId.value) {
        return null;
      }

      return branch.currentBranchId.value;
    });

    const branchValidationStatus = computed<BranchValidationStatus>(() => {
      if (branch.currentProjectId.value !== context.projectId.value) {
        return "main";
      }

      return branch.validationStatus.value;
    });

    const capability = computed(() => {
      const projectId = context.projectId.value;
      if (!projectId) {
        return null;
      }

      return resolveProjectWriteCapability({
        projectId,
        selectedBranchId: selectedBranchId.value,
        branchValidationStatus: branchValidationStatus.value,
        writeMode: state.value.data ?? "no_access",
      });
    });

    const canWrite = computed(() => capability.value?.canWrite ?? false);
    const disabledReason = computed(
      () => capability.value?.disabledReason ?? null,
    );

    return {
      capability,
      canWrite,
      disabledReason,
      refresh,
    };
  },
);

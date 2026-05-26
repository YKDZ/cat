import { defineStore } from "pinia";
import { ref } from "vue";

/**
 * @zh 按项目持久化的分支选择。
 * @en Persisted branch selection scoped by project.
 */
export type PersistedBranchSelection = {
  projectId: string;
  branchId: number;
  prId?: number | null;
  prNumber?: number | null;
  label?: string | null;
  updatedAt: string;
};

export const useProfileStore = defineStore(
  "profile",
  () => {
    const showBtnMagicKey = ref(true);
    const editorMemoryMinConfidence = ref([0.72]);
    const editorMemoryAutoCreateMemory = ref(true);

    /** Ghost text auto-suggest toggle */
    const ghostTextEnabled = ref(true);
    /**
     * 前端 fallback 策略：当 Ghost Text API 无预翻译结果时的回退行为。
     *
     * Frontend fallback strategy when Ghost Text API returns no pre-translate result.
     */
    const ghostTextFallbackStrategy = ref<
      "none" | "first-memory" | "first-suggestion" | "best-confidence"
    >("first-memory");

    const editorTermMinConfidence = ref([0.6]);
    const projectBranchSelections = ref<
      Record<string, PersistedBranchSelection>
    >({});

    const setProjectBranchSelection = (selection: PersistedBranchSelection) => {
      projectBranchSelections.value = {
        ...projectBranchSelections.value,
        [selection.projectId]: selection,
      };
    };

    const clearProjectBranchSelection = (projectId: string) => {
      const { [projectId]: _removed, ...rest } = projectBranchSelections.value;
      projectBranchSelections.value = rest;
    };

    return {
      showBtnMagicKey,
      editorMemoryMinConfidence,
      editorMemoryAutoCreateMemory,
      ghostTextEnabled,
      ghostTextFallbackStrategy,
      editorTermMinConfidence,
      projectBranchSelections,
      setProjectBranchSelection,
      clearProjectBranchSelection,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
    },
  },
);

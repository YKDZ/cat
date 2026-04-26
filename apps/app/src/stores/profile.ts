import { defineStore } from "pinia";
import { ref } from "vue";

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

    return {
      showBtnMagicKey,
      editorMemoryMinConfidence,
      editorMemoryAutoCreateMemory,
      ghostTextEnabled,
      ghostTextFallbackStrategy,
      editorTermMinConfidence,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
    },
  },
);

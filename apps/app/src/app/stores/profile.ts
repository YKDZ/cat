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
    /** Debounce delay for auto-triggering ghost text (ms) */
    const ghostTextDebounceMs = ref(800);
    /** Keyboard shortcut to manually trigger ghost text (human-readable) */
    const ghostTextTriggerKey = ref("Alt+\\");

    const editorTermMinConfidence = ref([0.6]);

    return {
      showBtnMagicKey,
      editorMemoryMinConfidence,
      editorMemoryAutoCreateMemory,
      ghostTextEnabled,
      ghostTextDebounceMs,
      ghostTextTriggerKey,
      editorTermMinConfidence,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
    },
  },
);

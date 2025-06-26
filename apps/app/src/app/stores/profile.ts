import { defineStore } from "pinia";
import { ref } from "vue";

export const useProfileStore = defineStore(
  "profile",
  () => {
    const showBtnMagicKey = ref<boolean>(true);
    const editorMemoryMinSimilarity = ref(0.72);

    return {
      showBtnMagicKey,
      editorMemoryMinSimilarity,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
    },
  },
);

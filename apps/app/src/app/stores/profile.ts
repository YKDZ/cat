import { defineStore } from "pinia";
import { ref } from "vue";

export const useProfileStore = defineStore("profile", () => {
  const showBtnMagicKey = ref<boolean>(true);

  return {
    showBtnMagicKey,
  };
});

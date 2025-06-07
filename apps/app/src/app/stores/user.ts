import type { User } from "@cat/shared";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUserStore = defineStore("user", () => {
  const user = ref<User | null>(null);

  return {
    user,
  };
});

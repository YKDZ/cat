import type { User } from "@cat/shared/schema/prisma/user";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useUserStore = defineStore("user", () => {
  const user = ref<User | null>(null);

  return {
    user,
  };
});

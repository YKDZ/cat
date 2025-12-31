import type { AuthMethod } from "@cat/shared/schema/misc";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useAuthStore = defineStore(
  "auth",
  () => {
    const identifier = ref("");
    const userId = ref<string | null>(null);
    const authMethod = ref<AuthMethod | null>(null);

    const isError = computed(() => false);

    return {
      identifier,
      authMethod,
      isError,
      userId,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
      pick: ["authMethod"],
    },
  },
);

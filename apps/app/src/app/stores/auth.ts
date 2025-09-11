import type { AuthMethod } from "@cat/shared/schema/misc";
import type { TRPCError } from "@trpc/server";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useAuthStore = defineStore(
  "auth",
  () => {
    const error = ref<TRPCError | null>(null);
    const authMethod = ref<AuthMethod | null>(null);

    const isError = computed(() => !!error.value);

    return {
      error,
      authMethod,
      isError,
    };
  },
  {
    persist: {
      storage: import.meta.env.SSR ? undefined : sessionStorage,
      pick: ["authMethod"],
    },
  },
);

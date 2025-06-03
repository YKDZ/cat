import { AuthMethod } from "@cat/shared";
import { TRPCError } from "@trpc/server";
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useAuthStore = defineStore("auth", () => {
  const error = ref<TRPCError | null>(null);
  const authMethod = ref<AuthMethod | null>(null);

  const setError = (e: TRPCError) => {
    error.value = e;
  };

  const setAuthMethod = (method: AuthMethod) => {
    authMethod.value = method;
  };

  const isError = computed(() => !!error.value);

  return {
    error,
    authMethod,
    isError,
    setError,
    setAuthMethod,
  };
});

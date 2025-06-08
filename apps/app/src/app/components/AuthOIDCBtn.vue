<script setup lang="ts">
import type { AuthMethod } from "@cat/shared";
import Button from "./Button.vue";
import { trpc } from "@/server/trpc/client";
import { useAuthStore } from "../stores/auth";
import { ref } from "vue";
import type { TRPCError } from "@trpc/server";

const props = defineProps<{
  method: AuthMethod;
}>();

const auth = useAuthStore();

const isLoading = ref<boolean>(false);

const handleAuth = () => {
  isLoading.value = true;
  auth.setAuthMethod(props.method);
  trpc.auth.preAuth
    .mutate({ providerId: "OIDC" })
    .then((passToClient) => {
      if (!passToClient.authURL) return;
      window.location.href = passToClient.authURL as string;
    })
    .catch((e: TRPCError) => {
      auth.setError(e);
    })
    .finally(() => (isLoading.value = false));
};
</script>

<template>
  <Button
    full-width
    :is-loading="isLoading"
    :icon="method.icon"
    @click="handleAuth"
  >
    使用 {{ method.name }} 登录或注册
  </Button>
</template>

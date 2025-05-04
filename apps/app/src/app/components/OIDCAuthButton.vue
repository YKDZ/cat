<script setup lang="ts">
import { AuthMethod } from "@cat/shared";
import Button from "./Button.vue";
import { trpc } from "@/server/trpc/client";
import { useAuthStore } from "../stores/auth";
import { ref } from "vue";
import { TRPCError } from "@trpc/server";

const props = defineProps<{
  method: AuthMethod;
}>();

const auth = useAuthStore();

const isLoading = ref<boolean>(false);

const handleAuth = () => {
  isLoading.value = true;
  auth.setAuthMethod(props.method);
  trpc.auth.oidc.init
    .query()
    .then(({ authURL }) => {
      window.location.href = authURL;
    })
    .catch((e: TRPCError) => {
      auth.setError(e);
    })
    .finally(() => (isLoading.value = false));
};
</script>

<template>
  <Button
    icon="i-mdi-transit-connection-variant"
    full-width
    :is-loading="isLoading"
    @click="handleAuth"
  >
    使用 {{ method.title }} 登录或注册</Button
  >
</template>

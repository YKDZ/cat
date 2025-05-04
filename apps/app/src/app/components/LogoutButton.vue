<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import { navigate } from "vike/client/router";
import Button from "./Button.vue";
import { ref } from "vue";

const { info, trpcWarn } = useToastStore();

const isProcessing = ref<boolean>(false);

const handleLogout = () => {
  if (isProcessing.value) return;

  isProcessing.value = true;
  info("登出中...");

  trpc.auth.oidc.logout
    .mutate()
    .then(() => {
      info("登出成功");
      info("即将前往主界面...");
      navigate("/");
    })
    .catch(trpcWarn)
    .finally(() => (isProcessing.value = false));
};
</script>

<template>
  <Button
    :is-processing
    full-width
    large
    left
    transparent
    icon="i-mdi:logout"
    @click="handleLogout"
  >
    登出
  </Button>
</template>

<script setup lang="ts">
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import { navigate } from "vike/client/router";
import Button from "./Button.vue";
import { ref } from "vue";
import { useI18n } from "vue-i18n";

const { t } = useI18n();
const { info, trpcWarn } = useToastStore();

const isProcessing = ref<boolean>(false);

const handleLogout = async () => {
  if (isProcessing.value) return;

  isProcessing.value = true;
  info(t("登出中..."));

  await trpc.auth.logout
    .mutate()
    .then(async () => {
      info(t("登出成功"));
      info(t("即将前往主界面..."));
      await navigate("/");
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
    {{ t("登出") }}
  </Button>
</template>

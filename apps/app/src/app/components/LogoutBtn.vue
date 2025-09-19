<script setup lang="ts">
import { navigate } from "vike/client/router";
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";

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
  <HButton
    :classes="{
      base: 'btn btn-md btn-left btn-w-full btn-transparent btn-none-rounded',
      icon: 'btn-icon btn-icon-lg',
    }"
    icon="i-mdi:logout"
    :loading="isProcessing"
    @click="handleLogout"
  >
    {{ t("登出") }}
  </HButton>
</template>

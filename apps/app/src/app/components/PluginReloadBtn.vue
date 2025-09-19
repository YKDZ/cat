<script setup lang="ts">
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import { trpc } from "@cat/app-api/trpc/client";
import { useToastStore } from "@/app/stores/toast.ts";

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const handleReload = async () => {
  await trpc.plugin.reload
    .mutate()
    .then(() => {
      info(t("成功重载所有插件"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <HButton
    icon="i-mdi:reload"
    :classes="{
      base: 'btn btn-md btn-base',
    }"
    @click="handleReload"
    >{{ t("重载插件") }}</HButton
  >
</template>

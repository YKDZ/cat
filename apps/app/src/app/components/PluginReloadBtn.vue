<script setup lang="ts">
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "../stores/toast";
import { trpc } from "@cat/app-api/trpc/client";
import type { ScopeType } from "@cat/db";

const { t } = useI18n();

const props = defineProps<{
  scopeType: ScopeType;
  scopeId: string;
}>();

const { info, trpcWarn } = useToastStore();

const handleReload = async () => {
  await trpc.plugin.reload
    .mutate({ scopeType: props.scopeType, scopeId: props.scopeId })
    .then(async () => {
      info(`成功重载所有插件`);
    })
    .catch(trpcWarn);
};
</script>

<template>
  <HButton
    :classes="{
      base: 'btn btn-md btn-base',
      icon: 'btn-icon',
    }"
    icon="icon-[mdi--reload]"
    @click="handleReload"
    >{{ t("重载插件") }}</HButton
  >
</template>

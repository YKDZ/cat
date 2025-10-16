<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@cat/app-api/trpc/client";

const { t } = useI18n();

const props = defineProps<{
  id: string;
}>();

const { info, trpcWarn } = useToastStore();

const handleDelete = async () => {
  await trpc.plugin.delete
    .mutate({ id: props.id })
    .then(async () => {
      info(`成功删除插件 ${props.id}`);
      await navigate(`/plugins`);
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
    icon="icon-[mdi--trash-can]"
    @click="handleDelete"
    >{{ t("删除插件") }}</HButton
  >
</template>

<script setup lang="ts">
import type { JSONType, PluginConfig, PluginConfigInstance } from "@cat/shared";
import JSONForm from "./json-form/JSONForm.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";

const props = defineProps<{
  config: PluginConfig;
  instance: PluginConfigInstance;
}>();

const { info, trpcWarn } = useToastStore();

const handleUpdate = async (to: JSONType) => {
  await trpc.plugin.upsertConfigInstance
    .mutate({
      scopeType: "GLOBAL",
      scopeId: "",
      scopeMeta: {},
      configId: props.config.id,
      value: to,
    })
    .then(() => {
      info(`成功将配置 ${props.config.key} 修改为 ${to}`);
    })
    .catch(trpcWarn);
};
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span>{{ config.key }}</span>
    <JSONForm
      :data="instance.value"
      :schema="config.schema"
      @update="handleUpdate"
    />
  </div>
</template>

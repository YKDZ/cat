<script setup lang="ts">
import {
  JSONSchemaSchema,
  type JSONType,
  type PluginConfig,
  type PluginConfigInstance,
} from "@cat/shared";
import JSONForm from "./json-form/JSONForm.vue";
import { trpc } from "@/server/trpc/client";
import { useToastStore } from "../stores/toast";
import { onMounted, ref } from "vue";

const { info, trpcWarn } = useToastStore();

const props = defineProps<{
  config: PluginConfig;
}>();

const instance = ref<PluginConfigInstance | null>(null);

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

const getInstance = async () => {
  return await trpc.plugin.queryConfigInstance
    .query({
      scopeType: "GLOBAL",
      scopeId: "",
      configId: props.config.id,
    })
    .catch(trpcWarn);
};

onMounted(async () => {
  await getInstance().then((instanceData) => {
    instance.value = instanceData || null;
  });
});
</script>

<template>
  <div class="flex flex-col gap-0.5">
    <span>{{ config.key }}</span>
    <JSONForm
      :data="instance?.value ?? {}"
      :schema="JSONSchemaSchema.parse(config.schema)"
      @update="handleUpdate"
    />
  </div>
</template>

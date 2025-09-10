<script setup lang="ts">
import type {
  JSONSchema} from "@cat/shared";
import {
  type JSONType,
  type PluginConfig,
  type PluginConfigInstance,
} from "@cat/shared";
import { trpc } from "@/server/trpc/client";
import { ref } from "vue";
import type { ScopeType } from "@cat/db";
import SettingForm from "./SettingForm.vue";
import { navigate } from "vike/client/router";

const props = defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();

const instance = ref<PluginConfigInstance | null>(null);

const configSetter = async (
  value: JSONType,
  schema: JSONSchema,
  key?: string,
) => {
  await trpc.plugin.upsertConfigInstance.mutate({
    pluginId: props.config.pluginId,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
    configId: props.config.id,
    value,
  });
};

const configGetter = async () => {
  return await trpc.plugin.queryConfigInstance
    .query({
      pluginId: props.config.pluginId,
      scopeType: props.scopeType,
      scopeId: props.scopeId,
      configId: props.config.id,
    })
    .then(async (data) => {
      if (!data) {
        await navigate("/");
        return {};
      }
      instance.value = data;
      return data.value;
    });
};
</script>

<template>
  <SettingForm
    :schema="config.schema"
    :config-setter="configSetter"
    :config-getter="configGetter"
  />
</template>

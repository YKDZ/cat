<script setup lang="ts">
import {
  JSONSchemaSchema,
  getDefaultFromSchema,
  nonNullSafeZDotJson,
  type NonNullJSONType,
  type PluginConfig,
  type PluginConfigInstance,
  type ScopeType,
} from "@cat/shared";
import { ref } from "vue";

import { orpc } from "@/rpc/orpc";

import SettingForm from "./SettingForm.vue";

const props = defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();

const instance = ref<PluginConfigInstance | null>(null);

const defaultValue = (): NonNullJSONType => {
  const schema = JSONSchemaSchema.parse(props.config.schema);
  return nonNullSafeZDotJson.parse(getDefaultFromSchema(schema) ?? {});
};

const configSetter = async (value: NonNullJSONType) => {
  const result = await orpc.plugin.saveConfigAndApply({
    pluginId: props.config.pluginId,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
    value,
    expectedUpdatedAt: instance.value?.updatedAt.toISOString() ?? null,
  });
  if (result.configInstance) instance.value = result.configInstance;
};

const configGetter = async () => {
  return await orpc.plugin
    .getConfigInstance({
      pluginId: props.config.pluginId,
      scopeType: props.scopeType,
      scopeId: props.scopeId,
    })
    .then((data) => {
      if (!data) {
        return defaultValue();
      }
      instance.value = data;
      return data.value;
    });
};

const handleSaved = async () => {
  return;
};
</script>

<template>
  <SettingForm
    :schema="config.schema"
    :config-setter="configSetter"
    :config-getter="configGetter"
    :on-saved="handleSaved"
  />
</template>

<script setup lang="ts">
import type {
  PluginConfig,
  PluginConfigInstance,
} from "@cat/shared/schema/drizzle/plugin";
import type { ScopeType } from "@cat/shared/schema/enum";
import type { JSONType } from "@cat/shared/schema/json";

import { navigate } from "vike/client/router";
import { ref } from "vue";

import { orpc } from "@/app/rpc/orpc";

import SettingForm from "./SettingForm.vue";

const props = defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();


const instance = ref<PluginConfigInstance | null>(null);


const configSetter = async (value: JSONType) => {
  await orpc.plugin.upsertConfigInstance({
    pluginId: props.config.pluginId,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
    value,
  });
};


const configGetter = async () => {
  return await orpc.plugin
    .getConfigInstance({
      pluginId: props.config.pluginId,
      scopeType: props.scopeType,
      scopeId: props.scopeId,
    })
    .then(async (data) => {
      if (!data) {
        await navigate("/");
        return {};
      }
      instance.value = data as PluginConfigInstance;
      return data.value;
    });
};


const handleSaved = async () => {
  await orpc.plugin.reloadPlugin({
    pluginId: props.config.pluginId,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
  });
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

<script setup lang="ts">
import type { JSONType } from "@cat/shared/schema/json";
import type {
  PluginConfig,
  PluginConfigInstance,
} from "@cat/shared/schema/drizzle/plugin";
import { ref } from "vue";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import SettingForm from "./SettingForm.vue";
import type { ScopeType } from "@cat/shared/schema/drizzle/enum";

const props = defineProps<{
  config: PluginConfig;
  scopeType: ScopeType;
  scopeId: string;
}>();

const instance = ref<PluginConfigInstance | null>(null);

const configSetter = async (value: JSONType) => {
  await trpc.plugin.upsertConfigInstance.mutate({
    pluginId: props.config.pluginId,
    scopeType: props.scopeType,
    scopeId: props.scopeId,
    value,
  });
};

const configGetter = async () => {
  return await trpc.plugin.getConfigInstance
    .query({
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
</script>

<template>
  <SettingForm
    :schema="config.schema"
    :config-setter="configSetter"
    :config-getter="configGetter"
  />
</template>

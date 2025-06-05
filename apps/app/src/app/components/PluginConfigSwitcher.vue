<script setup lang="ts">
import { PluginConfig } from "@cat/shared";
import { computed } from "vue";
import PluginConfigString from "./PluginConfigString.vue";
import PluginConfigNumber from "./PluginConfigNumber.vue";
import PluginConfigURL from "./PluginConfigURL.vue";
import PluginConfigBoolean from "./PluginConfigBoolean.vue";

const props = defineProps<{
  config: PluginConfig;
}>();

const is = computed(() => {
  switch (props.config.type) {
    case "string":
      return PluginConfigString;
    case "number":
      return PluginConfigNumber;
    case "url":
      return PluginConfigURL;
    case "boolean":
      return PluginConfigBoolean;
    default:
      return PluginConfigString;
  }
});
</script>

<template>
  <component :is :plugin-id="config.pluginId" :config-key="config.key" />
</template>

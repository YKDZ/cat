<script setup lang="ts">
import type { ComponentRecord } from "@cat/plugin-core";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onBeforeMount } from "vue";
import { createSandbox } from "@cat/plugin-core/client";
import { logger } from "@cat/shared/utils";

const props = defineProps<{
  component: ComponentRecord;
}>();

const ctx = usePageContext();

const registeredName = computed(() => {
  return props.component.pluginId + "-" + props.component.name;
});

const url = computed(() => {
  if (props.component.url.startsWith("http")) return props.component.url;
  const result = new URL(
    "/_plugin/" +
      props.component.pluginId +
      "/component/" +
      props.component.name,
    ctx.globalContext.baseURL,
  );
  result.searchParams.append("path", props.component.url);
  return result.href;
});

const load = async () => {
  try {
    const response = await fetch(url.value);
    const code = await response.text();
    const sandbox = createSandbox(props.component.pluginId, window);
    sandbox.evaluate(code);
  } catch (e) {
    logger.error("WEB", { msg: "Failed to evaluate sandbox code" }, e);
  }
};

onBeforeMount(load);
</script>

<template>
  <component
    :is="registeredName"
    :key="registeredName"
    style="display: block"
  />
</template>

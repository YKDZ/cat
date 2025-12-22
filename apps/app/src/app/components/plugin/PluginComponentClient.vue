<script setup lang="ts">
import type { ComponentRecord } from "@cat/plugin-core";
import { usePageContext } from "vike-vue/usePageContext";
import { onActivated, onMounted } from "vue";

const props = defineProps<{
  component: ComponentRecord;
}>();

const ctx = usePageContext();

const parseURL = (url: string, id: string, pluginId: string) => {
  if (url.startsWith("http")) return url;
  const result = new URL(
    "/_plugin/" + pluginId + "/component/" + id,
    ctx.globalContext.baseURL,
  );
  result.searchParams.append("path", url);
  return result.href;
};

onMounted(async () => {
  if (!customElements.get(props.component.name)) {
    const module = await import(
      /* @vite-ignore */ parseURL(
        props.component.url,
        props.component.name,
        props.component.pluginId,
      ),
    );
    if (!customElements.get(props.component.name)) {
      customElements.define(props.component.name, module.default);
    }
  }
});

onActivated(async () => {
  if (!customElements.get(props.component.name)) {
    const module = await import(
      /* @vite-ignore */ parseURL(
        props.component.url,
        props.component.name,
        props.component.pluginId,
      ),
    );
    if (!customElements.get(props.component.name)) {
      customElements.define(props.component.name, module.default);
    }
  }
});
</script>

<template>
  <component :is="component.name" :key="component.name" style="display: block" />
</template>

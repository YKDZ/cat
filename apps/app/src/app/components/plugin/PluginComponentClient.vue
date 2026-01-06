<script setup lang="ts">
import type { ComponentRecord } from "@cat/plugin-core";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onBeforeMount } from "vue";
import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";
import { logger } from "@cat/shared/utils";
import * as Vue from "vue";

const props = defineProps<{
  component: ComponentRecord;
}>();

const ctx = usePageContext();

const scopedName = computed(() => {
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
  const registry = new Map<
    string,
    {
      constructor: CustomElementConstructor;
      options?: ElementDefinitionOptions;
    }
  >();

  try {
    const response = await fetch(url.value);
    const code = await response.text();

    const sandbox = createSandbox(props.component.pluginId, window, {
      globalContextBuilder: (pluginId, win) => ({
        customElements: safeCustomElements(registry),
        Vue: { ...Vue },
        fetch: window.fetch,
        console: window.console,
      }),
    });

    sandbox.evaluate(code);
  } catch (e) {
    logger.error("WEB", { msg: "Failed to evaluate sandbox code" }, e);
  }

  // TODO 逻辑上暂时不允许一次注册多个组件
  if (registry.size > 1 || registry.size === 0) {
    logger.warn("WEB", {
      msg: `Plugin registered component enrty script should define only one component. Bot got ${registry.size}`,
    });
  }

  const [name, { constructor, options }] = registry.entries().next().value!;

  if (name !== props.component.name) {
    logger.warn("WEB", {
      msg: `Component name mismatch. Claimed ${props.component.name}, but got ${name}`,
    });
  }

  if (!customElements.get(name))
    customElements.define(scopedName.value, constructor, options);
};

onBeforeMount(load);
</script>

<template>
  <component :is="scopedName" :key="scopedName" style="display: block" />
</template>

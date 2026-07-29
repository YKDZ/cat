<script setup lang="ts">
import type { ComponentRecord } from "@cat/plugin-core";
import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onBeforeMount } from "vue";
import * as Vue from "vue";

import { clientLogger as logger } from "#/utils/logger.ts";

const props = defineProps<{
  component: ComponentRecord;
}>();

const ctx = usePageContext();

const scopedName = computed(() => {
  return props.component.pluginId + "-" + props.component.name;
});

const url = computed(() => {
  if (props.component.url.startsWith("http")) return props.component.url;
  const baseURL =
    typeof window === "undefined"
      ? ctx.globalContext.baseURL
      : window.location.origin;
  const result = new URL(
    "/_plugin/" +
      props.component.pluginId +
      "/component/" +
      props.component.name,
    baseURL,
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
    if (!response.ok) {
      throw new Error(
        `Plugin component request failed with ${response.status}`,
      );
    }
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
    logger
      .child({ component: "web" })
      .error("Failed to evaluate sandbox code", { error: e });
  }

  // Component entries currently register exactly one custom element.
  if (registry.size !== 1) {
    logger
      .child({ component: "web" })
      .warn(
        `Plugin registered component enrty script should define only one component. Bot got ${registry.size}`,
      );
    return;
  }

  const entry = registry.entries().next().value;
  if (entry === undefined) return;
  const [name, { constructor, options }] = entry;

  if (name !== props.component.name) {
    logger
      .child({ component: "web" })
      .warn(
        `Component name mismatch. Claimed ${props.component.name}, but got ${name}`,
      );
  }

  if (!customElements.get(name))
    customElements.define(scopedName.value, constructor, options);
};

onBeforeMount(load);
</script>

<template>
  <component :is="scopedName" :key="scopedName" style="display: block" />
</template>

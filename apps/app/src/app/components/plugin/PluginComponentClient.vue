<script setup lang="ts">
import type { ComponentRecord } from "@cat/plugin-core";

import { createSandbox, safeCustomElements } from "@cat/plugin-core/client";
import { usePageContext } from "vike-vue/usePageContext";
import { computed, onBeforeMount } from "vue";
import * as Vue from "vue";

import { clientLogger as logger } from "@/app/utils/logger";

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
    logger
      .withSituation("WEB")
      .error({ msg: "Failed to evaluate sandbox code" }, e);
  }


  // TODO 逻辑上暂时不允许一次注册多个组件
  if (registry.size > 1 || registry.size === 0) {
    logger.withSituation("WEB").warn({
      msg: `Plugin registered component enrty script should define only one component. Bot got ${registry.size}`,
    });
  }


  const [name, { constructor, options }] = registry.entries().next().value!;


  if (name !== props.component.name) {
    logger.withSituation("WEB").warn({
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

<script setup lang="ts">
import { PluginComponent } from "@cat/shared";
import { usePageContext } from "vike-vue/usePageContext";
import {
  AsyncComponentLoader,
  defineAsyncComponent,
  onBeforeMount,
  onServerPrefetch,
  shallowRef,
} from "vue";

const props = defineProps<{
  component: PluginComponent;
}>();

const ctx = usePageContext();

const AsyncComponent = shallowRef<AsyncComponentLoader>();

const joinUrl = (base: string, ...parts: string[]): string => {
  const allParts = [base, ...parts].map((part, index) => {
    if (index === 0) {
      return part.replace(/\/+$/, "");
    } else {
      return part.replace(/^\/+/, "").replace(/\/+$/, "");
    }
  });

  const url = allParts.join("/");

  return url.replace(/^(https?:)\/+/, "$1//");
};

onBeforeMount(() => {
  const url = joinUrl(
    import.meta.env.PUBLIC_ENV__URL ?? "",
    "__internal/plugin/components",
    props.component.pluginId,
    props.component.file.replace("/", "@@@"),
  );
  AsyncComponent.value = defineAsyncComponent(
    () => import(/* @vite-ignore */ url),
  );
});

onServerPrefetch(async () => {
  if (ctx.isClientSide) return;

  const { PluginRegistry } = await import("@cat/plugin-core");
  const { join } = await import("path");

  const path = `file:///${join(PluginRegistry.getPlugiFsPath(props.component.pluginId), props.component.file)}`;

  AsyncComponent.value = defineAsyncComponent(
    () => import(/* @vite-ignore */ path),
  );
});
</script>

<template>
  <component :is="AsyncComponent" />
</template>

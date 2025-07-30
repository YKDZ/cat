<script setup lang="ts">
import { safeJoinURL, type PluginComponent } from "@cat/shared";
import { usePageContext } from "vike-vue/usePageContext";
import * as Vue from "vue";
import * as VueSSR from "vue/server-renderer";
import { defineAsyncComponent, onServerPrefetch, onBeforeMount } from "vue";

globalThis["vue"] = Vue;
globalThis["vue/server-renderer"] = VueSSR;

const props = defineProps<{
  component: PluginComponent;
}>();

const ctx = usePageContext();

// eslint-disable-next-line @typescript-eslint/naming-convention
let AsyncComponent: Vue.AsyncComponentLoader | null = null;

onServerPrefetch(async () => {
  if (!ctx.isClientSide) {
    const path = await ctx.pluginRegistry.getPluginComponentFsPath(
      props.component.pluginId,
      props.component.id,
    );
    AsyncComponent = defineAsyncComponent(
      () => import(/* @vite-ignore */ path),
    );
  }
});

onBeforeMount(async () => {
  AsyncComponent = defineAsyncComponent(
    () =>
      import(
        /* @vite-ignore */
        safeJoinURL(
          window.location.origin,
          `/api/__plugin/component/${props.component.pluginId}/${props.component.id}`,
        )
      ),
  );
});
</script>

<template>
  <Suspense> <component :is="AsyncComponent" /></Suspense>
</template>

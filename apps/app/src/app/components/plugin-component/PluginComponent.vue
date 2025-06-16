<script setup lang="ts">
import { type PluginComponent } from "@cat/shared";
import { usePageContext } from "vike-vue/usePageContext";
import type { Component } from "vue";
import * as Vue from "vue";
import {
  defineAsyncComponent,
  onMounted,
  onServerPrefetch,
  shallowRef,
} from "vue";

globalThis.vue = Vue;

const props = defineProps<{
  component: PluginComponent;
}>();

const ctx = usePageContext();

const AsyncComponent = shallowRef<Component | null>(null);

onServerPrefetch(async () => {
  if (ctx.isClientSide) return;
  const path = await ctx.pluginRegistry.getPluginComponentFsPath(
    props.component.pluginId,
    props.component.id,
  );
  AsyncComponent.value = defineAsyncComponent(
    () => import(/* @vite-ignore */ path),
  );
});

onMounted(async () => {
  AsyncComponent.value = defineAsyncComponent(
    () =>
      import(
        /* @vite-ignore */
        `http://localhost:3000/api/__plugin/component/${props.component.pluginId}/${props.component.id}`
      ),
  );
});
</script>

<template>
  <Suspense> <AsyncComponent /></Suspense>
</template>

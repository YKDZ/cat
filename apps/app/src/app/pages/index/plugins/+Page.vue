<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import { onMounted, ref } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginList from "@/app/components/PluginList.vue";

const plugins = ref<WithRequired<Plugin, "Installations">[]>(
  useData<Data>().plugins,
);

const updatePlugins = async () => {};

onMounted(updatePlugins);
</script>

<template>
  <PluginList :plugins path-prefix="/plugin" />
</template>

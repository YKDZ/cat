<script setup lang="ts">
import PluginList from "@/app/components/PluginList.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import type { Plugin } from "@cat/shared";
import { onMounted, ref } from "vue";
import type { Data } from "./+data";
import { useData } from "vike-vue/useData";

const { trpcWarn } = useToastStore();

const plugins = ref<Plugin[]>(useData<Data>().plugins);

const updatePlugins = async () => {
  await trpc.plugin.listAllWithOverridableConfig
    .query()
    .then((pls) => {
      plugins.value = pls;
    })
    .catch(trpcWarn);
};

onMounted(updatePlugins);
</script>

<template>
  <PluginList :plugins path-prefix="/plugin" />
</template>

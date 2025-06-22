<script setup lang="ts">
import PluginImportBtn from "@/app/components/PluginImportBtn.vue";
import PluginList from "@/app/components/PluginList.vue";
import PluginReloadBtn from "@/app/components/PluginReloadBtn.vue";
import { useToastStore } from "@/app/stores/toast";
import { trpc } from "@/server/trpc/client";
import type { Plugin } from "@cat/shared";
import { onMounted, ref } from "vue";
import type { Data } from "./+data";
import { useData } from "vike-vue/useData";

const { trpcWarn } = useToastStore();

const plugins = ref<Plugin[]>(useData<Data>().plugins);

const updatePlugins = async () => {
  await trpc.plugin.listAll
    .query()
    .then((pls) => {
      plugins.value = pls;
    })
    .catch(trpcWarn);
};

onMounted(updatePlugins);
</script>

<template>
  <div class="flex gap-2 items-center">
    <PluginImportBtn />
    <PluginReloadBtn />
  </div>
  <PluginList :plugins path-prefix="/admin/plugin" />
</template>

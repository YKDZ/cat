<script setup lang="ts">
import type { Plugin } from "@cat/shared/schema/prisma/plugin";
import { onMounted, ref } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginList from "@/app/components/PluginList.vue";
import PluginReloadBtn from "@/app/components/PluginReloadBtn.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@/server/trpc/client.ts";

const { trpcWarn } = useToastStore();

const plugins = ref<WithRequired<Plugin, "Installations">[]>(
  useData<Data>().plugins,
);

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
    <PluginReloadBtn />
  </div>
  <PluginList :plugins path-prefix="/admin/plugin" />
</template>

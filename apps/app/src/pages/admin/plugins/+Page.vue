<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import PluginList from "@/components/PluginList.vue";
import PluginReloadBtn from "@/components/PluginReloadBtn.vue";

const { plugins } = useData<Data>();
</script>

<template>
  <PluginReloadBtn scope-type="GLOBAL" scope-id="" />
  <PluginList
    :plugins
    scope-type="GLOBAL"
    scope-id=""
    path-prefix="/admin/plugin"
  />
</template>

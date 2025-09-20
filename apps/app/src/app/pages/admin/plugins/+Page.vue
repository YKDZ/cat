<script setup lang="ts">
import { ref } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginList from "@/app/components/PluginList.vue";

const plugins = ref(useData<Data>().plugins);
</script>

<template>
  <PluginList :plugins path-prefix="/admin/plugin" />
</template>

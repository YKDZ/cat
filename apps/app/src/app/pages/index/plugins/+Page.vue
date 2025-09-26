<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import PluginList from "@/app/components/PluginList.vue";

const { plugins } = useData<Data>();
</script>

<template>
  <PluginList :plugins path-prefix="/plugin" />
</template>

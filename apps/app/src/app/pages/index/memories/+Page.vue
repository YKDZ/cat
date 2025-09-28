<script setup lang="ts">
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import MemoryList from "@/app/components/MemoryList.vue";

const { memories } = useData<Data>();
</script>

<template>
  <MemoryList v-model="memories" />
</template>

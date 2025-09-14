<script setup lang="ts">
import MemoryList from "@/app/components/MemoryList.vue";
import type { Data } from "./+data.ts";
import { useData } from "vike-vue/useData";

const { memories } = useData<Data>();
</script>

<template>
  <MemoryList v-model="memories" />
</template>

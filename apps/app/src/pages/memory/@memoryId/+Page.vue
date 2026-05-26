<script setup lang="ts">
import { useData } from "vike-vue/useData";

import type { Data } from "./+data.server";

import MemoryItemTable from "./MemoryItemTable.vue";

const { memory } = useData<Data>();
</script>

<template>
  <MemoryItemTable :memory-id="memory.id" />
</template>

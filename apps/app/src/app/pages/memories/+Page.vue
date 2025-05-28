<script setup lang="ts">
import MemoryList from "@/app/components/MemoryList.vue";
import { useMemoryStore } from "@/app/stores/memory";
import { storeToRefs } from "pinia";

const { memories } = storeToRefs(useMemoryStore());
</script>

<template>
  <MemoryList v-model="memories" />
</template>

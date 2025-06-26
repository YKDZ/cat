<script setup lang="ts">
import type { Memory } from "@cat/shared";
import IndexSidebar from "../components/IndexSidebar.vue";
import { provide, ref, watch } from "vue";
import { usePageContext } from "vike-vue/usePageContext";
import { storeToRefs } from "pinia";
import { memoryKey } from "../utils/provide";
import { useMemoryStore } from "../stores/memory";
import MemoryHeader from "../components/MemoryHeader.vue";

const ctx = usePageContext();

const memory = ref<Memory | null>(null);

provide(memoryKey, memory);

const { memories } = storeToRefs(useMemoryStore());

watch(
  () => ctx.routeParams,
  () => {
    memory.value =
      memories.value.find((memory) => memory.id === ctx.routeParams.memoryId) ??
      null;
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <MemoryHeader />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

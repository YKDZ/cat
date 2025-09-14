<script setup lang="ts">
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import MemoryHeader from "@/app/components/MemoryHeader.vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import { provide } from "vue";
import { memoryKey } from "@/app/utils/provide.ts";

const { memory } = useData<Data>();

provide(memoryKey, memory);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <MemoryHeader />
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

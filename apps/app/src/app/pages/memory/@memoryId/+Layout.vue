<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import type { Data } from "./+data.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import MemoryHeader from "@/app/components/MemoryHeader.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { memory } = useData<Data>();

provide(useInjectionKey<Data>("memory"), memory);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <MemoryHeader :memory />
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

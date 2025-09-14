<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import type { Data } from "./+data.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import IndexHeader from "@/app/components/IndexHeader.vue";
import { pluginKey } from "@/app/utils/provide.ts";

const { plugin } = useData<Data>();

provide(pluginKey, plugin);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-x-hidden">
      <IndexHeader />
      <!-- Content -->
      <div class="p-4 flex flex-col gap-2">
        <slot />
      </div>
    </div>
  </div>
</template>

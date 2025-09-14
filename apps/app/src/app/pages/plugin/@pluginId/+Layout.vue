<script setup lang="ts">
import IndexHeader from "../components/IndexHeader.vue";
import IndexSidebar from "../components/IndexSidebar.vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import { provide } from "vue";
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

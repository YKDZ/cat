<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";

import IndexHeader from "@/app/components/IndexHeader.vue";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import { pluginKey } from "@/app/utils/provide.ts";

import type { Data } from "./+data.server.ts";

const { plugin } = useData<Data>();


provide(pluginKey, plugin);
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <IndexSidebar />
    <div class="flex h-full w-full flex-col overflow-x-hidden">
      <IndexHeader />
      <!-- Content -->
      <div class="flex flex-col gap-2 p-4">
        <slot />
      </div>
    </div>
  </div>
</template>

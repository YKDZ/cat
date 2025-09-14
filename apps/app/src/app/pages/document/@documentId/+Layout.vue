<script setup lang="ts">
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import { provide } from "vue";
import { documentKey } from "@/app/utils/provide";
import DocumentHeader from "@/app/components/DocumentHeader.vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";

const { document } = useData<Data>();

provide(documentKey, document);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <DocumentHeader />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

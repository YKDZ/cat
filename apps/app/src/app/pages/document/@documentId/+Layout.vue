<script setup lang="ts">
import { provide } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import { documentKey } from "@/app/utils/provide.ts";
import DocumentHeader from "@/app/components/DocumentHeader.vue";

const { document } = useData<Data>();

provide(documentKey, document);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <DocumentHeader />
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

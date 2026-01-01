<script setup lang="ts">
import { provide } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.server.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import Header from "./Header.vue";

const { document } = useData<Data>();

provide(useInjectionKey<Data>()("document"), document);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <Header :document />
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

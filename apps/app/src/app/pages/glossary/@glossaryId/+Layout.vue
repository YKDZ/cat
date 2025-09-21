<script setup lang="ts">
import { provide } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import GlossaryHeader from "@/app/components/GlossaryHeader.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { glossary } = useData<Data>();

provide(useInjectionKey<Data>("glossary"), glossary);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <GlossaryHeader :glossary />
      <div class="p-4 pt-0 flex flex-col">
        <slot />
      </div>
    </div>
  </div>
</template>

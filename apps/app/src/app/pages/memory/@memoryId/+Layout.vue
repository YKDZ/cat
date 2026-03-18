<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";

import IndexSidebar from "@/app/components/IndexSidebar.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

import type { Data } from "./+data.server.ts";

import Header from "./Header.vue";

const { memory } = useData<Data>();


provide(useInjectionKey<Data>()("memory"), memory);
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <IndexSidebar />
    <div class="flex h-full w-full flex-col overflow-y-auto">
      <Header :memory />
      <div class="flex flex-col p-4 pt-0">
        <slot />
      </div>
    </div>
  </div>
</template>

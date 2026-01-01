<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import type { Data } from "./+data.server.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import Header from "./Header.vue";
import Navbar from "./Navbar.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";
import { Separator } from "@/app/components/ui/separator";

const { project, targetLanguages, documents } = useData<Data>();

provide(useInjectionKey<Data>()("project"), project);
provide(useInjectionKey<Data>()("targetLanguages"), targetLanguages);
provide(useInjectionKey<Data>()("documents"), documents);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <Header :project />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <Navbar :project />
        <Separator />
        <slot />
      </div>
    </div>
  </div>
</template>

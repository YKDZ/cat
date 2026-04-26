<script setup lang="ts">
import { Separator } from "@cat/ui";
import { useData } from "vike-vue/useData";
import { provide } from "vue";

import IndexSidebar from "@/components/IndexSidebar.vue";
import { useInjectionKey } from "@/utils/provide.ts";

import type { Data } from "./+data.server.ts";

import Header from "./Header.vue";
import Navbar from "./Navbar.vue";

const { project, targetLanguages, documents } = useData<Data>();

provide(useInjectionKey<Data>()("project"), project);
provide(useInjectionKey<Data>()("targetLanguages"), targetLanguages);
provide(useInjectionKey<Data>()("documents"), documents);
</script>

<template>
  <div class="flex h-full w-full flex-col md:flex-row">
    <IndexSidebar />
    <div class="flex h-full w-full flex-col overflow-y-auto">
      <Header :project />
      <!-- Content -->
      <div class="flex min-h-0 flex-1 flex-col overflow-hidden px-4">
        <div class="shrink-0 pt-0">
          <Navbar :project />
          <Separator />
        </div>
        <div class="flex min-h-0 flex-1 flex-col overflow-y-auto py-4">
          <slot />
        </div>
      </div>
    </div>
  </div>
</template>

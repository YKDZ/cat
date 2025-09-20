<script setup lang="ts">
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import { type Data } from "./+data.ts";
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import ProjectHeader from "@/app/components/ProjectHeader.vue";
import ProjectNavbar from "@/app/components/ProjectNavbar.vue";
import { useInjectionKey } from "@/app/utils/provide.ts";

const { project } = useData<Data>();

provide(useInjectionKey<Data>("project"), project);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <ProjectHeader :project />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <ProjectNavbar :project />
        <slot />
      </div>
    </div>
  </div>
</template>

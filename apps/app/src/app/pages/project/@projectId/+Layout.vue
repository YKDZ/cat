<script setup lang="ts">
import IndexSidebar from "@/app/components/IndexSidebar.vue";
import ProjectHeader from "@/app/components/ProjectHeader.vue";
import ProjectNavbar from "@/app/components/ProjectNavbar.vue";
import type { Data } from "./+data.ts";
import { useData } from "vike-vue/useData";
import { provide } from "vue";
import { projectKey } from "@/app/utils/provide.ts";

const { project } = useData<Data>();

provide(projectKey, project);
</script>

<template>
  <div class="flex flex-col h-full w-full md:flex-row">
    <IndexSidebar />
    <div class="flex flex-col h-full w-full overflow-y-auto">
      <ProjectHeader />
      <!-- Content -->
      <div class="p-4 pt-0 flex flex-col">
        <ProjectNavbar />
        <slot />
      </div>
    </div>
  </div>
</template>

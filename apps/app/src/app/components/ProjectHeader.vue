<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import type { Project } from "@cat/shared/schema/drizzle/project";
import ProjectBreadcrumb from "./ProjectBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  project: Project;
}>();

const ctx = usePageContext();
</script>

<template>
  <div class="header">
    <SidebarTrigger />
    <ProjectBreadcrumb v-if="project" :project />
    <div v-else class="text-lg font-500 flex items-center">
      {{ ctx.user?.name }}
    </div>
  </div>
</template>

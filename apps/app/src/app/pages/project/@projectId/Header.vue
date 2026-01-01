<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import type { Project } from "@cat/shared/schema/drizzle/project";
import HeaderBreadcrumb from "./HeaderBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

defineProps<{
  project: Project;
}>();

const ctx = usePageContext();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <HeaderBreadcrumb v-if="project" :project />
    <div v-else class="text-lg font-500 flex items-center">
      {{ ctx.user?.name }}
    </div>
  </div>
</template>

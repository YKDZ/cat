<script setup lang="ts">
import type { Project } from "@cat/shared/schema/drizzle/project";

import { SidebarTrigger } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";

import HeaderBreadcrumb from "./HeaderBreadcrumb.vue";

defineProps<{
  project: Project;
}>();


const ctx = usePageContext();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <HeaderBreadcrumb v-if="project" :project />
    <div v-else class="font-500 flex items-center text-lg">
      {{ ctx.user?.name }}
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Project } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";

import NotificationInbox from "@/app/components/NotificationInbox.vue";

import HeaderBreadcrumb from "./HeaderBreadcrumb.vue";

defineProps<{
  project: Project;
}>();

const ctx = usePageContext();
</script>

<template>
  <div class="header flex items-center">
    <SidebarTrigger sidebar-id="index" />
    <div class="flex flex-1 items-center justify-between">
      <HeaderBreadcrumb v-if="project" :project />
      <div v-else class="font-500 flex items-center text-lg">
        {{ ctx.user?.name }}
      </div>
      <NotificationInbox />
    </div>
  </div>
</template>

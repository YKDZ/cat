<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";

import DocumentBreadcrumb from "@/components/DocumentBreadcrumb.vue";

const props = defineProps<{
  document: Pick<ContentNode, "displayLabel">;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <DocumentBreadcrumb :document />
  </div>
</template>

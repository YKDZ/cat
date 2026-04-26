<script setup lang="ts">
import type { Document } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";

import DocumentBreadcrumb from "@/components/DocumentBreadcrumb.vue";

const props = defineProps<{
  document: Pick<Document, "name">;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <DocumentBreadcrumb :document />
  </div>
</template>

<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";

import { SidebarTrigger } from "@cat/ui";

import DocumentBreadcrumb from "@/app/components/DocumentBreadcrumb.vue";

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

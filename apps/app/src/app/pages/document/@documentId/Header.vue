<script setup lang="ts">
import DocumentBreadcrumb from "@/app/components/DocumentBreadcrumb.vue";
import { SidebarTrigger } from "@/app/components/ui/sidebar";
import type { Document } from "@cat/shared/schema/drizzle/document";

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

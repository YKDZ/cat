<script setup lang="ts">
import { storeToRefs } from "pinia";
import DocumentBreadcrumb from "./DocumentBreadcrumb.vue";
import { useEditorContextStore } from "@/app/stores/editor/context.ts";
import { SidebarTrigger } from "@/app/components/ui/sidebar";

const { document } = storeToRefs(useEditorContextStore());
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebarId="editor" />
    <div class="flex w-full justify-between">
      <DocumentBreadcrumb v-if="document" :document />
      <SidebarTrigger sidebarId="editor-context-panel" />
    </div>
  </div>
</template>

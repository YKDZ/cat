<script setup lang="ts">
import { SidebarTrigger } from "@cat/ui";
import { storeToRefs } from "pinia";

import DocumentBreadcrumb from "@/components/DocumentBreadcrumb.vue";
import BranchCombobox from "@/components/shared/BranchCombobox.vue";
import { useEditorContextStore } from "@/stores/editor/context.ts";

const { document, projectId } = storeToRefs(useEditorContextStore());
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebarId="editor" />
    <div class="flex w-full items-center justify-between">
      <div class="flex items-center gap-2">
        <DocumentBreadcrumb v-if="document" :document />
        <BranchCombobox v-if="projectId" :project-id="projectId" />
      </div>
      <SidebarTrigger sidebarId="editor-context-panel" />
    </div>
  </div>
</template>

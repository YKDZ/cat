<script setup lang="ts">
import { SidebarTrigger } from "@cat/ui";
import { storeToRefs } from "pinia";

import BranchCombobox from "@/components/shared/BranchCombobox.vue";
import { useEditorContextStore } from "@/stores/editor/context.ts";

import EditorScopeBar from "./EditorScopeBar.vue";
import EditorStatusFilter from "./EditorStatusFilter.vue";
import ElementSearcher from "./ElementSearcher.vue";

const { projectId } = storeToRefs(useEditorContextStore());
</script>

<template>
  <div
    class="header flex h-12 shrink-0 items-center justify-between border-b px-4"
  >
    <SidebarTrigger sidebarId="editor" />
    <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <EditorScopeBar />
        <ElementSearcher />
        <EditorStatusFilter />
      </div>
      <div class="flex items-center gap-2">
        <BranchCombobox v-if="projectId" :project-id="projectId" />
        <SidebarTrigger sidebarId="editor-context-panel" />
      </div>
    </div>
  </div>
</template>

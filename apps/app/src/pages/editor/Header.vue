<script setup lang="ts">
import { SidebarTrigger } from "@cat/ui";
import { storeToRefs } from "pinia";

import BranchCombobox from "@/components/shared/BranchCombobox.vue";
import { useEditorContextStore } from "@/stores/editor/context.ts";

import EditorScopeBar from "./EditorScopeBar.vue";
import EditorSortModeSelect from "./EditorSortModeSelect.vue";
import EditorStatusFilter from "./EditorStatusFilter.vue";
import ElementSearcher from "./ElementSearcher.vue";

const props = withDefaults(
  defineProps<{
    leftSidebarId?: string;
    rightSidebarId?: string;
    showStatusFilter?: boolean;
  }>(),
  {
    leftSidebarId: "editor",
    rightSidebarId: "editor-context-panel",
    showStatusFilter: true,
  },
);

const { projectId } = storeToRefs(useEditorContextStore());
</script>

<template>
  <div
    class="header flex h-12 shrink-0 items-center justify-between border-b px-4"
  >
    <SidebarTrigger :sidebar-id="props.leftSidebarId" />
    <div class="flex min-w-0 flex-1 items-center justify-between gap-3">
      <div class="flex min-w-0 items-center gap-3">
        <EditorScopeBar />
        <ElementSearcher />
        <EditorSortModeSelect />
        <EditorStatusFilter v-if="props.showStatusFilter" />
        <slot name="extra-controls" />
      </div>
      <div class="flex items-center gap-2">
        <BranchCombobox v-if="projectId" :project-id="projectId" />
        <SidebarTrigger :sidebar-id="props.rightSidebarId" />
      </div>
    </div>
  </div>
</template>

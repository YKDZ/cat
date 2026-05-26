<script setup lang="ts">
import { ScrollArea } from "@cat/ui";

import ContextPanel from "./ContextPanel.vue";
import Header from "./Header.vue";

withDefaults(
  defineProps<{
    leftSidebarId?: string;
    rightSidebarId?: string;
    showEditorStatusFilter?: boolean;
  }>(),
  {
    leftSidebarId: "editor",
    rightSidebarId: "editor-context-panel",
    showEditorStatusFilter: true,
  },
);
</script>

<template>
  <div
    class="flex h-full max-h-full w-full flex-col overflow-hidden md:flex-row"
  >
    <div class="h-full shrink-0">
      <slot name="sidebar" />
    </div>

    <div class="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
      <div class="sticky top-0 z-10 border-b bg-background">
        <Header
          :left-sidebar-id="leftSidebarId"
          :right-sidebar-id="rightSidebarId"
          :show-status-filter="showEditorStatusFilter"
        >
          <template #extra-controls>
            <slot name="header-extra-controls" />
          </template>
        </Header>
      </div>

      <div class="min-h-0 w-full flex-1">
        <ScrollArea class="h-full w-full">
          <slot />
        </ScrollArea>
      </div>
    </div>

    <div
      class="flex h-full w-full shrink-0 flex-col overflow-hidden border-t md:w-auto md:border-t-0 md:border-l"
    >
      <ContextPanel :id="rightSidebarId" />
    </div>
  </div>
</template>

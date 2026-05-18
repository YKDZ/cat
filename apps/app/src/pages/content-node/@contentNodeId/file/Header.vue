<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { SidebarTrigger } from "@cat/ui";

import ContentNodeBreadcrumb from "@/components/ContentNodeBreadcrumb.vue";

const props = defineProps<{
  contentNode: Pick<ContentNode, "displayLabel">;
}>();
</script>

<template>
  <div class="header">
    <SidebarTrigger sidebar-id="index" />
    <ContentNodeBreadcrumb :content-node="props.contentNode" />
  </div>
</template>

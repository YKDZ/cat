<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import ContentNodeTree from "./ContentNodeTree.vue";

const props = defineProps<{
  contentNodes: (ContentNode & {
    parentId: string | null;
    localOrder: number | null;
  })[];
}>();

const emits = defineEmits<{
  (e: "click", node: ContentNode): void;
}>();
</script>

<template>
  <ContentNodeTree
    :content-nodes="props.contentNodes"
    @click="emits('click', $event)"
  >
    <template #actions="slotProps">
      <slot name="actions" :node="slotProps.node" />
    </template>
  </ContentNodeTree>
</template>

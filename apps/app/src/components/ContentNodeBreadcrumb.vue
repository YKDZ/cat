<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { computed } from "vue";

/**
 * @zh 内容节点面包屑属性。
 * @en Props for the content-node breadcrumb.
 */
const props = defineProps<{
  /**
   * @zh 当前内容节点。
   * @en Current content node.
   */
  contentNode: Pick<ContentNode, "displayLabel">;
}>();

const icon = computed(() => "icon-[mdi--file-outline]");
</script>

<template>
  <div class="flex items-center">
    <div class="flex items-center gap-2 text-lg font-bold">
      <span :class="icon" class="inline-block h-6 w-6" />
      <span>{{ contentNode.displayLabel }}</span>
    </div>
  </div>
</template>

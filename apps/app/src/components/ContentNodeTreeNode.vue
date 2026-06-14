<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { computed } from "vue";
import { useI18n } from "vue-i18n";

import type { TreeNode } from "./ContentNodeTree.vue";

const { t } = useI18n();

/**
 * Props for a content node tree node.
 */
const props = defineProps<{
  /**
   * Current tree node.
   */
  node: TreeNode;
  /**
   * Current depth level.
   */
  depth: number;
  /**
   * Expanded node set.
   */
  expandedNodes: Set<string>;
}>();

/**
 * Emits for a content node tree node.
 */
const emits = defineEmits<{
  /**
   * Request toggling the node expansion state.
   */
  (e: "toggle", nodeId: string): void;
  /**
   * Emitted when the node is clicked.
   */
  (e: "click", node: ContentNode): void;
}>();

defineSlots<{
  /**
   * Actions slot rendered on the right side of the node.
   */
  actions(props: { node: ContentNode }): unknown;
}>();

const hasChildren = computed(() => props.node.children.length > 0);
const isExpanded = computed(() => props.expandedNodes.has(props.node.id));

const isDirectoryLike = computed(
  () =>
    props.node.exportRole === "DIRECTORY" ||
    props.node.kind === "DIRECTORY" ||
    props.node.kind === "PROJECT_ROOT",
);

const toggleNode = () => {
  if (hasChildren.value) {
    emits("toggle", props.node.id);
  }
};

const handleClick = () => {
  emits("click", props.node);
};
</script>

<template>
  <div class="w-full">
    <div
      class="group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-background"
      :style="{ paddingLeft: `${(depth - 1) * 1.5 + 0.75}rem` }"
      @click="handleClick"
    >
      <button
        v-if="hasChildren"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-background"
        @click.stop="toggleNode"
      >
        <div
          :class="
            isExpanded
              ? 'icon-[mdi--chevron-down]'
              : 'icon-[mdi--chevron-right]'
          "
          class="size-4 text-foreground"
        />
      </button>
      <div v-else class="h-5 w-5 shrink-0" />

      <div
        :class="
          isDirectoryLike ? 'icon-[mdi--folder]' : 'icon-[mdi--file-outline]'
        "
        class="size-4 shrink-0 text-foreground"
      />

      <span
        class="flex-1 truncate text-sm text-foreground"
        :title="node.displayLabel || t('（未命名）')"
      >
        {{ node.displayLabel || t("（未命名）") }}
      </span>

      <div class="flex shrink-0 items-center gap-1" @click.stop>
        <slot name="actions" :node="node" />
      </div>
    </div>

    <template v-if="hasChildren && isExpanded">
      <ContentNodeTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded-nodes="expandedNodes"
        @toggle="emits('toggle', $event)"
        @click="emits('click', $event)"
      >
        <template #actions="slotProps">
          <slot name="actions" :node="slotProps.node" />
        </template>
      </ContentNodeTreeNode>
    </template>
  </div>
</template>

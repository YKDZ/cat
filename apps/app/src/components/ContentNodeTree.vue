<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { computed, shallowRef } from "vue";
import { useI18n } from "vue-i18n";

import ContentNodeTreeNode from "./ContentNodeTreeNode.vue";

/**
 * @zh 内容节点树组件的属性。
 * @en Props for the content node tree component.
 */
const props = defineProps<{
  /**
   * @zh 扁平内容节点列表。
   * @en Flat content-node list.
   */
  contentNodes: (ContentNode & {
    parentId: string | null;
    localOrder: number | null;
  })[];
}>();

/**
 * @zh 内容节点树组件发出的事件。
 * @en Emits for the content node tree component.
 */
const emits = defineEmits<{
  /**
   * @zh 点击某个内容节点时触发。
   * @en Emitted when a content node is clicked.
   */
  (e: "click", node: ContentNode): void;
}>();

/**
 * @zh 树形内容节点。
 * @en Tree-shaped content node.
 */
export type TreeNode = ContentNode & {
  parentId: string | null;
  localOrder: number | null;
  children: TreeNode[];
};

const { t } = useI18n();

const tree = computed(() => {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  props.contentNodes.forEach((node) => {
    map.set(node.id, { ...node, children: [] });
  });

  props.contentNodes.forEach((node) => {
    const treeNode = map.get(node.id);
    if (!treeNode) return;

    if (node.parentId && map.has(node.parentId)) {
      const parent = map.get(node.parentId);
      parent?.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });

  if (roots.length === 1 && roots[0]?.kind === "PROJECT_ROOT") {
    return roots[0].children;
  }

  return roots;
});

const expandedNodes = shallowRef<Set<string>>(new Set());

const toggleNode = (nodeId: string) => {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId);
    return;
  }
  expandedNodes.value.add(nodeId);
};

const handleClick = (node: ContentNode) => {
  emits("click", node);
};
</script>

<template>
  <div class="w-full overflow-hidden rounded-lg bg-background">
    <template v-for="node in tree" :key="node.id">
      <ContentNodeTreeNode
        :node="node"
        :depth="0"
        :expanded-nodes="expandedNodes"
        @toggle="toggleNode"
        @click="handleClick"
      >
        <template #actions="{ node: actionNode }">
          <slot name="actions" :node="actionNode" />
        </template>
      </ContentNodeTreeNode>
    </template>

    <div
      v-if="tree.length === 0"
      :key="'empty-state'"
      class="flex items-center justify-center py-8 text-foreground"
    >
      <span class="text-sm">{{ t("暂无内容节点") }}</span>
    </div>
  </div>
</template>

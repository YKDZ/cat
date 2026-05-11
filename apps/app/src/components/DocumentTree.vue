<script setup lang="ts">
import type { ContentNode } from "@cat/shared";

import { computed, shallowRef } from "vue";

import DocumentTreeNode from "./DocumentTreeNode.vue";

const props = defineProps<{
  contentNodes: (ContentNode & {
    parentId: string | null;
    localOrder: number | null;
  })[];
}>();

const emits = defineEmits<{
  (e: "click", node: ContentNode): void;
}>();

export type TreeNode = ContentNode & {
  parentId: string | null;
  localOrder: number | null;
  children: TreeNode[];
};

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
      map.get(node.parentId)!.children.push(treeNode);
    } else {
      roots.push(treeNode);
    }
  });

  if (roots.length === 1 && roots[0] && roots[0].kind === "PROJECT_ROOT") {
    return roots[0].children;
  }

  return roots;
});

const expandedNodes = shallowRef<Set<string>>(new Set());

const toggleNode = (nodeId: string) => {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId);
  } else {
    expandedNodes.value.add(nodeId);
  }
};

const handleClick = (node: ContentNode) => {
  emits("click", node);
};
</script>

<template>
  <div class="w-full overflow-hidden rounded-lg bg-background">
    <template v-for="node in tree" :key="node.id">
      <DocumentTreeNode
        :node="node"
        :depth="0"
        :expanded-nodes="expandedNodes"
        @toggle="toggleNode"
        @click="handleClick"
      >
        <template #actions="{ node: actionNode }">
          <slot name="actions" :node="actionNode" />
        </template>
      </DocumentTreeNode>
    </template>

    <div
      v-if="tree.length === 0"
      :key="'empty-state'"
      class="flex items-center justify-center py-8 text-foreground"
    >
      <span class="text-sm">暂无文档</span>
    </div>
  </div>
</template>

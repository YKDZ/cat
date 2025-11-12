<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import { computed, ref } from "vue";
import DocumentTreeNode from "./DocumentTreeNode.vue";

const props = defineProps<{
  documents: (Document & {
    parentId: string | null;
  })[];
}>();

const emits = defineEmits<{
  (e: "click", document: Document): void;
}>();

export type TreeNode = Document & {
  parentId: string | null;
  children: TreeNode[];
};

const tree = computed(() => {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  props.documents.forEach((doc) => {
    map.set(doc.id, { ...doc, children: [] });
  });

  props.documents.forEach((doc) => {
    const node = map.get(doc.id);
    if (!node) return;

    if (doc.parentId && map.has(doc.parentId)) {
      map.get(doc.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  });

  if (roots.length === 1 && roots[0] && roots[0].isDirectory) {
    return roots[0].children;
  }

  return roots;
});

const expandedNodes = ref<Set<string>>(new Set());

const toggleNode = (nodeId: string) => {
  if (expandedNodes.value.has(nodeId)) {
    expandedNodes.value.delete(nodeId);
  } else {
    expandedNodes.value.add(nodeId);
  }
};

const handleClick = (document: Document) => {
  emits("click", document);
};
</script>

<template>
  <div class="w-full bg-background rounded-lg overflow-hidden">
    <template v-for="node in tree" :key="node.id">
      <DocumentTreeNode
        :node="node"
        :depth="0"
        :expanded-nodes="expandedNodes"
        @toggle="toggleNode"
        @click="handleClick"
      >
        <template #actions="{ document }">
          <slot name="actions" :document />
        </template>
      </DocumentTreeNode>
    </template>

    <div
      v-if="tree.length === 0"
      class="flex items-center justify-center py-8 text-foreground"
    >
      <span class="text-sm">暂无文档</span>
    </div>
  </div>
</template>

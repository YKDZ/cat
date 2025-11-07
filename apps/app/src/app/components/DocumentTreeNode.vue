<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import type { TreeNode } from "./DocumentTree.vue";
import type { Document } from "@cat/shared/schema/drizzle/document";

const props = defineProps<{
  node: TreeNode;
  depth: number;
  expandedNodes: Set<string>;
}>();

const emits = defineEmits<{
  (e: "toggle", nodeId: string): void;
  (e: "click", document: Document): void;
}>();

defineSlots<{
  actions(props: { document: Document }): unknown;
}>();

const hasChildren = computed(() => props.node.children.length > 0);
const isExpanded = computed(() => props.expandedNodes.has(props.node.id));

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
    <!-- 当前节点 -->
    <div
      class="flex items-center gap-2 px-3 py-2 hover:bg-highlight-darker cursor-pointer group transition-colors"
      :style="{ paddingLeft: `${(depth - 1) * 1.5 + 0.75}rem` }"
      @click="handleClick"
    >
      <!-- 展开/折叠图标 -->
      <button
        v-if="hasChildren"
        @click.stop="toggleNode"
        class="shrink-0 w-5 h-5 flex items-center justify-center hover:bg-highlight-darkest rounded transition-colors"
      >
        <Icon
          small
          :icon="
            isExpanded
              ? 'icon-[mdi--chevron-down]'
              : 'icon-[mdi--chevron-right]'
          "
          class="text-highlight-content"
        />
      </button>
      <div v-else class="w-5 h-5 shrink-0"></div>

      <!-- 文件/文件夹图标 -->
      <Icon
        small
        :icon="
          node.isDirectory
            ? 'icon-[mdi--folder]'
            : 'icon-[mdi--file-document-outline]'
        "
        class="text-highlight-content shrink-0"
      />

      <!-- 文档名称 -->
      <span
        class="flex-1 text-sm text-highlight-content-darker truncate"
        :title="node.name || '未命名'"
      >
        {{ node.name || "未命名" }}
      </span>

      <!-- 右侧按钮栏(具名插槽) -->
      <div class="shrink-0 flex items-center gap-1" @click.stop>
        <slot name="actions" :document="node" />
      </div>
    </div>

    <!-- 子节点(递归) -->
    <template v-if="hasChildren && isExpanded">
      <DocumentTreeNode
        v-for="child in node.children"
        :key="child.id"
        :node="child"
        :depth="depth + 1"
        :expanded-nodes="expandedNodes"
        @toggle="emits('toggle', $event)"
        @click="emits('click', $event)"
      >
        <!-- 将插槽继续传递给子节点 -->
        <template #actions="slotProps">
          <slot name="actions" :document="slotProps.document" />
        </template>
      </DocumentTreeNode>
    </template>
  </div>
</template>

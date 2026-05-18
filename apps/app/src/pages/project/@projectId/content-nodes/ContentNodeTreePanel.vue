<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import ContentNodeTree from "@/components/ContentNodeTree.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast";

const props = defineProps<{
  project: Pick<Project, "id">;
  contentNodes: (ContentNode & {
    parentId: string | null;
    localOrder: number | null;
  })[];
}>();

const { info } = useToastStore();
const { t } = useI18n();

const handleClick = async (
  node: Pick<
    ContentNode,
    "id" | "exportRole" | "kind" | "fileId" | "fileHandlerId"
  >,
) => {
  if (node.fileId !== null && node.fileHandlerId !== null) {
    await navigate(`/content-node/${node.id}/file`);
  }
};

const handleDelete = async (node: Pick<ContentNode, "id" | "displayLabel">) => {
  await orpc.contentNode.del({ contentNodeId: node.id });
  info(t("成功删除内容节点 {name}", { name: node.displayLabel }));
};
</script>

<template>
  <ContentNodeTree :content-nodes="props.contentNodes" @click="handleClick">
    <template #actions="{ node }">
      <Button
        v-if="node.fileId !== null && node.fileHandlerId !== null"
        variant="outline"
        size="icon"
        @click="handleDelete(node)"
      >
        <div class="icon-[mdi--delete] size-4 text-destructive" />
      </Button>
    </template>
  </ContentNodeTree>
</template>

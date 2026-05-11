<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import DocumentTree from "@/components/DocumentTree.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast";

defineProps<{
  project: Pick<Project, "id">;
  documents: (ContentNode & {
    parentId: string | null;
    localOrder: number | null;
  })[];
}>();

const { info } = useToastStore();
const { t } = useI18n();

const handleClick = async (
  node: Pick<ContentNode, "id" | "exportRole" | "kind">,
) => {
  if (node.exportRole === "FILE" || node.kind === "FILE") {
    await navigate(`/document/${node.id}`);
  }
};

const handleDelete = async (node: Pick<ContentNode, "id" | "displayLabel">) => {
  await orpc.document.del({ id: node.id });
  info(t("成功删除文档 {name}", { name: node.displayLabel }));
};
</script>

<template>
  <DocumentTree :content-nodes="documents" @click="handleClick">
    <template #actions="{ node }">
      <Button
        v-if="node.exportRole === 'FILE' || node.kind === 'FILE'"
        variant="outline"
        size="icon"
        @click="handleDelete(node)"
      >
        <div class="icon-[mdi--delete] size-4 text-destructive" />
      </Button>
    </template>
  </DocumentTree>
</template>

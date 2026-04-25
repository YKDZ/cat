<script setup lang="ts">
import type { Document } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";

import DocumentTree from "@/app/components/DocumentTree.vue";
import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast";

defineProps<{
  project: Pick<Project, "id">;
  documents: (Document & {
    parentId: string | null;
  })[];
}>();

const { info } = useToastStore();
const { t } = useI18n();

const handleClick = async (document: Pick<Document, "id" | "isDirectory">) => {
  if (!document.isDirectory) await navigate(`/document/${document.id}`);
};

const handleDelete = async (document: Pick<Document, "id" | "name">) => {
  await orpc.document.del({ id: document.id });
  info(t("成功删除文档 {name}", { name: document.name }));
};
</script>

<template>
  <DocumentTree :documents @click="handleClick">
    <template #actions="{ document }">
      <Button
        v-if="!document.isDirectory"
        variant="outline"
        size="icon"
        @click="handleDelete(document)"
      >
        <div class="icon-[mdi--delete] size-4 text-destructive" />
      </Button>
    </template>
  </DocumentTree>
</template>

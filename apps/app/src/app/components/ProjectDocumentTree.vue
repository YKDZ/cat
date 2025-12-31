<script setup lang="ts">
import { orpc } from "@/server/orpc";
import type { Project } from "@cat/shared/schema/drizzle/project";
import DocumentTree from "./DocumentTree.vue";
import { navigate } from "vike/client/router";
import type { Document } from "@cat/shared/schema/drizzle/document";
import { Button } from "./ui/button";
import { useToastStore } from "../stores/toast";
import { useI18n } from "vue-i18n";

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

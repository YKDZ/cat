<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import DocumentTree from "./DocumentTree.vue";
import { useToastStore } from "../stores/toast";
import { useI18n } from "vue-i18n";
import { navigate } from "vike/client/router";
import { trpc } from "@cat/app-api/trpc/client";
import ProjectLanguageDocumentAutoApproveBtn from "./ProjectLanguageDocumentAutoApproveBtn.vue";
import ProjectLanguageDocumentAutoTranslateBtn from "./ProjectLanguageDocumentAutoTranslateBtn.vue";
import Button from "./ui/button/Button.vue";
import type { Project } from "@cat/shared/schema/drizzle/project";
import { computedAsync } from "@vueuse/core";

const props = defineProps<{
  project: Pick<Project, "id">;
  language: Pick<Language, "id">;
}>();

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const documents = computedAsync(async () => {
  return await trpc.project.getDocuments.query({ projectId: props.project.id });
}, []);

const handleEdit = async (document: Pick<Document, "id">) => {
  await navigate(`/editor/${document.id}/${props.language.id}/auto`);
};

const handleExportTranslated = async (document: Pick<Document, "id">) => {
  await trpc.document.exportTranslatedFile
    .query({
      documentId: document.id,
      languageId: props.language.id,
    })
    .then(() => {
      info(t("成功创建导出任务"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <DocumentTree :documents="documents" @click="handleEdit">
    <template #actions="{ document }">
      <ProjectLanguageDocumentAutoApproveBtn :document />
      <ProjectLanguageDocumentAutoTranslateBtn :document />
      <Button
        @click="handleExportTranslated(document)"
        variant="outline"
        size="icon"
      >
        <div class="icon-[mdi--download] size-4" />
      </Button>
    </template>
  </DocumentTree>
</template>

<script setup lang="ts">
import { navigate } from "vike/client/router";
import { useI18n } from "vue-i18n";
import { trpc } from "@cat/app-api/trpc/client";
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Project } from "@cat/shared/schema/drizzle/project";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import DocumentTranslationProgress from "./DocumentTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import ProjectLanguageDocumentAutoApproveBtn from "./ProjectLanguageDocumentAutoApproveBtn.vue";
import ProjectLanguageDocumentAutoTranslateBtn from "./ProjectLanguageDocumentAutoTranslateBtn.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";

const props = defineProps<{
  document: Document;
  project: Project;
  language: Language;
}>();

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const handleEdit = async () => {
  await navigate(`/editor/${props.document.id}/${props.language.id}/auto`);
};

const handleExportTranslated = async () => {
  await trpc.document.exportTranslatedFile
    .query({
      documentId: props.document.id,
      languageId: props.language.id,
    })
    .then(() => {
      info(t("成功创建导出任务"));
    })
    .catch(trpcWarn);
};
</script>

<template>
  <TableRow
    class="cursor-pointer hover:bg-highlight-darker"
    @click="handleEdit"
  >
    <TableCell>{{ document.name }}</TableCell>
    <TableCell>
      <DocumentTranslationProgress
        v-if="language"
        :document-id="document.id"
        :language-id="language.id"
    /></TableCell>
    <TableCell>
      <div class="flex gap-1 items-center">
        <HButton
          :classes="{
            base: 'btn btn-md btn-base btn-square',
            icon: 'btn-icon btn-icon-md',
          }"
          icon="i-mdi:download"
          @click.stop="handleExportTranslated"
        />
        <ProjectLanguageDocumentAutoApproveBtn :document />
        <ProjectLanguageDocumentAutoTranslateBtn :document />
      </div>
    </TableCell>
  </TableRow>
</template>

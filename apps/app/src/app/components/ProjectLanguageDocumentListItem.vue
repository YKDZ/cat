<script setup lang="ts">
import type { Document } from "@cat/shared/schema/prisma/document";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { useI18n } from "vue-i18n";
import DocumentTranslationProgress from "./DocumentTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import ProjectLanguageDocumentAutoApproveBtn from "./ProjectLanguageDocumentAutoApproveBtn.vue";
import ProjectLanguageDocumentAutoTranslateBtn from "./ProjectLanguageDocumentAutoTranslateBtn.vue";
import HButton from "./headless/HButton.vue";
import { useToastStore } from "@/app/stores/toast.ts";
import { trpc } from "@/server/trpc/client.ts";
import { languageKey, projectKey } from "@/app/utils/provide.ts";

const props = defineProps<{
  document: Document;
}>();

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const project = inject(projectKey);
const language = inject(languageKey);

const handleEdit = async () => {
  if (!project || !language || !language.value) return;

  await navigate(
    `/editor/${props.document.id}/${project.SourceLanguage?.id}-${language.value.id}/auto`,
  );
};

const handleExportTranslated = async () => {
  if (!language || !language.value) return;

  await trpc.document.exportTranslatedFile
    .query({
      documentId: props.document.id,
      languageId: language.value.id,
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
    <TableCell>{{ document.File?.originName }}</TableCell>
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

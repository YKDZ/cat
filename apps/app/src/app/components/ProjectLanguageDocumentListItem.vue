<script setup lang="ts">
import type { Document } from "@cat/shared";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { languageKey, projectKey } from "../utils/provide";
import DocumentTranslationProgress from "./DocumentTranslationProgress.vue";
import TableCell from "./table/TableCell.vue";
import TableRow from "./table/TableRow.vue";
import { trpc } from "@/server/trpc/client";
import Button from "./Button.vue";
import { useToastStore } from "../stores/toast";
import ProjectLanguageDocumentAutoApproveBtn from "./ProjectLanguageDocumentAutoApproveBtn.vue";
import ProjectLanguageDocumentAutoTranslateBtn from "./ProjectLanguageDocumentAutoTranslateBtn.vue";
import { useI18n } from "vue-i18n";

const props = defineProps<{
  document: Document;
}>();

const { info, trpcWarn } = useToastStore();
const { t } = useI18n();

const project = inject(projectKey);
const language = inject(languageKey);

const handleEdit = () => {
  if (!project || !project.value || !language || !language.value) return;

  navigate(
    `/editor/${props.document.id}/${project.value.SourceLanguage?.id}-${language.value.id}/auto`,
  );
};

const handleExportTranslated = async () => {
  if (!language || !language.value) return;

  await trpc.document.exportTranslatedFile
    .query({
      id: props.document.id,
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
        <Button
          no-text
          icon="i-mdi:download"
          @click.stop="handleExportTranslated"
        />
        <ProjectLanguageDocumentAutoApproveBtn :document />
        <ProjectLanguageDocumentAutoTranslateBtn :document />
      </div>
    </TableCell>
  </TableRow>
</template>

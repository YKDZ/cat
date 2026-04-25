<script setup lang="ts">
import type { Document } from "@cat/shared";
import type { Language } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { useI18n } from "vue-i18n";

import DocumentTranslationProgress from "@/app/components/DocumentTranslationProgress.vue";
import DocumentTree from "@/app/components/DocumentTree.vue";
import { orpc } from "@/app/rpc/orpc";
import { useToastStore } from "@/app/stores/toast";
import { useInjectionKey } from "@/app/utils/provide";

import type { Data } from "../../+data.server";

import LanguageDocumentAutoApproveBtn from "./LanguageDocumentAutoApproveBtn.vue";
import LanguageDocumentAutoTranslateBtn from "./LanguageDocumentAutoTranslateBtn.vue";

const props = defineProps<{
  project: Pick<Project, "id">;
  language: Pick<Language, "id">;
}>();

const { info, rpcWarn } = useToastStore();
const { t } = useI18n();

const documents = inject(useInjectionKey<Data>()("documents"))!;

const handleEdit = async (document: Pick<Document, "id">) => {
  await navigate(`/editor/${document.id}/${props.language.id}/auto`);
};

const handleExportTranslated = async (document: Pick<Document, "id">) => {
  await orpc.document
    .exportTranslatedFile({
      documentId: document.id,
      languageId: props.language.id,
    })
    .then(() => {
      info(t("成功创建导出任务"));
    })
    .catch(rpcWarn);
};
</script>

<template>
  <DocumentTree :documents @click="handleEdit">
    <template #actions="{ document }">
      <DocumentTranslationProgress :document :language />
      <LanguageDocumentAutoApproveBtn :document :language />
      <LanguageDocumentAutoTranslateBtn :document :language />
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

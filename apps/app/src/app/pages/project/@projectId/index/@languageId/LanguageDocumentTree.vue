<script setup lang="ts">
import type { Document } from "@cat/shared/schema/drizzle/document";
import type { Language } from "@cat/shared/schema/drizzle/misc";
import DocumentTree from "@/app/components/DocumentTree.vue";
import { useToastStore } from "@/app/stores/toast";
import { useI18n } from "vue-i18n";
import { navigate } from "vike/client/router";
import { orpc } from "@/server/orpc";
import LanguageDocumentAutoApproveBtn from "./LanguageDocumentAutoApproveBtn.vue";
import LanguageDocumentAutoTranslateBtn from "./LanguageDocumentAutoTranslateBtn.vue";
import Button from "@/app/components/ui/button/Button.vue";
import type { Project } from "@cat/shared/schema/drizzle/project";
import DocumentTranslationProgress from "@/app/components/DocumentTranslationProgress.vue";
import { inject } from "vue";
import { useInjectionKey } from "@/app/utils/provide";
import type { Data } from "../../+data.server";

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

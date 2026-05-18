<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Language } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { useI18n } from "vue-i18n";

import ContentNodeTree from "@/components/ContentNodeTree.vue";
import DocumentTranslationProgress from "@/components/DocumentTranslationProgress.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast";
import { useInjectionKey } from "@/utils/provide";

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

const handleEdit = async (node: Pick<ContentNode, "id">) => {
  await navigate(
    `/editor/project/${props.project.id}/${props.language.id}/auto?nodes=${node.id}`,
  );
};

const handleExportTranslated = async (node: Pick<ContentNode, "id">) => {
  await orpc.document
    .exportTranslatedFile({
      documentId: node.id,
      languageId: props.language.id,
    })
    .then(() => {
      info(t("成功创建导出任务"));
    })
    .catch(rpcWarn);
};
</script>

<template>
  <ContentNodeTree :content-nodes="documents" @click="handleEdit">
    <template #actions="{ node }">
      <DocumentTranslationProgress :document="node" :language />
      <LanguageDocumentAutoApproveBtn :document="node" :language />
      <LanguageDocumentAutoTranslateBtn :document="node" :language />
      <Button
        @click="handleExportTranslated(node)"
        variant="outline"
        size="icon"
      >
        <div class="icon-[mdi--download] size-4" />
      </Button>
    </template>
  </ContentNodeTree>
</template>

<script setup lang="ts">
import type { ContentNode } from "@cat/shared";
import type { Language } from "@cat/shared";
import type { Project } from "@cat/shared";

import { Button } from "@cat/ui";
import { navigate } from "vike/client/router";
import { inject } from "vue";
import { useI18n } from "vue-i18n";

import ContentNodeTranslationProgress from "@/components/ContentNodeTranslationProgress.vue";
import ContentNodeTree from "@/components/ContentNodeTree.vue";
import { orpc } from "@/rpc/orpc";
import { useToastStore } from "@/stores/toast";
import { useInjectionKey } from "@/utils/provide";

import type { Data } from "../../+data.server";

import LanguageContentNodeAutoApproveBtn from "./LanguageContentNodeAutoApproveBtn.vue";
import LanguageContentNodeAutoTranslateBtn from "./LanguageContentNodeAutoTranslateBtn.vue";

const props = defineProps<{
  project: Pick<Project, "id">;
  language: Pick<Language, "id">;
}>();

const { info, rpcWarn } = useToastStore();
const { t } = useI18n();

const contentNodes = inject(useInjectionKey<Data>()("contentNodes"))!;

const handleEdit = async (node: Pick<ContentNode, "id">) => {
  await navigate(
    `/editor/project/${props.project.id}/${props.language.id}/auto?nodes=${node.id}`,
  );
};

const handleExportTranslated = async (
  node: Pick<ContentNode, "id" | "fileId" | "fileHandlerId">,
) => {
  if (node.fileId === null || node.fileHandlerId === null) {
    return;
  }

  await orpc.file
    .exportTranslated({
      contentNodeId: node.id,
      languageId: props.language.id,
    })
    .then(() => {
      info(t("成功创建导出任务"));
    })
    .catch(rpcWarn);
};
</script>

<template>
  <ContentNodeTree :content-nodes="contentNodes" @click="handleEdit">
    <template #actions="{ node }">
      <ContentNodeTranslationProgress :content-node="node" :language />
      <LanguageContentNodeAutoApproveBtn :content-node="node" :language />
      <LanguageContentNodeAutoTranslateBtn :content-node="node" :language />
      <Button
        v-if="node.fileId !== null && node.fileHandlerId !== null"
        variant="outline"
        size="icon"
        :aria-label="t('导出翻译后文件')"
        :title="t('导出翻译后文件')"
        @click="handleExportTranslated(node)"
      >
        <div class="icon-[mdi--download] size-4" />
      </Button>
    </template>
  </ContentNodeTree>
</template>

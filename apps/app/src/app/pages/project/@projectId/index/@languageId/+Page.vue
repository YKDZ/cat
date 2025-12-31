<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { inject, provide } from "vue";
import type { Data } from "../../+data.server.ts";
import { languageKey, useInjectionKey } from "@/app/utils/provide.ts";
import ProjectLanguageDocumentTree from "@/app/components/ProjectLanguageDocumentTree.vue";
import { Button } from "@/app/components/ui/button/index.ts";
import { useI18n } from "vue-i18n";
import { computedAsyncClient } from "@/app/utils/vue.ts";
import { orpc } from "@/server/orpc";
import TranslationProgress from "@/app/pages/project/@projectId/index/TranslationProgress.vue";

const ctx = usePageContext();
const { t } = useI18n();

const project = inject(useInjectionKey<Data>()("project"))!;

const language = computedAsyncClient(async () => {
  if (!ctx.routeParams.languageId) return null;

  return await orpc.language.get({
    languageId: ctx.routeParams.languageId,
  });
}, null);

provide(languageKey, language);

const handleBack = async () => {
  if (!project) return;
  await navigate(`/project/${project.id}`);
};
</script>

<template>
  <div class="flex flex-col w-full">
    <div class="py-4 flex gap-4 w-full items-center justify-between">
      <div class="flex gap-4 items-center">
        <Button @click="handleBack" size="icon" class="cursor-pointer">
          <div class="icon-[mdi--arrow-left] size-4" />
        </Button>
        <h3 v-if="language" class="text-xl font-bold">{{ t(language.id) }}</h3>
      </div>
      <TranslationProgress v-if="project && language" :language :project />
    </div>
    <ProjectLanguageDocumentTree v-if="language" :project="project" :language />
  </div>
</template>

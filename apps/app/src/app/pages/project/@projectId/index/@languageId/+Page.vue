<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, inject, provide } from "vue";
import type { Data } from "../../+data.server.ts";
import { languageKey, useInjectionKey } from "@/app/utils/provide.ts";
import { useLanguageStore } from "@/app/stores/language.ts";
import ProjectTranslationProgress from "@/app/components/ProjectTranslationProgress.vue";
import ProjectLanguageDocumentTree from "@/app/components/ProjectLanguageDocumentTree.vue";
import { Button } from "@/app/components/ui/button/index.ts";
import { useI18n } from "vue-i18n";

const ctx = usePageContext();
const { languages } = storeToRefs(useLanguageStore());
const { t } = useI18n();

const project = inject(useInjectionKey<Data>()("project"))!;

const language = computed(() => {
  return (
    languages.value.find(
      (language) => language.id === ctx.routeParams.languageId,
    ) ?? null
  );
});

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
      <ProjectTranslationProgress
        v-if="project && language"
        :language
        :project
      />
    </div>
    <ProjectLanguageDocumentTree v-if="language" :project="project" :language />
  </div>
</template>

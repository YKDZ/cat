<script setup lang="ts">
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, inject } from "vue";
import type { Data } from "../../+data.server.ts";
import { useInjectionKey } from "@/app/utils/provide.ts";
import LanguageDocumentTree from "./LanguageDocumentTree.vue";
import { Button } from "@/app/components/ui/button";
import { useI18n } from "vue-i18n";
import TranslationProgress from "../TranslationProgress.vue";

const ctx = usePageContext();
const { t } = useI18n();

const project = inject(useInjectionKey<Data>()("project"))!;
const targetLanguages = inject(useInjectionKey<Data>()("targetLanguages"))!;

const language = computed(() => {
  const language = targetLanguages.find(
    (lang) => lang.id === ctx.routeParams?.languageId,
  );
  if (!language) throw new Error("Language not found");
  return language;
});

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
        <h3 class="text-xl font-bold">{{ t(language.id) }}</h3>
      </div>
      <TranslationProgress :language :project />
    </div>
    <LanguageDocumentTree :project="project" :language />
  </div>
</template>

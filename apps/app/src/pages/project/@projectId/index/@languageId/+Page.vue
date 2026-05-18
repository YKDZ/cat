<script setup lang="ts">
import { Button } from "@cat/ui";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, inject } from "vue";
import { useI18n } from "vue-i18n";

import { useInjectionKey } from "@/utils/provide.ts";

import type { Data } from "../../+data.server.ts";

import TranslationProgress from "../TranslationProgress.vue";
import LanguageContentNodeTree from "./LanguageContentNodeTree.vue";

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

const handleOpenWorkbench = async () => {
  await navigate(`/editor/project/${project.id}/${language.value.id}/auto`);
};
</script>

<template>
  <div class="flex w-full flex-col">
    <div class="flex w-full items-center justify-between gap-4 py-4">
      <div class="flex items-center gap-4">
        <Button @click="handleBack" size="icon" class="cursor-pointer">
          <div class="icon-[mdi--arrow-left] size-4" />
        </Button>
        <h3 class="text-xl font-bold">{{ t(language.id) }}</h3>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" @click="handleOpenWorkbench">
          <div class="icon-[mdi--text-box-edit-outline] size-4" />
          {{ t("打开编辑工作台") }}
        </Button>
        <TranslationProgress :language :project />
      </div>
    </div>
    <LanguageContentNodeTree :project="project" :language />
  </div>
</template>

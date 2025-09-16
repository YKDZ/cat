<script setup lang="ts">
import { storeToRefs } from "pinia";
import { usePageContext } from "vike-vue/usePageContext";
import { navigate } from "vike/client/router";
import { computed, onMounted, provide, ref, watch } from "vue";
import { useData } from "vike-vue/useData";
import type { Data } from "./+data.ts";
import { languageKey } from "@/app/utils/provide.ts";
import { useLanguageStore } from "@/app/stores/language.ts";
import ProjectTranslationProgress from "@/app/components/ProjectTranslationProgress.vue";
import ProjectLanguageDocumentList from "@/app/components/ProjectLanguageDocumentList.vue";
import HButton from "@/app/components/headless/HButton.vue";

const ctx = usePageContext();
const { project } = useData<Data>();
const languageId = ref<string>(ctx.routeParams.languageId);
const { update } = useLanguageStore();
const { languages } = storeToRefs(useLanguageStore());

const language = computed(() => {
  return (
    languages.value.find((language) => language.id === languageId.value) ?? null
  );
});

provide(languageKey, language);

const handleBack = async () => {
  if (!project) return;
  await navigate(`/project/${project.id}`);
};

watch(
  () => ctx.routeParams.languageId,
  () => {
    languageId.value = ctx.routeParams.languageId;
  },
  { immediate: true },
);

onMounted(update);
</script>

<template>
  <div class="flex flex-col w-full">
    <div class="py-4 flex gap-4 w-full items-center justify-between">
      <div class="flex gap-4 items-center">
        <HButton
          :classes="{
            base: 'btn btn-md btn-base btn-square',
          }"
          icon="i-mdi:arrow-left"
          @click="handleBack"
        />
        <h3 v-if="language" class="text-xl font-bold">{{ language.name }}</h3>
      </div>
      <ProjectTranslationProgress
        v-if="project"
        :language-id="languageId"
        :project-id="project.id"
      />
    </div>
    <ProjectLanguageDocumentList
      v-if="project.Documents"
      :documents="project.Documents"
    />
  </div>
</template>
